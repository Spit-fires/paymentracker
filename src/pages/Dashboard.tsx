import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import { duesForPeriod, monthTotals, type DuesRow } from '../lib/ledger'
import { fmtTaka, periodNow, periodLabel } from '../lib/format'
import { Card, EmptyState, Button } from '../components/ui'
import { SyncIndicator } from '../components/Layout'
import { IconReceipt, IconPlus, IconSearch, IconCheck } from '../components/Icons'

function shiftPeriod(p: string, delta: number): string {
  const [y, m] = p.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function Dashboard() {
  const { user, students, payments } = useApp()
  const navigate = useNavigate()
  const now = periodNow()
  const [period, setPeriod] = useState(now)
  const [q, setQ] = useState('')

  const rows = useMemo(() => duesForPeriod(students, payments, period), [students, payments, period])
  const total = useMemo(() => monthTotals(payments, period), [payments, period])
  const paidCount = rows.filter((r) => r.paidAny).length
  const dueCount = rows.length - paidCount

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
        collected: list.reduce((s, r) => s + r.paid, 0),
        due: list.reduce((s, r) => s + r.due, 0),
      }))
      .sort((a, b) => a.batch.localeCompare(b.batch))
  }, [rows])

  const unpaid = rows
    .filter((r) => !r.paidAny && r.student.defaultFee > 0)
    .sort((a, b) => a.student.name.localeCompare(b.student.name))

  const firstName = user?.name?.split(' ')[0] || 'Teacher'

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault()
    navigate(`/students?q=${encodeURIComponent(q)}`)
  }

  return (
    <div>
      <div className="px-4 pt-5 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[13px] text-[#8a8578] dark:text-[#93a7bb]">Welcome back,</div>
            <div className="text-[22px] font-bold text-[#12314f] dark:text-white leading-tight">
              {firstName}
            </div>
          </div>
          <SyncIndicator />
        </div>

        <form onSubmit={onSearch} className="mt-4">
          <div className="relative">
            <IconSearch className="w-[18px] h-[18px] absolute left-3.5 top-1/2 -translate-y-1/2 text-[#a29b8d]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search students…"
              className="w-full rounded-xl bg-white dark:bg-[#141f2c] border border-[#e8e3d9] dark:border-[#253546] pl-10 pr-4 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#12314f]/20"
            />
          </div>
        </form>

        {/* Month switcher */}
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setPeriod(shiftPeriod(period, -1))}
            className="w-8 h-8 grid place-items-center rounded-lg bg-white dark:bg-[#141f2c] border border-[#e8e3d9] dark:border-[#253546] text-[#3d4c5c] dark:text-[#b8c6d4]"
            aria-label="Previous month"
          >
            ‹
          </button>
          <div className="text-[14px] font-semibold text-[#12314f] dark:text-white">
            {periodLabel(period)}
          </div>
          <button
            onClick={() => setPeriod(shiftPeriod(period, 1))}
            disabled={period >= now}
            className="w-8 h-8 grid place-items-center rounded-lg bg-white dark:bg-[#141f2c] border border-[#e8e3d9] dark:border-[#253546] text-[#3d4c5c] dark:text-[#b8c6d4] disabled:opacity-30"
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2.5 px-4">
        <Card className="!rounded-2xl p-3">
          <div className="text-[11px] text-[#8a8578] dark:text-[#93a7bb]">Collected</div>
          <div className="text-[17px] font-bold text-[#0f766e] tabular-nums mt-0.5 truncate">
            {fmtTaka(total)}
          </div>
        </Card>
        <Card className="!rounded-2xl p-3">
          <div className="text-[11px] text-[#8a8578] dark:text-[#93a7bb]">Paid</div>
          <div className="text-[17px] font-bold text-[#12314f] dark:text-white tabular-nums mt-0.5">
            {paidCount}/{rows.length}
          </div>
        </Card>
        <Card className="!rounded-2xl p-3">
          <div className="text-[11px] text-[#8a8578] dark:text-[#93a7bb]">Pending</div>
          <div
            className={`text-[17px] font-bold tabular-nums mt-0.5 ${dueCount ? 'text-red-600' : 'text-emerald-600'}`}
          >
            {dueCount}
          </div>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-2.5 px-4 mt-3">
        <Button
          variant="primary"
          className="!py-3"
          onClick={() => navigate('/students?mode=record')}
        >
          <IconReceipt className="w-4.5 h-4.5" /> Record payment
        </Button>
        <Button
          variant="secondary"
          className="!py-3"
          onClick={() => navigate('/students?new=1')}
        >
          <IconPlus className="w-4.5 h-4.5" /> Add student
        </Button>
      </div>

      {/* Batch summary */}
      {batches.length > 0 && (
        <div className="mt-5 px-4">
          <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8a8578] dark:text-[#93a7bb] mb-2">
            Batches
          </div>
          <div className="space-y-2">
            {batches.map((b) => (
              <Card key={b.batch} className="!rounded-xl p-3.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-bold text-[#12314f] dark:text-white truncate">
                    {b.batch}
                  </div>
                  <div className="text-[12px] text-[#8a8578] dark:text-[#93a7bb]">
                    {b.paid}/{b.count} paid · {fmtTaka(b.collected)}
                  </div>
                </div>
                <div className="text-right">
                  {b.due > 0 ? (
                    <div className="text-[12px] font-semibold text-red-600">৳{b.due} due</div>
                  ) : (
                    <div className="text-[12px] font-semibold text-emerald-600 flex items-center gap-1">
                      <IconCheck className="w-3.5 h-3.5" /> Clear
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Unpaid list */}
      <div className="mt-5 px-4 pb-4">
        <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8a8578] dark:text-[#93a7bb] mb-2">
          Not paid yet · {periodLabel(period)}
        </div>
        {unpaid.length === 0 ? (
          <Card className="!rounded-2xl">
            <EmptyState
              icon={<IconCheck className="w-7 h-7" />}
              title="All paid up!"
              subtitle={rows.length ? `Everyone paid for ${periodLabel(period)}.` : 'Add students to get started.'}
              action={
                rows.length === 0 ? (
                  <Button variant="secondary" onClick={() => navigate('/students?new=1')}>
                    <IconPlus className="w-4 h-4" /> Add first student
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <div className="space-y-2">
            {unpaid.map((r) => (
              <Card key={r.student.id} className="!rounded-xl p-3.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[14.5px] font-bold text-[#12314f] dark:text-white truncate">
                    {r.student.name}
                  </div>
                  <div className="text-[12px] text-[#8a8578] dark:text-[#93a7bb]">
                    {r.student.batch} · {r.due > 0 ? `${fmtTaka(r.due)} pending` : 'no fee set'}
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/student/${r.student.id}`)}
                  className="text-[#0f766e] font-semibold text-[13px] whitespace-nowrap"
                >
                  View
                </button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
