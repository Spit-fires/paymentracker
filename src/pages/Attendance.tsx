import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Chart as ChartJS,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js'
import { useApp } from '../state/AppContext'
import { fmtDateLong, fmtWeekday, fillMessage, todayKey, dayKey, addDays } from '../lib/format'
import { defaultCenter } from '../lib/sync'
import { getKV, setKV, K } from '../lib/db'
import { waLink, openExternal } from '../lib/phone'
import { Card, PageHeader, EmptyState, Button, Select, Input, Modal, cx } from '../components/ui'
import { IconClipboardCheck, IconWhatsApp, IconCheck } from '../components/Icons'
import type { AttendanceStatus, Routine } from '../types'

ChartJS.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

type Tab = 'take' | 'clear' | 'stats'
type Scope = 'student' | 'batch' | 'day'

const STATUSES: AttendanceStatus[] = ['present', 'absent', 'leave']

const STATUS_STYLE: Record<AttendanceStatus, { label: string; cell: string; chip: string; bar: string }> = {
  present: {
    label: 'Present',
    cell: 'bg-teal-500 text-white',
    chip: 'bg-teal/10 text-teal dark:bg-teal/20 dark:text-teal-bright',
    bar: '#14b8a6',
  },
  absent: {
    label: 'Absent',
    cell: 'bg-danger text-white',
    chip: 'bg-danger/10 text-danger',
    bar: '#dc2626',
  },
  leave: {
    label: 'Leave',
    cell: 'bg-amber-500 text-white',
    chip: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    bar: '#f59e0b',
  },
}

function isoDayToMs(day: string): number {
  // noon local - safe against DST/timezone edge shifts
  return new Date(`${day}T12:00:00`).getTime()
}

/** Stacked 100%-bar chart (present/absent/leave) - chart.js, tree-shaken. */
function Bars({
  labels,
  data,
  dark,
}: {
  labels: string[]
  data: { present: number; absent: number; leave: number }[]
  dark: boolean
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<ChartJS | null>(null)
  useEffect(() => {
    if (!ref.current) return
    chartRef.current?.destroy()
    const tick = dark ? '#7b93a9' : '#64748b'
    const grid = dark ? 'rgba(148,163,184,0.14)' : 'rgba(100,116,139,0.14)'
    chartRef.current = new ChartJS(ref.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Present %',
            data: data.map((d) => d.present),
            backgroundColor: STATUS_STYLE.present.bar,
            borderRadius: 3,
            stack: 's',
            barPercentage: 0.75,
          },
          {
            label: 'Absent %',
            data: data.map((d) => d.absent),
            backgroundColor: STATUS_STYLE.absent.bar,
            borderRadius: 3,
            stack: 's',
            barPercentage: 0.75,
          },
          {
            label: 'Leave %',
            data: data.map((d) => d.leave),
            backgroundColor: STATUS_STYLE.leave.bar,
            borderRadius: 3,
            stack: 's',
            barPercentage: 0.75,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 350 },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 9, boxHeight: 9, font: { size: 10 }, color: tick },
          },
          tooltip: {
            callbacks: {
              label: (c) => `${c.dataset.label}: ${Math.round(c.parsed.y ?? 0)}%`,
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: { font: { size: 9 }, color: tick, maxRotation: 0, autoSkipPadding: 8 },
          },
          y: {
            stacked: true,
            min: 0,
            max: 100,
            grid: { color: grid },
            ticks: { font: { size: 9 }, color: tick, callback: (v) => `${v}%` },
          },
        },
      },
    })
    return () => {
      chartRef.current?.destroy()
      chartRef.current = null
    }
  }, [labels, data, dark])
  return (
    <div className="relative h-44 w-full">
      <canvas ref={ref} />
    </div>
  )
}

