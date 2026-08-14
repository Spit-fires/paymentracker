import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import { studentPeriodPaidAny } from '../lib/ledger'
import { periodNow } from '../lib/format'
import { K, getKV, setKV } from '../lib/db'
import { Card, EmptyState, Modal, Button, useBlobUrl } from '../components/ui'
import { StudentForm, type FormValue } from '../components/StudentForm'
import {
  IconPlus,
  IconSearch,
  IconUsers,
  IconArrow,
} from '../components/Icons'

type SortKey = 'name' | 'batch' | 'recent'
const SORT_LABELS: Record<SortKey, string> = { name: 'Name', batch: 'Batch', recent: 'Recently added' }

function StudentAvatar({ s }: { s: { name: string; photoBlob?: Blob } }) {
  const url = useBlobUrl(s.photoBlob)
  if (url) return <img src={url} alt="" className="w-11 h-11 rounded-full object-cover shrink-0" />
  return (
    <div className="w-11 h-11 rounded-full bg-[#e8f0f7] dark:bg-hover-dark grid place-items-center text-ink dark:text-accent-dark font-bold text-[14px] shrink-0">
      {s.name
        .split(' ')
        .slice(0, 2)
        .map((x) => x[0])
        .join('')
        .toUpperCase()}
    </div>
  )
}

