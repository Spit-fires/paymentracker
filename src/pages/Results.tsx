import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../state/AppContext'
import { fetchResultPdf, namesMatch, resultFileName, extractExamId, extractSid, getSsacSession, setSsacSession, getSsacCreds, setSsacCreds } from '../lib/ssac'
import { saveResultFile } from '../lib/sync'
import { log } from '../lib/logs'
import { Card, PageHeader, EmptyState, Button, Select, Input, Spinner, cx } from '../components/ui'
import { IconDownload, IconTrash, IconPlus, IconCheck } from '../components/Icons'
import type { Student, ExamMapping } from '../types'

type Phase =
  | { kind: 'fetching' | 'uploading' }
  | { kind: 'saved' | 'empty' | 'skipped' }
  | { kind: 'mismatch' | 'error'; msg: string }

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))

/** Be nice to the school server - strictly sequential with pauses. */
const GAP_MS = 3000

export function Results() {
  const {
    students,
    examMappings,
    examResults,
    saveExamMapping,
    deleteExamMapping,
    upsertExamResult,
    syncNow,
    showToast,
  } = useApp()

  const batches = useMemo(
    () =>
      Array.from(new Set(students.filter((s) => !s.deletedAt).map((s) => s.batch))).filter(Boolean).sort(),
    [students],
  )
  const [batch, setBatch] = useState('')
  const [examId, setExamId] = useState('')
  const [checked, setChecked] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [phases, setPhases] = useState<Record<string, Phase>>({})
  const [summary, setSummary] = useState('')
  // re-runs skip already-saved PDFs (overwrite happens only when re-fetched)
  const [redownload, setRedownload] = useState(false)
  // school-site session cookie (teacher pastes once) - the CMS only renders
  // marks for logged-in sessions; stored on this device only, never synced
  const [sessInput, setSessInput] = useState(() => getSsacSession())
  const [sessSaved, setSessSaved] = useState(() => !!getSsacSession())
  // school-login overwrite (username + password) - wins over the hardcoded
  // defaults field by field; same device-only storage
  const [credUser, setCredUser] = useState(() => getSsacCreds().user)
  const [credPass, setCredPass] = useState(() => getSsacCreds().pass)
  const [credSaved, setCredSaved] = useState(() => !!(getSsacCreds().user || getSsacCreds().pass))
  const stopRef = useRef(false)
  // name-mismatch PDFs stay in memory so "save anyway" needs no re-fetch
  const pendingBlobs = useRef(new Map<string, { blob: Blob; siteName: string; resolvedSid?: string }>())

  // default batch: first one with mappings, else first batch at all
  useEffect(() => {
    if (batch) return
    const withMaps = batches.filter((b) => examMappings.some((m) => m.batch === b))
    setBatch(withMaps[0] || batches[0] || '')
  }, [batch, batches, examMappings])

  const mapsForBatch = useMemo(
    () =>
      examMappings
        .filter((m) => m.batch === batch)
        .sort((a, b) => a.examLabel.localeCompare(b.examLabel)),
    [examMappings, batch],
  )
  const mapping = mapsForBatch.find((m) => m.examId === examId)

  // default exam when the batch (or its mappings) change
  useEffect(() => {
    if (!mapsForBatch.length) {
      setExamId('')
      return
    }
    if (!mapsForBatch.some((m) => m.examId === examId)) setExamId(mapsForBatch[0].examId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch, mapsForBatch])

  const batchStudents = useMemo(
    () =>
      students
        .filter((s) => !s.deletedAt && !s.archived && s.batch === batch)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [students, batch],
  )

  // everyone pre-checked whenever the batch changes
  useEffect(() => {
    setChecked(batchStudents.map((s) => s.id))
    setPhases({})
    setSummary('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch])

  const resultFor = (studentId: string, eId: string) =>
    examResults.find((r) => r.studentId === studentId && r.examId === eId)

  const setPhase = (id: string, p: Phase) => setPhases((prev) => ({ ...prev, [id]: p }))

  const storePdf = async (
    st: Student,
    map: ExamMapping,
    sid: string,
    blob: Blob,
    note?: string,
  ): Promise<void> => {
    setPhase(st.id, { kind: 'uploading' })
    const rowId = `${st.id}_${map.examId}`
    const fileName = resultFileName(map.examLabel, map.examId)
    const existing = examResults.find((r) => r.id === rowId && r.status === 'ok' && r.fileId)
    const fileId = await saveResultFile(st.id, fileName, blob, existing?.fileId)
    await upsertExamResult({
      id: rowId,
      studentId: st.id,
      examId: map.examId,
      examLabel: map.examLabel,
      sid,
      fileId,
      fileName,
      fetchedAt: Date.now(),
      status: 'ok',
      note,
    })
    setPhase(st.id, { kind: 'saved' })
  }

  /** 3 students at once - the proxy renders each in its own invocation, and
   *  the shared rate limit still caps total throughput. */
  const CONCURRENCY = 3

  const run = async (onlyIds?: string[]) => {
    if (!mapping || running) return
    if (!checked.length && !onlyIds?.length) {
      showToast('Select at least one student', 'err')
      return
    }
    setRunning(true)
    stopRef.current = false
    setSummary('')
    const sessCookie = getSsacSession().trim() || undefined
    const stored = getSsacCreds()
    const creds =
      stored.user.trim() || stored.pass ? { user: stored.user.trim(), pass: stored.pass } : undefined
    const forceAll = redownload || !!onlyIds
    const targets = batchStudents.filter((s) =>
      onlyIds ? onlyIds.includes(s.id) : checked.includes(s.id),
    )
    let saved = 0
    let empty = 0
    let errors = 0
    let skipped = 0
    let mismatched = 0
    let alreadySaved = 0
    const processOne = async (st: Student) => {
      const sid = st.ssacId?.trim()
      if (!sid) {
        setPhase(st.id, { kind: 'skipped' })
        skipped++
        return
      }
      setPhase(st.id, { kind: 'fetching' })
      try {
        const res = await fetchResultPdf(mapping.examId, sid, sessCookie, creds, mapping.printView)
        if (res.status === 'empty') {
          await upsertExamResult({
            id: `${st.id}_${mapping.examId}`,
            studentId: st.id,
            examId: mapping.examId,
            examLabel: mapping.examLabel,
            sid,
            fetchedAt: Date.now(),
            status: 'empty',
            note: res.hint || 'page published but no marks yet',
          })
          setPhase(st.id, { kind: 'empty' })
          empty++
        } else if (res.status === 'error') {
          await upsertExamResult({
            id: `${st.id}_${mapping.examId}`,
            studentId: st.id,
            examId: mapping.examId,
            examLabel: mapping.examLabel,
            sid,
            fetchedAt: Date.now(),
            status: 'error',
            note: res.reason,
          })
          setPhase(st.id, { kind: 'error', msg: res.reason })
          log('warn', `Result fetch failed for ${st.name}`, res.reason)
          errors++
        } else if (!namesMatch(st.name, res.siteName)) {
          if (!res.siteName) {
            // no name extracted at all - can't confirm identity, hold it
            pendingBlobs.current.set(st.id, { blob: res.pdf, siteName: '', resolvedSid: res.resolvedSid })
            setPhase(st.id, { kind: 'mismatch', msg: 'unnamed' })
            log('warn', `Result name unreadable for ${st.name}`, 'held for review')
            mismatched++
          } else {
            // intentional differences (test records, spelling variants) - save
            // anyway but keep the site's name on the row so it stays visible
            await storePdf(st, mapping, res.resolvedSid || sid, res.pdf, `site says "${res.siteName}"`)
            log('warn', `Result saved for ${st.name} despite name difference`, `site says "${res.siteName}"`)
            saved++
          }
        } else {
          // stored values are printed student IDs - the proxy retries with
          // the resolved system id and reports it back; freeze that sid
          await storePdf(st, mapping, res.resolvedSid || sid, res.pdf)
          saved++
        }
      } catch (e) {
        const reason = e instanceof Error ? e.message : 'upload failed'
        setPhase(st.id, { kind: 'error', msg: reason })
        log('warn', `Result store failed for ${st.name}`, reason)
        errors++
      }
    }
    // reruns skip what's already saved (overwrite only happens on re-fetch);
    // retry runs and the re-download toggle force everything through
    const queue = targets.filter((st) => {
      if (forceAll) return true
      const row = resultFor(st.id, mapping.examId)
      if (row?.status === 'ok' && row.fileId) {
        alreadySaved++
        return false
      }
      return true
    })
    const workers = Array.from(
      { length: Math.min(CONCURRENCY, queue.length) },
      async (_, w) => {
        if (w > 0) await sleep(1200 * w) // stagger starts, no thundering herd
        while (!stopRef.current) {
          const st = queue.shift()
          if (!st) break
          await processOne(st)
          await sleep(GAP_MS)
        }
      },
    )
    await Promise.all(workers)
    const stopped = stopRef.current
    const line =
      `${saved} saved · ${empty} empty · ${mismatched} mismatched · ${errors} errors · ${skipped} skipped` +
      (alreadySaved ? ` · ${alreadySaved} already saved` : '') +
      (stopped ? ' · stopped' : '')
    setSummary(line)
    log('sync', `Result run finished (${mapping.examLabel})`, line)
    showToast(stopped ? `Stopped — ${line}` : line, errors || mismatched ? 'info' : 'ok')
    setRunning(false)
    // push the metadata rows once at the end, not per student
    await syncNow()
  }

  const failedIds = useMemo(
    () =>
      batchStudents
        .filter((s) => {
          const p = phases[s.id]
          return p?.kind === 'error' || resultFor(s.id, examId)?.status === 'error'
        })
        .map((s) => s.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phases, examResults, batchStudents, examId],
  )

  const onSaveAnyway = async (st: Student) => {
    if (!mapping || running) return
    const pend = pendingBlobs.current.get(st.id)
    if (!pend) return
    const sid = pend.resolvedSid || st.ssacId?.trim() || ''
    try {
      await storePdf(st, mapping, sid, pend.blob, `saved despite name mismatch (site: ${pend.siteName})`)
      pendingBlobs.current.delete(st.id)
      log('sync', `Result saved anyway for ${st.name}`, `site says "${pend.siteName}"`)
      await syncNow()
    } catch (e) {
      setPhase(st.id, { kind: 'error', msg: e instanceof Error ? e.message : 'upload failed' })
    }
  }

  const onManualUpload = async (st: Student, file: File | undefined) => {
    if (!mapping || !file) return
    if (file.type !== 'application/pdf') {
      showToast('Only PDF files', 'err')
      return
    }
    const sid = st.ssacId?.trim() || ''
    try {
      await storePdf(st, mapping, sid, file, 'manual upload')
      log('sync', `Result manually uploaded for ${st.name}`, mapping.examLabel)
      showToast('PDF saved', 'ok')
      await syncNow()
    } catch (e) {
      setPhase(st.id, { kind: 'error', msg: e instanceof Error ? e.message : 'upload failed' })
    }
  }

  return (
    <div className="px-4 space-y-3 pb-6">
      <PageHeader
        title="Results"
        subtitle="Back up SSAC report cards as PDFs into Drive"
      />

      <MappingCard
        batches={batches}
        examMappings={examMappings}
        onSave={saveExamMapping}
        onDelete={deleteExamMapping}
      />

      <Card className="!rounded-2xl p-4">
        <div className="text-[13px] font-bold text-ink dark:text-white mb-1">
          School login{' '}
          {(sessSaved || credSaved) && <span className="text-teal">· override saved</span>}
        </div>
        <div className="text-[11.5px] text-muted dark:text-muted-dark mb-2.5 leading-relaxed">
          The server logs itself in with built-in school credentials. Overwrite them here
          only if they change - username and password save together and win field by field.
          The session paste below is a live override for emergencies. Everything here stays
          on this device only, never synced.
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <label className="block">
            <div className="text-[11.5px] font-semibold text-muted dark:text-muted-dark mb-1">
              Username
            </div>
            <Input
              value={credUser}
              onChange={(e) => setCredUser(e.target.value)}
              placeholder="School username"
              autoComplete="off"
              inputMode="numeric"
            />
          </label>
          <label className="block">
            <div className="text-[11.5px] font-semibold text-muted dark:text-muted-dark mb-1">
              Password
            </div>
            <Input
              type="password"
              value={credPass}
              onChange={(e) => setCredPass(e.target.value)}
              placeholder="School password"
              autoComplete="off"
            />
          </label>
        </div>
        <div className="flex gap-2">
          <Input
            type="password"
            value={sessInput}
            onChange={(e) => setSessInput(e.target.value)}
            placeholder="Paste PHPSESSID value (live override)"
            autoComplete="off"
          />
          <Button
            variant="secondary"
            onClick={() => {
              setSsacSession(sessInput.trim())
              setSsacCreds(credUser.trim(), credPass)
              const hasSess = !!sessInput.trim()
              const hasCred = !!(credUser.trim() || credPass)
              setSessSaved(hasSess)
              setCredSaved(hasCred)
              showToast(hasSess || hasCred ? 'Login override saved on this device' : 'Override cleared', 'ok')
            }}
          >
            Save
          </Button>
        </div>
      </Card>

      <Card className="!rounded-2xl p-4">
        <div className="text-[13px] font-bold text-ink dark:text-white mb-3">
          Download report cards
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <label className="block">
            <div className="text-[11.5px] font-semibold text-muted dark:text-muted-dark mb-1">Batch</div>
            <Select value={batch} onChange={(e) => setBatch(e.target.value)}>
              {batches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <div className="text-[11.5px] font-semibold text-muted dark:text-muted-dark mb-1">Exam</div>
            <Select
              value={examId}
              onChange={(e) => setExamId(e.target.value)}
              disabled={!mapsForBatch.length}
            >
              {mapsForBatch.map((m) => (
                <option key={m.id} value={m.examId}>
                  {m.examLabel}
                </option>
              ))}
            </Select>
          </label>
        </div>
        {!mapsForBatch.length && batch && (
          <div className="text-[12.5px] text-muted dark:text-muted-dark mt-2">
            No exams mapped for this batch yet - add one above first.
          </div>
        )}

        {batchStudents.length > 0 && (
          <>
            <div className="flex items-center justify-between mt-3">
              <div className="text-[12.5px] font-bold text-ink dark:text-white">
                {checked.length} of {batchStudents.length} selected
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setChecked(batchStudents.map((s) => s.id))}
                  className="text-[12px] font-bold text-teal"
                >
                  All
                </button>
                <button
                  onClick={() => setChecked([])}
                  className="text-[12px] font-bold text-muted dark:text-muted-dark"
                >
                  None
                </button>
              </div>
            </div>
            <div className="max-h-[42dvh] overflow-y-auto mt-1">
              {batchStudents.map((s) => (
                <StudentRow
                  key={s.id}
                  student={s}
                  checked={checked.includes(s.id)}
                  onToggle={(on) =>
                    setChecked((prev) => (on ? [...prev, s.id] : prev.filter((id) => id !== s.id))
                  )}
                  phase={phases[s.id]}
                  saved={resultFor(s.id, examId)}
                  onSaveAnyway={() => void onSaveAnyway(s)}
                  onManualUpload={(f) => void onManualUpload(s, f)}
                  disabled={running}
                />
              ))}
            </div>
          </>
        )}

        <div className="text-[11.5px] text-muted dark:text-muted-dark mt-3 leading-relaxed">
          Students without an SSAC ID are skipped automatically, as are PDFs already
          saved (re-runs overwrite only what is re-fetched). Runs go 3 students at a
          time with pauses - be nice to the school server, and keep this screen open
          during a run.
        </div>
        <label className="flex items-center gap-2 mt-2 cursor-pointer">
          <input
            type="checkbox"
            checked={redownload}
            disabled={running}
            onChange={(e) => setRedownload(e.target.checked)}
            className="w-4 h-4 accent-teal shrink-0"
          />
          <span className="text-[12px] font-semibold text-muted dark:text-muted-dark">
            Re-download already-saved PDFs too
          </span>
        </label>

        <div className="space-y-2.5 mt-3">
          <Button
            full
            size="lg"
            onClick={() => void run()}
            disabled={running || !mapping || !checked.length}
            className="whitespace-nowrap"
          >
            {running ? <Spinner className="w-5 h-5" /> : <IconDownload className="w-5 h-5" />}
            {running ? 'Working…' : 'Download PDFs'}
          </Button>
          {running ? (
            <Button
              full
              variant="secondary"
              size="lg"
              onClick={() => {
                stopRef.current = true
              }}
            >
              Stop
            </Button>
          ) : (
            <Button
              full
              variant="secondary"
              size="lg"
              onClick={() => void run(failedIds)}
              disabled={!mapping || !failedIds.length}
              className="whitespace-nowrap"
            >
              Retry{failedIds.length ? ` ${failedIds.length}` : ''} failed
            </Button>
          )}
        </div>
        {summary && (
          <div className="text-[12.5px] font-semibold text-ink dark:text-white mt-2.5">{summary}</div>
        )}
      </Card>
    </div>
  )
}

function MappingCard({
  batches,
  examMappings,
  onSave,
  onDelete,
}: {
  batches: string[]
  examMappings: ExamMapping[]
  onSave: (input: { batch: string; examId: string; examLabel: string; printView?: boolean }) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [mBatch, setMBatch] = useState('')
  const [mLabel, setMLabel] = useState('')
  const [mExamId, setMExamId] = useState('')
  const [mPrintView, setMPrintView] = useState(false)
  const [pasteUrl, setPasteUrl] = useState('')
  const [sidHint, setSidHint] = useState('')
  const [busy, setBusy] = useState(false)

  const onExtract = () => {
    const exam = extractExamId(pasteUrl)
    if (!exam) {
      setSidHint('No exam_id found in that URL.')
      return
    }
    setMExamId(exam)
    const sid = extractSid(pasteUrl)
    setSidHint(
      sid
        ? `exam_id ${exam} extracted. URL also has sid ${sid} - the student's SSAC ID must match it.`
        : `exam_id ${exam} extracted.`,
    )
  }

  const onAdd = async () => {
    if (!mBatch.trim() || !mLabel.trim() || !/^\d{1,20}$/.test(mExamId.trim())) return
    setBusy(true)
    try {
      await onSave({ batch: mBatch, examId: mExamId, examLabel: mLabel, printView: mPrintView || undefined })
      setMLabel('')
      setMExamId('')
      setMPrintView(false)
      setPasteUrl('')
      setSidHint('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="!rounded-2xl p-4">
      <div className="text-[13px] font-bold text-ink dark:text-white mb-1">
        Batch → exam mapping
      </div>
      <div className="text-[11.5px] text-muted dark:text-muted-dark mb-3">
        The school tells you each exam's ID per batch - write it here once, then download.
      </div>
      {examMappings.length === 0 ? (
        <EmptyState
          icon={<IconDownload className="w-7 h-7" />}
          title="No exams mapped yet"
          subtitle="Add the first batch → exam mapping below."
        />
      ) : (
        <div className="mb-3">
          {examMappings
            .slice()
            .sort((a, b) =>
              a.batch === b.batch
                ? a.examLabel.localeCompare(b.examLabel)
                : a.batch.localeCompare(b.batch),
            )
            .map((m, i) => (
              <div
                key={m.id}
                className={cx(
                  'flex items-center gap-2 py-2',
                  i > 0 && 'border-t border-line/60 dark:border-line-dark/60',
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-bold text-ink dark:text-white truncate">
                    {m.examLabel}
                  </div>
                  <div className="text-[11.5px] text-muted dark:text-muted-dark tabular-nums">
                    {m.batch} · exam {m.examId}{m.printView ? ' · print view' : ''}
                  </div>
                </div>
                <button
                  onClick={() =>
                    void onSave({ batch: m.batch, examId: m.examId, examLabel: m.examLabel, printView: !m.printView })
                  }
                  title="Toggle &printView=1 on render requests for this exam"
                  className={cx(
                    'shrink-0 text-[11px] font-bold px-2 py-1.5 rounded-lg',
                    m.printView ? 'text-teal bg-teal/10' : 'text-faint',
                  )}
                >
                  {m.printView ? 'Print view on' : 'Print view'}
                </button>
                <button
                  onClick={() => void onDelete(m.id)}
                  className="text-faint hover:text-danger p-2"
                  title="Remove mapping (saved PDFs keep working)"
                >
                  <IconTrash className="w-4 h-4" />
                </button>
              </div>
            ))}
        </div>
      )}
      <div className="space-y-2.5 rounded-xl bg-[#faf8f2] dark:bg-input-dark border border-line dark:border-line-dark p-3">
        <div className="flex gap-2">
          <Input
            value={pasteUrl}
            onChange={(e) => setPasteUrl(e.target.value)}
            placeholder="Paste a school result URL to auto-fill exam ID"
            inputMode="url"
          />
          <Button variant="secondary" onClick={onExtract} disabled={!pasteUrl.trim()}>
            Fill
          </Button>
        </div>
        {sidHint && <div className="text-[11.5px] text-muted dark:text-muted-dark">{sidHint}</div>}
        <label className="block">
          <div className="text-[11.5px] font-semibold text-muted dark:text-muted-dark mb-1">Batch</div>
          <Input
            value={mBatch}
            onChange={(e) => setMBatch(e.target.value)}
            placeholder="e.g. Seven - Bakul"
            list="results-batch-list"
          />
          <datalist id="results-batch-list">
            {batches.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <div className="text-[11.5px] font-semibold text-muted dark:text-muted-dark mb-1">
              Exam label
            </div>
            <Input
              value={mLabel}
              onChange={(e) => setMLabel(e.target.value)}
              placeholder="2nd Tutorial 2026"
            />
          </label>
          <label className="block">
            <div className="text-[11.5px] font-semibold text-muted dark:text-muted-dark mb-1">
              Exam ID
            </div>
            <Input
              value={mExamId}
              onChange={(e) => setMExamId(e.target.value)}
              placeholder="1008"
              inputMode="numeric"
            />
          </label>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={mPrintView}
            onChange={(e) => setMPrintView(e.target.checked)}
            className="w-4 h-4 accent-teal shrink-0"
          />
          <span className="text-[12px] font-semibold text-muted dark:text-muted-dark">
            Print view (appends &printView=1 to requests)
          </span>
        </label>
        <Button
          full
          onClick={() => void onAdd()}
          disabled={busy || !mBatch.trim() || !mLabel.trim() || !/^\d{1,20}$/.test(mExamId.trim())}
        >
          <IconPlus className="w-4 h-4" /> Save mapping
        </Button>
      </div>
    </Card>
  )
}

function StudentRow({
  student,
  checked,
  onToggle,
  phase,
  saved,
  onSaveAnyway,
  onManualUpload,
  disabled,
}: {
  student: Student
  checked: boolean
  onToggle: (on: boolean) => void
  phase?: Phase
  saved?: { status: string; fetchedAt: number; note?: string }
  onSaveAnyway: () => void
  onManualUpload: (f: File | undefined) => void
  disabled: boolean
}) {
  const hasSid = !!student.ssacId?.trim()
  return (
    <div className="border-t border-line/60 first:border-t-0 dark:border-line-dark/60 py-1">
      <label className="flex items-center gap-3 py-1.5 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="w-4 h-4 accent-teal shrink-0"
        />
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-semibold text-ink dark:text-white truncate">
            {student.name}
          </span>
          <span className="block text-[11px] text-faint tabular-nums">
            {hasSid ? `SSAC ${student.ssacId}` : 'no SSAC ID - will skip'}
          </span>
        </span>
        <StatusChip phase={phase} savedStatus={saved?.status} />
      </label>
      {phase?.kind === 'mismatch' && (
        <div className="ml-7 mb-1.5 flex items-center gap-2 flex-wrap">
          <span className="text-[11.5px] text-muted dark:text-muted-dark">
            Site says “{phase.msg}”.
          </span>
          <button
            onClick={onSaveAnyway}
            disabled={disabled}
            className="text-[12px] font-bold text-teal disabled:opacity-40"
          >
            Save anyway
          </button>
        </div>
      )}
      {phase?.kind === 'error' && (
        <div className="ml-7 mb-1.5 flex items-center gap-2 flex-wrap">
          <span className="text-[11.5px] text-muted dark:text-muted-dark truncate max-w-[55%]">
            {phase.msg}
          </span>
          <label className="text-[12px] font-bold text-teal cursor-pointer">
            Upload PDF
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={disabled}
              onChange={(e) => {
                onManualUpload(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
        </div>
      )}
      {(phase?.kind === 'saved' || phase?.kind === 'empty') && saved?.note && (
        <div className="ml-7 mb-1.5 text-[11.5px] text-muted dark:text-muted-dark">{saved.note}</div>
      )}
    </div>
  )
}

function StatusChip({ phase, savedStatus }: { phase?: Phase; savedStatus?: string }) {
  if (!phase && !savedStatus) return null
  if (phase?.kind === 'fetching' || phase?.kind === 'uploading')
    return <Spinner className="w-4 h-4 shrink-0" />
  if (phase?.kind === 'saved')
    return (
      <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
        <IconCheck className="w-3.5 h-3.5" /> Saved
      </span>
    )
  if (phase?.kind === 'skipped')
    return <span className="shrink-0 text-[11px] font-bold text-faint">Skipped</span>
  if (phase?.kind === 'empty')
    return <span className="shrink-0 text-[11px] font-bold text-amber-600">Empty</span>
  if (phase?.kind === 'mismatch')
    return <span className="shrink-0 text-[11px] font-bold text-amber-600">Mismatch</span>
  if (phase?.kind === 'error')
    return <span className="shrink-0 text-[11px] font-bold text-danger">Failed</span>
  // previous run's stored state
  if (savedStatus === 'ok')
    return (
      <span className="shrink-0 text-[11px] font-semibold text-muted dark:text-muted-dark">Saved</span>
    )
  if (savedStatus === 'empty')
    return <span className="shrink-0 text-[11px] font-semibold text-amber-600">Empty</span>
  if (savedStatus === 'error')
    return <span className="shrink-0 text-[11px] font-semibold text-danger">Error</span>
  return null
}