function SummaryChips({
  counts,
  total,
  onPick,
}: {
  counts: Record<AttendanceStatus, number>
  total: number
  onPick?: (s: AttendanceStatus) => void
}) {
  const pct = total ? Math.round((counts.present / total) * 100) : 0
  return (
    <div className="grid grid-cols-4 gap-2">
      {STATUSES.map((s) =>
        onPick ? (
          <button
            key={s}
            onClick={() => onPick(s)}
            className={cx(
              'rounded-xl px-2 py-2.5 text-center transition active:scale-[0.96]',
              STATUS_STYLE[s].chip,
            )}
          >
            <div className="text-[16px] font-bold leading-tight tabular-nums">{counts[s]}</div>
            <div className="text-[10.5px] font-semibold opacity-80">{STATUS_STYLE[s].label}</div>
          </button>
        ) : (
          <div key={s} className={cx('rounded-xl px-2 py-2.5 text-center', STATUS_STYLE[s].chip)}>
            <div className="text-[16px] font-bold leading-tight tabular-nums">{counts[s]}</div>
            <div className="text-[10.5px] font-semibold opacity-80">{STATUS_STYLE[s].label}</div>
          </div>
        ),
      )}
      <div className="rounded-xl px-2 py-2.5 text-center bg-ink/5 dark:bg-white/10">
        <div className="text-[16px] font-bold leading-tight tabular-nums">{pct}%</div>
        <div className="text-[10.5px] font-semibold opacity-70">Attendance</div>
      </div>
    </div>
  )
}

function StatusToggle({
  value,
  onChange,
}: {
  value: AttendanceStatus | null
  onChange: (s: AttendanceStatus) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#eef2f6] dark:bg-input-dark">
      {STATUSES.map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className={cx(
            'rounded-lg py-1.5 text-[11.5px] font-bold transition active:scale-[0.96]',
            value === s ? STATUS_STYLE[s].cell : 'text-muted dark:text-muted-dark',
          )}
        >
          {STATUS_STYLE[s].label}
        </button>
      ))}
    </div>
  )
}