export function Students() {
  const { students, payments, online, addStudent, showToast } = useApp()
  const [params, setParams] = useSearchParams()

  const q = params.get('q') || ''
  const mode = params.get('mode')
  const wantNew = params.get('new') === '1'
  const batchParam = params.get('batch') || ''

  const [addOpen, setAddOpen] = useState(wantNew)
  const [adding, setAdding] = useState(false)
  const [sort, setSort] = useState<SortKey>('name')
  const [sortOpen, setSortOpen] = useState(false)
  const [batchFilter, setBatchFilter] = useState(batchParam)

  // restore the last-used batch filter when arriving here without a ?batch=
  // param (e.g. returning after recording a payment), and remember it for next time
  useEffect(() => {
    void (async () => {
      if (batchParam) {
        await setKV(K.BATCH_FILTER, batchParam)
        return
      }
      const saved = await getKV<string>(K.BATCH_FILTER)
      if (saved && saved !== batchFilter) {
        setBatchFilter(saved)
        const p = new URLSearchParams(params)
        p.set('batch', saved)
        setParams(p, { replace: true })
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [showArchived, setShowArchived] = useState(false)

  useEffect(() => {
    if (wantNew) setAddOpen(true)
    params.delete('new')
    setParams(params, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantNew])

  const period = periodNow()
  const setBatch = (b: string) => {
    setBatchFilter(b)
    void setKV(K.BATCH_FILTER, b)
    const p = new URLSearchParams(params)
    if (b) p.set('batch', b)
    else p.delete('batch')
    setParams(p, { replace: true })
  }

  const batches = useMemo(
    () => Array.from(new Set(students.map((s) => s.batch))).filter(Boolean).sort(),
    [students],
  )

  const filtered = useMemo(() => {
    let list = students.filter((s) => (showArchived ? true : !s.archived))
    if (batchFilter) list = list.filter((s) => s.batch === batchFilter)
    if (q.trim()) {
      const t = q.trim().toLowerCase()
      list = list.filter(
        (s) => s.name.toLowerCase().includes(t) || s.batch.toLowerCase().includes(t),
      )
    }
    const sorted = [...list]
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name))
    else if (sort === 'batch') sorted.sort((a, b) => a.batch.localeCompare(b.batch) || a.name.localeCompare(b.name))
    else sorted.sort((a, b) => b.createdAt - a.createdAt)
    return sorted
  }, [students, q, batchFilter, sort, showArchived])

  const onAdd = async (v: FormValue) => {
    if (!online) return showToast('You need to be online to add students', 'err')
    setAdding(true)
    try {
      await addStudent({
        name: v.name,
        phone: v.phone,
        phone2: v.phone2,
        batch: v.batch,
        defaultFee: v.defaultFee ? Number(v.defaultFee) : 0,
        realPayment: v.realPayment.trim() ? Number(v.realPayment) : undefined,
        commission: v.commission.trim() ? Number(v.commission) : undefined,
        notes: v.notes,
        photo: v.photo,
      })
      setAddOpen(false)
      showToast(`${v.name} added`, 'ok')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not add student', 'err')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="px-4 pt-5 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[22px] font-bold text-ink dark:text-white">Students</div>
            <div className="text-[13px] text-muted dark:text-muted-dark">
              {students.filter((s) => !s.archived).length} active
            </div>
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <IconPlus className="w-4 h-4" /> Add
          </Button>
        </div>

        {mode === 'record' && (
          <div className="mt-3 rounded-xl bg-teal/10 dark:bg-teal/20 border border-teal/20 px-3.5 py-2.5 text-[13px] font-medium text-teal">
            Pick a student to record their payment
          </div>
        )}

        <div className="relative mt-3">
          <IconSearch className="w-[18px] h-[18px] absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={q}
            onChange={(e) => setParams({ q: e.target.value, ...(mode ? { mode } : {}) }, { replace: true })}
            placeholder="Search by name or batch…"
            className="w-full rounded-xl bg-white dark:bg-card-dark border border-line dark:border-line-dark pl-10 pr-4 py-3 text-[15px] text-body dark:text-text-dark placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-teal/25"
          />
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={() => setSortOpen(true)}
            className="rounded-lg border border-line dark:border-line-dark bg-white dark:bg-card-dark px-3 py-2 text-[13px] font-semibold text-ink dark:text-white active:scale-95 transition"
          >
            Sort: {SORT_LABELS[sort]}
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setShowArchived((v) => !v)}
            className={`rounded-lg px-3 py-2 text-[13px] font-semibold transition ${
              showArchived
                ? 'bg-ink text-white'
                : 'border border-line dark:border-line-dark bg-white dark:bg-card-dark text-muted dark:text-muted-dark'
            }`}
          >
            Archived
          </button>
        </div>

        {/* Batch filter chips — wrap to a new row once the line fills */}
        {batches.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5 pb-1 -mx-4 px-4">
            <button
              onClick={() => setBatch('')}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition ${
                !batchFilter
                  ? 'bg-ink text-white'
                  : 'bg-white dark:bg-card-dark text-body/70 dark:text-muted-dark border border-line dark:border-line-dark'
              }`}
            >
              All
            </button>
            {batches.map((b) => (
              <button
                key={b}
                onClick={() => setBatch(batchFilter === b ? '' : b)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition ${
                  batchFilter === b
                    ? 'bg-ink text-white'
                    : 'bg-white dark:bg-card-dark text-body/70 dark:text-muted-dark border border-line dark:border-line-dark'
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* List */}
      <div className="px-4 pb-4">
        {filtered.length === 0 ? (
          <Card className="!rounded-2xl">
            <EmptyState
              icon={<IconUsers className="w-7 h-7" />}
              title={q || batchFilter ? 'No matches' : 'No students yet'}
              subtitle={
                q || batchFilter
                  ? 'Try a different search.'
                  : 'Add your first student to start tracking payments.'
              }
              action={
                !q && !batchFilter ? (
                  <Button onClick={() => setAddOpen(true)}>
                    <IconPlus className="w-4 h-4" /> Add student
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((s) => {
              const paid = studentPeriodPaidAny(payments, s.id, period)
              return (
                <Link
                  key={s.id}
                  to={mode === 'record' ? `/payment/${s.id}` : `/student/${s.id}`}
                  className="block"
                >
                  <Card className="!rounded-xl p-3 flex items-center gap-3 active:scale-[0.99] transition">
                    <StudentAvatar s={s} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[14.5px] font-bold text-ink dark:text-white truncate flex items-center gap-2">
                        {s.name}
                        {s.archived && (
                          <span className="text-[10px] font-semibold text-muted border border-line dark:border-line-dark rounded px-1">
                            archived
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] text-muted dark:text-muted-dark">
                        {s.batch || 'No batch'}
                      </div>
                    </div>
                    <div
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
                        paid
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : 'bg-red-50 text-red-600 dark:bg-red-900/40 dark:text-red-300'
                      }`}
                    >
                      {paid ? 'Paid' : 'Due'}
                    </div>
                    <IconArrow className="w-4 h-4 text-faint dark:text-[#5f7a92]" />
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Sort sheet */}
      <Modal open={sortOpen} onClose={() => setSortOpen(false)} title="Sort students">
        <div className="space-y-1.5">
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <button
              key={k}
              onClick={() => {
                setSort(k)
                setSortOpen(false)
              }}
              className={`w-full text-left rounded-xl px-4 py-3.5 text-[15px] font-semibold transition ${
                sort === k
                  ? 'bg-[#e8f0f7] text-ink dark:bg-hover-dark dark:text-accent-dark'
                  : 'text-body dark:text-text-dark'
              }`}
            >
              {SORT_LABELS[k]}
              {sort === k && (
                <span className="float-right text-teal">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
              )}
            </button>
          ))}
        </div>
      </Modal>

      {/* Add student modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add student">
        <StudentForm
          batches={batches}
          submitLabel={adding ? 'Adding…' : 'Add student'}
          onSubmit={(v) => void onAdd(v)}
          onCancel={() => setAddOpen(false)}
        />
      </Modal>
    </div>
  )
}
