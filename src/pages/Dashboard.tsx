import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { useApp } from '../state/AppContext'
import { balanceOf, duesForPeriod, monthTotals, isMonthly, type DuesRow } from '../lib/ledger'
import { fmtTaka, periodNow, periodLabel } from '../lib/format'
import { Card } from '../components/ui'
import { SyncIndicator } from '../components/Layout'
import { ReauthBanner } from '../components/ReauthBanner'
import { fadeUp, useCountUp } from '../components/anim'
import { IconReceipt, IconSearch, IconCheck, IconCalendar, IconUsers, IconClock } from '../components/Icons'

function shiftPeriod(p: string, delta: number): string {
  const [y, m] = p.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function Dashboard() {
  const { user, students, payments, needsReauth } = useApp()
  const navigate = useNavigate()
  const now = periodNow()
  const [period, setPeriod] = useState(now)
  const [q, setQ] = useState('')

  const rows = useMemo(() => duesForPeriod(students, payments, period), [students, payments, period])
  const total = useMemo(() => monthTotals(payments, period), [payments, period])
  const totalDisp = useCountUp(total)
  const totalStr = fmtTaka(Math.round(totalDisp))
  const sizeFor = (s: string) =>
    s.length > 16 ? 'text-[13px]' : s.length > 11 ? 'text-[15px]' : 'text-[19px]'

  // collected this month = every receipt RECORDED inside the selected month,
  // regardless of which period it pays for (e.g. a September payment recorded
  // in August counts here in August). One-time fees are excluded - they are
  // tracked separately in the Accounting fee tab.
  const recordedTotal = useMemo(() => {
    const [y, m] = period.split('-').map(Number)
    const start = new Date(y, m - 1, 1).getTime()
    const end = new Date(y, m, 1).getTime()
    let s = 0
    for (const p of payments) {
      if (!isMonthly(p)) continue
      if (p.date >= start && p.date < end) s += balanceOf(p)
    }
    return s
  }, [payments, period])
  const recordedDisp = useCountUp(recordedTotal)
  const recordedStr = fmtTaka(Math.round(recordedDisp))
  const billed = rows.filter((r) => r.fee > 0)
  const paidCount = billed.filter((r) => r.paidAny).length
  const totalDue = rows.reduce((s, r) => s + r.due, 0)

  // net per-student collection (balance = real payment − commission) - used
  // for the batch collected figures, matching the home "Collected" total.
  // One-time fees never count toward monthly collection.
  const balanceByStudent = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of payments) {
      if (!isMonthly(p) || p.period !== period) continue
      map.set(p.studentId, (map.get(p.studentId) || 0) + balanceOf(p))
    }
    return map
  }, [payments, period])

  const batches = useMemo(() => {
    const map = new Map<string, DuesRow[]>()
    for (const r of rows) {
      const list = map.get(r.student.batch) || []
      list.push(r)
      map.set(r.student.batch, list)
    }
    return Array.from(map.entries())
      .map(([batch, list]) => ({
        batch,
        count: list.length,
        paid: list.filter((r) => r.paidAny).length,
        collected: list.reduce((s, r) => s + (balanceByStudent.get(r.student.id) || 0), 0),
        due: list.reduce((s, r) => s + r.due, 0),
      }))
      .sort((a, b) => a.batch.localeCompare(b.batch))
  }, [rows, balanceByStudent])

  const firstName = user?.name?.split('xyz')[0] || 'Teacher'

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault()
    navigate(`/students?q=${encodeURIComponent(q)}`)
  }

  return (
    <div>
      <div className="px-4 pt-5 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[12.5px] text-muted dark:text-muted-dark">Welcome back,</div>
            <div className="text-[22px] font-bold text-ink dark:text-white leading-tight">
              {firstName}
            </div>
          </div>
          <SyncIndicator />
        </div>

        {needsReauth && <ReauthBanner />}

        <form onSubmit={onSearch} className="mt-4">
          <div className="relative">
            <IconSearch className="w-[18px] h-[18px] absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search students…"
              className="w-full rounded-xl bg-white dark:bg-card-dark border border-line dark:border-line-dark pl-10 pr-4 py-3 text-[15px] text-body dark:text-text-dark placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-teal/25"
            />
          </div>
        </form>

        {/* Month switcher */}
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setPeriod(shiftPeriod(period, -1))}
            className="w-9 h-9 grid place-items-center rounded-lg bg-white dark:bg-card-dark border border-line dark:border-line-dark text-body dark:text-text-dark active:scale-95 transition"
            aria-label="Previous month"
          >
            ‹
          </button>
          <div className="flex items-center gap-1.5 text-[14px] font-semibold text-ink dark:text-white">
            <IconCalendar className="w-4 h-4 text-muted dark:text-muted-dark" />
            {periodLabel(period)}
          </div>
          <button
            onClick={() => setPeriod(shiftPeriod(period, 1))}
            className="w-9 h-9 grid place-items-center rounded-lg bg-white dark:bg-card-dark border border-line dark:border-line-dark text-body dark:text-text-dark active:scale-95 transition"
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2.5 px-4 mt-4">
        <Card className="!rounded-2xl p-3.5">
          <div className="text-[11px] font-semibold text-muted dark:text-muted-dark">Collected this month</div>
          <div className={`font-bold text-red-500 dark:text-red-400 tabular-nums mt-1 leading-tight ${sizeFor(fmtTaka(recordedTotal))}`}>
            {recordedStr}
          </div>
        </Card>
        <Card className="!rounded-2xl p-3.5">
          <div className="text-[11px] font-semibold text-muted dark:text-muted-dark">Collected for this month</div>
          <div className={`font-bold text-teal tabular-nums mt-1 leading-tight ${sizeFor(fmtTaka(total))}`}>
            {totalStr}
          </div>
        </Card>
        <Card className="!rounded-2xl p-3.5">
          <div className="text-[11px] font-semibold text-muted dark:text-muted-dark">Paid</div>
          <div className="text-[17px] font-bold text-ink dark:text-white tabular-nums mt-1">
            {paidCount}/{billed.length}
          </div>
        </Card>
        <button onClick={() => navigate('/routines')} className="text-left">
          <div className="h-full flex flex-col justify-center rounded-2xl bg-white dark:bg-card-dark border border-line dark:border-line-dark p-3.5 active:scale-[0.98] transition">
            <div className="text-[11px] font-semibold text-muted dark:text-muted-dark">Routine</div>
            <div className="inline-flex items-center gap-1.5 text-ink dark:text-white font-bold mt-1">
              <IconClock className="w-4 h-4 text-teal" />
              <span className="text-[14px] leading-tight">Tap to plan</span>
            </div>
          </div>
        </button>
      </div>

      {/* Quick actions - Record payment moved down here keeping its dark
          prominent design as a full-width button */}
      <div className="px-4 mt-3 space-y-2.5">
        <button
          onClick={() => navigate('/students?mode=record')}
          className="w-full flex items-center justify-center gap-2 rounded-2xl bg-ink text-white dark:bg-ink-soft border border-ink dark:border-ink-soft shadow-[0_2px_8px_rgba(18,49,79,0.28)] py-3.5 text-[15px] font-bold active:scale-[0.98] transition"
        >
          <IconReceipt className="w-5 h-5" /> Record payment
        </button>
      </div>

      {/* Batch summary */}
      {batches.length > 0 && (
        <div className="mt-6 px-4">
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-muted dark:text-muted-dark">
              Batches
            </div>
            {totalDue > 0 && (
              <div className="text-[12.5px] font-bold text-danger tabular-nums">
                Total due {fmtTaka(totalDue)}
              </div>
            )}
          </div>
          <div className="space-y-2">
            {batches.map((b, i) => (
              <motion.div key={b.batch} variants={fadeUp} custom={i} initial="hidden" animate="show">
                <Link to={`/students?batch=${encodeURIComponent(b.batch)}`} className="block active:scale-[0.99] transition">
                <Card className="!rounded-xl p-3.5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#e8f0f7] dark:bg-hover-dark grid place-items-center text-ink dark:text-accent-dark shrink-0">
                  <IconUsers className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-bold text-ink dark:text-white truncate">
                    {b.batch}
                  </div>
                  <div className="text-[12px] text-muted dark:text-muted-dark">
                    {b.paid}/{b.count} paid · {fmtTaka(b.collected)}
                  </div>
                </div>
                <div className="text-right">
                  {b.due > 0 ? (
                    <div className="text-[12.5px] font-bold text-danger">৳{b.due} due</div>
                  ) : (
                    <div className="text-[12.5px] font-bold text-emerald-600 flex items-center gap-1">
                      <IconCheck className="w-4 h-4" /> Clear
                    </div>
                  )}
                </div>
              </Card>
              </Link>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