function TakeView() {
  const { students, attendances, saveAttendance, showToast } = useApp()
  const [batch, setBatch] = useState('')
  const [day, setDay] = useState(todayKey())
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({})
  const [saving, setSaving] = useState(false)
  const [ready, setReady] = useState(false)

  const batches = useMemo(
    () => Array.from(new Set(students.map((s) => s.batch))).filter(Boolean).sort(),
    [students],
  )

  // restore last-used batch, then default to the first batch
  useEffect(() => {
    void getKV<string>(K.ATT_BATCH).then((saved) => {
      if (saved && batches.includes(saved)) setBatch(saved)
      setReady(true)
    })
  }, [batches])
  useEffect(() => {
    if (!batch && ready && batches.length) setBatch(batches[0])
  }, [batch, ready, batches])

  useEffect(() => {
    if (batch) void setKV(K.ATT_BATCH, batch)
  }, [batch])

  const roster = useMemo(
    () =>
      students
        .filter((s) => !s.archived && s.batch === batch)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [students, batch],
  )

  // load existing marks whenever the batch/day changes (including after save,
  // which triggers refreshData → attendances changes → marks re-seed)
  useEffect(() => {
    const m: Record<string, AttendanceStatus> = {}
    for (const a of attendances) {
      if (a.batch === batch && a.day === day && a.studentId && !m[a.studentId]) m[a.studentId] = a.status
    }
    setMarks(m)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch, day, attendances])

  const taken = batch ? attendances.some((a) => a.batch === batch && a.day === day) : false
  const counts = useMemo(() => {
    const c: Record<AttendanceStatus, number> = { present: 0, absent: 0, leave: 0 }
    for (const s of roster) {
      const st = marks[s.id]
      if (st) c[st]++
    }
    return c
  }, [roster, marks])
  const markedTotal = counts.present + counts.absent + counts.leave

  const markAll = () => {
    const m: Record<string, AttendanceStatus> = {}
    for (const s of roster) m[s.id] = 'present'
    setMarks(m)
  }

  const save = async () => {
    const entries = roster
      .map((s) => ({ studentId: s.id, status: marks[s.id] }))
      .filter((e): e is { studentId: string; status: AttendanceStatus } => Boolean(e.status))
    if (!entries.length) return showToast('Mark at least one student first', 'err')
    setSaving(true)
    try {
      await saveAttendance({ batch, day, marks: entries })
      showToast('Attendance saved', 'ok')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not save attendance', 'err')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-4 space-y-3 pb-6">
      {batches.length === 0 ? (
        <EmptyState
          icon={<IconClipboardCheck className="w-7 h-7" />}
          title="No batches yet"
          subtitle="Add students to a batch first, then attendance will show up here."
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {batches.map((b) => (
              <button
                key={b}
                onClick={() => setBatch(b)}
                className={cx(
                  'px-3.5 py-2 rounded-full text-[13px] font-bold transition active:scale-[0.97]',
                  batch === b
                    ? 'bg-ink text-white dark:bg-accent-dark dark:text-ink'
                    : 'bg-white dark:bg-card-dark border border-line dark:border-line-dark text-muted dark:text-muted-dark',
                )}
              >
                {b}
              </button>
            ))}
          </div>

          <Card className="!rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Input type="date" value={day} max={todayKey()} onChange={(e) => setDay(e.target.value)} />
              </div>
              <div className="text-[11.5px] text-muted dark:text-muted-dark">
                {day === todayKey() ? 'Today' : fmtDateLong(isoDayToMs(day))}
              </div>
            </div>

            {taken ? (
              <div className="flex items-start gap-2 rounded-xl bg-emerald-600/10 dark:bg-emerald-500/15 px-3.5 py-3">
                <IconCheck className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-[12.5px] leading-snug text-emerald-700 dark:text-emerald-300">
                  {day === todayKey() ? (
                    <span className="font-bold">
                      Today's attendance for {batch} has been taken.
                    </span>
                  ) : (
                    <span className="font-bold">Attendance for {fmtDateLong(isoDayToMs(day))} was taken.</span>
                  )}{' '}
                  Re-saving below updates this day's records.
                </div>
              </div>
            ) : (
              <div className="text-[12.5px] text-muted dark:text-muted-dark leading-snug">
                No attendance recorded for {day === todayKey() ? 'today' : 'this day'} yet.
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <div className="text-[11.5px] font-semibold text-muted dark:text-muted-dark tabular-nums">
                {markedTotal}/{roster.length} marked · {counts.present} P · {counts.absent} A · {counts.leave} L
              </div>
              <Button variant="soft" size="sm" onClick={markAll} disabled={!roster.length}>
                Mark all present
              </Button>
            </div>
          </Card>

          <div className="space-y-2">
            {roster.map((s) => (
              <Card key={s.id} className="!rounded-xl p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-bold text-ink dark:text-white truncate">{s.name}</div>
                  {s.phone && <div className="text-[12px] text-muted dark:text-muted-dark truncate">{s.phone}</div>}
                </div>
                <div className="w-[210px] shrink-0">
                  <StatusToggle
                    value={marks[s.id] ?? null}
                    onChange={(st) =>
                      setMarks((prev) => {
                        const next = { ...prev }
                        // tapping the already-active status unselects it
                        if (prev[s.id] === st) delete next[s.id]
                        else next[s.id] = st
                        return next
                      })
                    }
                  />
                </div>
              </Card>
            ))}
          </div>

          <Button full size="lg" onClick={() => void save()} disabled={saving || !batch}>
            {saving ? 'Saving…' : taken ? 'Update attendance' : 'Save attendance'}
          </Button>
        </>
      )}
    </div>
  )
}

function ClearView() {
  const { students, attendances, center, routines, toggleCleared } = useApp()
  const [day, setDay] = useState(todayKey())

  const groups = useMemo(() => {
    const active = new Set(students.filter((s) => !s.archived).map((s) => s.id))
    const byBatch = new Map<string, typeof students>()
    for (const a of attendances) {
      if (a.day !== day || a.status !== 'absent' || !active.has(a.studentId)) continue
      const s = students.find((x) => x.id === a.studentId)
      if (!s) continue
      const b = s.batch || a.batch || 'Batch'
      const arr = byBatch.get(b)
      if (arr) arr.push(s)
      else byBatch.set(b, [s])
    }
    return [...byBatch.entries()]
      .map(([batch, list]) => [batch, list.sort((a, b) => a.name.localeCompare(b.name))] as const)
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  }, [students, attendances, day])

  const template = (center.attendanceMsg || defaultCenter().attendanceMsg || '').trim()
  const total = groups.reduce((n, [, list]) => n + list.length, 0)

  // per batch, find the NEXT marked routine day after the attendance day -
  // holidays are simply days without a routine, so a Thursday message with a
  // Saturday routine only sends the Saturday one
  const routineByBatch = useMemo(() => {
    const m = new Map<string, { day: string; routine?: Routine }>()
    for (const [batch] of groups) {
      for (let i = 1; i <= 14; i++) {
        const d = addDays(day, i)
        const routine = routines.find((r) => r.batch === batch && r.day === d)
        if (routine) {
          m.set(batch, { day: d, routine })
          break
        }
      }
    }
    return m
  }, [groups, routines, day])

  const clearedById = useMemo(() => {
    const m = new Map<string, boolean>()
    for (const a of attendances) if (a.day === day) m.set(a.id, Boolean(a.cleared))
    return m
  }, [attendances, day])

  return (
    <div className="px-4 space-y-3 pb-6">
      <Card className="!rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <Input type="date" value={day} max={todayKey()} onChange={(e) => setDay(e.target.value)} />
          </div>
          <div className="text-[11.5px] text-muted dark:text-muted-dark">
            {day === todayKey() ? 'Today' : fmtDateLong(isoDayToMs(day))}
          </div>
        </div>
        <div className="text-[12px] text-muted dark:text-muted-dark leading-snug">
          {total ? (
            <>
              <span className="font-bold text-danger">{total} absent</span> student{total > 1 ? 's' : ''} on{' '}
              {fmtDateLong(isoDayToMs(day))}. Tap a student to open WhatsApp with the message pre-filled, then
              tick the box next to Message once it's sent.
            </>
          ) : (
            'No absent students on this day.'
          )}
        </div>
      </Card>

      {total === 0 && (
        <EmptyState
          icon={<IconCheck className="w-7 h-7 text-teal" />}
          title="No absent students"
          subtitle="Everyone was present or on leave on this day."
        />
      )}

      {groups.map(([batch, list]) => (
        <div key={batch}>
          <div className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-muted dark:text-muted-dark px-1 pt-1 pb-2">
            {batch} · {list.length}
          </div>
          <div className="space-y-2">
            {list.map((s) => {
              const phone = s.phone || s.phone2 || ''
              // the message tells the parent about the NEXT class - the first
              // day after the attendance day that has a routine for this batch
              // (holidays are skipped because they have no routine)
              const found = routineByBatch.get(batch)
              const msg = fillMessage(template, {
                student: s.name,
                date: fmtDateLong(isoDayToMs(day)),
                batch: s.batch || batch,
                center: center.name || 'our center',
                // only new-format routines (single text field) are valid -
                // legacy time/subjects records from before the merge are ignored
                routine: found?.routine?.text || '',
                'routine date': found ? fmtDateLong(isoDayToMs(found.day)) : '',
                'routine day': found ? fmtWeekday(isoDayToMs(found.day)) : '',
              })
              return (
                <Card key={s.id} className="!rounded-xl p-3.5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#e8f0f7] dark:bg-hover-dark grid place-items-center text-ink dark:text-accent-dark font-bold text-[13px] shrink-0">
                    {s.name
                      .split(' ')
                      .slice(0, 2)
                      .map((x) => x[0])
                      .join('')
                      .toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-bold text-ink dark:text-white truncate">{s.name}</div>
                    {phone && <div className="text-[12px] text-muted dark:text-muted-dark truncate">{phone}</div>}
                  </div>
                  <button
                    onClick={() => void toggleCleared(`${s.id}_${day}`, !clearedById.get(`${s.id}_${day}`))}
                    aria-label={clearedById.get(`${s.id}_${day}`) ? 'Mark not cleared' : 'Mark cleared'}
                    title={clearedById.get(`${s.id}_${day}`) ? 'Marked - sent the message' : 'Tick after sending the message'}
                    className={cx(
                      'w-9 h-9 rounded-xl grid place-items-center border-2 shrink-0 transition active:scale-95',
                      clearedById.get(`${s.id}_${day}`)
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : 'border-line dark:border-line-dark text-transparent',
                    )}
                  >
                    <IconCheck className="w-4.5 h-4.5" />
                  </button>
                  <Button
                    variant="soft"
                    size="sm"
                    disabled={!phone}
                    title={phone ? undefined : 'Add a phone number to send WhatsApp messages'}
                    onClick={() => openExternal(waLink(phone, msg))}
                  >
                    <IconWhatsApp className="w-4 h-4" /> Message
                  </Button>
                </Card>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function StatsView() {
  const { students, attendances } = useApp()
  const [scope, setScope] = useState<Scope>('student')
  const [studentId, setStudentId] = useState('')
  const [studentQuery, setStudentQuery] = useState('')
  const [batch, setBatch] = useState('')
  const [day, setDay] = useState(todayKey())
  const [ready, setReady] = useState(false)
  const [datesFor, setDatesFor] = useState<AttendanceStatus | null>(null)
  const dark = document.documentElement.classList.contains('dark')

  const studentOptions = useMemo(
    () =>
      students
        .filter((s) => !s.deletedAt)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [students],
  )
  const batches = useMemo(
    () => Array.from(new Set(students.map((s) => s.batch))).filter(Boolean).sort(),
    [students],
  )

  useEffect(() => {
    if (!ready) {
      if (batches.length && !batch) setBatch(batches[0])
      setReady(true)
    }
  }, [ready, batches, batch])

  const months = useMemo(() => {
    const out: Array<{ key: string; label: string }> = []
    const now = new Date()
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      out.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('en-GB', { month: 'short' }),
      })
    }
    return out
  }, [])

  const countsFor = (rows: typeof attendances, total: number) => {
    const c: Record<AttendanceStatus, number> = { present: 0, absent: 0, leave: 0 }
    for (const a of rows) if (a.status) c[a.status]++
    return { counts: c, total }
  }

  const pct = (c: Record<AttendanceStatus, number>, total: number, s: AttendanceStatus) =>
    total ? Math.round((c[s] / total) * 100) : 0

  /* ---------- Student scope ---------- */
  const studentSeries = useMemo(() => {
    if (!studentId) return { labels: [] as string[], data: [] as { present: number; absent: number; leave: number }[] }
    const rows = attendances.filter((a) => a.studentId === studentId)
    const data = months.map((m) => {
      const mrows = rows.filter((a) => a.day.startsWith(m.key))
      const c = countsFor(mrows, mrows.length)
      return {
        present: pct(c.counts, c.total, 'present'),
        absent: pct(c.counts, c.total, 'absent'),
        leave: pct(c.counts, c.total, 'leave'),
      }
    })
    return { labels: months.map((m) => m.label), data }
  }, [studentId, attendances, months])

  const studentTotals = useMemo(() => {
    if (!studentId) return { counts: { present: 0, absent: 0, leave: 0 } as Record<AttendanceStatus, number>, total: 0 }
    const rows = attendances.filter((a) => a.studentId === studentId)
    const c: Record<AttendanceStatus, number> = { present: 0, absent: 0, leave: 0 }
    for (const a of rows) if (a.status) c[a.status]++
    return { counts: c, total: rows.length }
  }, [studentId, attendances])

  /* ---------- Batch scope ---------- */  /* ---------- Batch scope ---------- */
  const days = useMemo(() => {
    const out: string[] = []
    const now = new Date()
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
      out.push(dayKey(d))
    }
    return out
  }, [])

  const batchSeries = useMemo(() => {
    if (!batch) return { labels: [] as string[], data: [] as { present: number; absent: number; leave: number }[], detail: [] as Array<{ day: string; counts: Record<AttendanceStatus, number>; total: number }> }
    const active = new Set(students.filter((s) => !s.archived && s.batch === batch).map((s) => s.id))
    const detail = days.map((d) => {
      const rows = attendances.filter((a) => a.day === d && a.batch === batch && active.has(a.studentId))
      const c: Record<AttendanceStatus, number> = { present: 0, absent: 0, leave: 0 }
      for (const a of rows) if (a.status) c[a.status]++
      return { day: d, counts: c, total: rows.length }
    })
    const data = detail.map((d) => ({
      present: d.total ? Math.round((d.counts.present / d.total) * 100) : 0,
      absent: d.total ? Math.round((d.counts.absent / d.total) * 100) : 0,
      leave: d.total ? Math.round((d.counts.leave / d.total) * 100) : 0,
    }))
    const labels = detail.map((d) => String(Number(d.day.slice(8))))
    return { labels, data, detail: detail.filter((d) => d.total > 0).slice(-14).reverse() }
  }, [batch, attendances, days, students])

  const batchTotals = useMemo(() => {
    if (!batch) return { counts: { present: 0, absent: 0, leave: 0 } as Record<AttendanceStatus, number>, total: 0 }
    const active = new Set(students.filter((s) => !s.archived && s.batch === batch).map((s) => s.id))
    const rows = attendances.filter((a) => a.batch === batch && active.has(a.studentId))
    const c: Record<AttendanceStatus, number> = { present: 0, absent: 0, leave: 0 }
    for (const a of rows) if (a.status) c[a.status]++
    return { counts: c, total: rows.length }
  }, [batch, attendances, students])

  /* ---------- Date drilldown (chip → exact dates) ---------- */
  const dateRows = useMemo(() => {
    if (!datesFor) return [] as string[]
    const rows =
      scope === 'student'
        ? attendances.filter((a) => a.studentId === studentId && a.status === datesFor)
        : (() => {
            const active = new Set(students.filter((s) => !s.archived && s.batch === batch).map((s) => s.id))
            return attendances.filter((a) => a.batch === batch && active.has(a.studentId) && a.status === datesFor)
          })()
    return [...new Set(rows.map((a) => a.day))].sort((a, b) => (a < b ? 1 : -1))
  }, [datesFor, scope, studentId, batch, attendances, students])
  const dayGroups = useMemo(() => {
    const active = new Set(students.filter((s) => !s.archived).map((s) => s.id))
    const byBatch = new Map<string, { counts: Record<AttendanceStatus, number>; total: number }>()
    for (const a of attendances) {
      if (a.day !== day || !active.has(a.studentId)) continue
      const b = a.batch || 'Batch'
      const g = byBatch.get(b) || { counts: { present: 0, absent: 0, leave: 0 }, total: 0 }
      if (a.status) g.counts[a.status]++
      g.total++
      byBatch.set(b, g)
    }
    return [...byBatch.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  }, [attendances, students, day])

  return (
    <div className="px-4 space-y-3 pb-6">
      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-[#eef2f6] dark:bg-input-dark">
        {(
          [
            ['student', 'Student'],
            ['batch', 'Batch'],
            ['day', 'Day'],
          ] as Array<[Scope, string]>
        ).map(([sc, label]) => (
          <button
            key={sc}
            onClick={() => setScope(sc)}
            className={cx(
              'rounded-xl py-2 text-[12.5px] font-bold transition active:scale-[0.98]',
              scope === sc
                ? 'bg-white dark:bg-card-dark text-ink dark:text-white shadow-sm'
                : 'text-muted dark:text-muted-dark',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {scope === 'student' && (
        <>
          {!studentId ? (
            <div className="space-y-2">
              <input
                value={studentQuery}
                onChange={(e) => setStudentQuery(e.target.value)}
                placeholder="Search students by name or batch…"
                className="w-full rounded-xl bg-white dark:bg-card-dark border border-line dark:border-line-dark px-4 py-3 text-[15px] text-body dark:text-text-dark placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-teal/25"
              />
              {(() => {
                const ql = studentQuery.trim().toLowerCase()
                const matches = studentOptions
                  .filter((s) => !ql || s.name.toLowerCase().includes(ql) || s.batch.toLowerCase().includes(ql))
                  .slice(0, 10)
                if (!ql) {
                  return (
                    <div className="text-[12.5px] text-muted dark:text-muted-dark px-1">
                      Type to find a student.
                    </div>
                  )
                }
                if (!matches.length) {
                  return (
                    <div className="text-[12.5px] text-muted dark:text-muted-dark px-1">
                      No students match “{studentQuery}”.
                    </div>
                  )
                }
                return (
                  <div className="rounded-xl border border-line dark:border-line-dark bg-white dark:bg-card-dark overflow-hidden">
                    {matches.map((s, i) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setStudentId(s.id)
                          setStudentQuery('')
                        }}
                        className={cx(
                          'w-full text-left px-4 py-3 flex items-center justify-between gap-2 transition active:bg-cream dark:active:bg-input-dark',
                          i > 0 && 'border-t border-line/60 dark:border-line-dark/60',
                        )}
                      >
                        <span className="text-[14px] font-semibold text-ink dark:text-white truncate">{s.name}</span>
                        <span className="text-[11.5px] text-faint shrink-0">
                          {s.batch || 'No batch'}
                          {s.archived ? ' · archived' : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                )
              })()}
            </div>
          ) : (
            <>
              <button
                onClick={() => setStudentId('')}
                className="w-full rounded-xl bg-white dark:bg-card-dark border border-line dark:border-line-dark px-4 py-3 flex items-center justify-between gap-2 text-left transition active:scale-[0.99]"
              >
                <span className="text-[14px] font-semibold text-ink dark:text-white truncate">
                  {studentOptions.find((s) => s.id === studentId)?.name}
                </span>
                <span className="text-[12px] font-semibold text-teal shrink-0">Change</span>
              </button>
              <SummaryChips counts={studentTotals.counts} total={studentTotals.total} onPick={setDatesFor} />
              <div className="text-[11px] text-faint -mt-1">Tap a count to see the exact dates.</div>
              <Card className="!rounded-2xl p-4">
                <div className="text-[13px] font-bold text-ink dark:text-white mb-2">
                  Monthly attendance · last 12 months
                </div>
                <Bars labels={studentSeries.labels} data={studentSeries.data} dark={dark} />
              </Card>
            </>
          )}
        </>
      )}

      {scope === 'batch' && (
        <>
          <Select value={batch} onChange={(e) => setBatch(e.target.value)}>
            {batches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
          {batch && (
            <>
              <SummaryChips counts={batchTotals.counts} total={batchTotals.total} onPick={setDatesFor} />
              <div className="text-[11px] text-faint -mt-1">Tap a count to see the exact dates.</div>
              <Card className="!rounded-2xl p-4">
                <div className="text-[13px] font-bold text-ink dark:text-white mb-2">
                  Daily attendance · last 30 days
                </div>
                <Bars labels={batchSeries.labels} data={batchSeries.data} dark={dark} />
              </Card>
              <div className="space-y-1.5">
                {batchSeries.detail.map((d) => {
                  const p = d.total ? Math.round((d.counts.present / d.total) * 100) : 0
                  return (
                    <Card key={d.day} className="!rounded-xl px-3.5 py-2.5 flex items-center gap-3">
                      <div className="text-[12.5px] font-bold text-ink dark:text-white w-[88px] shrink-0">
                        {fmtDateLong(isoDayToMs(d.day))}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="h-2 rounded-full bg-[#eef2f6] dark:bg-input-dark overflow-hidden flex">
                          <div className="bg-teal-500" style={{ width: `${d.total ? (d.counts.present / d.total) * 100 : 0}%` }} />
                          <div className="bg-danger" style={{ width: `${d.total ? (d.counts.absent / d.total) * 100 : 0}%` }} />
                          <div className="bg-amber-500" style={{ width: `${d.total ? (d.counts.leave / d.total) * 100 : 0}%` }} />
                        </div>
                      </div>
                      <div className="text-[11px] text-muted dark:text-muted-dark tabular-nums shrink-0">
                        {d.total ? `${p}%` : '–'}
                      </div>
                    </Card>
                  )
                })}
                {!batchSeries.detail.length && (
                  <div className="text-[12.5px] text-center text-muted dark:text-muted-dark py-8">
                    No attendance recorded for this batch yet.
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {scope === 'day' && (
        <>
          <Input type="date" value={day} max={todayKey()} onChange={(e) => setDay(e.target.value)} />
          {dayGroups.length === 0 ? (
            <EmptyState
              icon={<IconClipboardCheck className="w-7 h-7" />}
              title="No attendance for this day"
              subtitle="Take attendance first, then the summary shows up here."
            />
          ) : (
            <div className="space-y-2">
              {dayGroups.map(([b, g]) => {
                const p = g.total ? Math.round((g.counts.present / g.total) * 100) : 0
                return (
                  <Card key={b} className="!rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[14px] font-bold text-ink dark:text-white">{b}</div>
                      <div className="text-[12px] font-semibold text-muted dark:text-muted-dark tabular-nums">
                        {g.total} marked · {p}% present
                      </div>
                    </div>
                    <div className="h-2.5 rounded-full bg-[#eef2f6] dark:bg-input-dark overflow-hidden flex">
                      <div className="bg-teal-500" style={{ width: `${g.total ? (g.counts.present / g.total) * 100 : 0}%` }} />
                      <div className="bg-danger" style={{ width: `${g.total ? (g.counts.absent / g.total) * 100 : 0}%` }} />
                      <div className="bg-amber-500" style={{ width: `${g.total ? (g.counts.leave / g.total) * 100 : 0}%` }} />
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      {STATUSES.map((s) => (
                        <div key={s} className="text-center">
                          <div className={cx('inline-block rounded-lg px-2.5 py-1 text-[12px] font-bold tabular-nums', STATUS_STYLE[s].chip)}>
                            {g.counts[s]} {STATUS_STYLE[s].label}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      {datesFor && (
        <Modal
          open
          onClose={() => setDatesFor(null)}
          title={`${STATUS_STYLE[datesFor].label} · ${dateRows.length} day${dateRows.length === 1 ? '' : 's'}`}
        >
          {dateRows.length === 0 ? (
            <div className="text-[13px] text-muted dark:text-muted-dark py-4 text-center">
              No records for this status.
            </div>
          ) : (
            <div>
              {dateRows.map((d, i) => (
                <div
                  key={d}
                  className={cx(
                    'flex items-center gap-3 py-2.5',
                    i > 0 && 'border-t border-line/60 dark:border-line-dark/60',
                  )}
                >
                  <span className={cx('w-2.5 h-2.5 rounded-full shrink-0', STATUS_STYLE[datesFor].cell)} />
                  <span className="text-[14px] font-semibold text-ink dark:text-white">
                    {fmtDateLong(isoDayToMs(d))}
                  </span>
                  <span className="ml-auto text-[11.5px] text-faint tabular-nums">{d}</span>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

export function Attendance() {
  const { center } = useApp()
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'clear' ? 'clear' : params.get('tab') === 'stats' ? 'stats' : 'take'
  const setTab = (t: Tab) => setParams(t === 'take' ? {} : { tab: t }, { replace: true })

  return (
    <div className="pb-4">
      <PageHeader title="Attendance" subtitle={center.name || 'UTSAHO EDUCARE'} />
      <div className="px-4">
        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-[#eef2f6] dark:bg-input-dark">
          {(
            [
              ['take', 'Take attendance'],
              ['clear', 'Absent Inform'],
              ['stats', 'Statistics'],
            ] as Array<[Tab, string]>
          ).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cx(
                'rounded-xl py-2.5 text-[13px] font-bold transition active:scale-[0.98]',
                tab === t
                  ? 'bg-white dark:bg-card-dark text-ink dark:text-white shadow-sm'
                  : 'text-muted dark:text-muted-dark',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {tab === 'take' && <TakeView />}
        {tab === 'clear' && <ClearView />}
        {tab === 'stats' && <StatsView />}
      </div>
    </div>
  )
}
