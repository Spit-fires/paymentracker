import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import { fmtTaka, fmtDate } from '../lib/format'
import { getKV, setKV, K } from '../lib/db'
import { Card, PageHeader, EmptyState, cx } from '../components/ui'
import { IconBook, IconSearch, IconUsers } from '../components/Icons'
import type { Payment } from '../types'

type Tab = 'ledger' | 'commissions'

interface AcctFilters {
  batch: string
  from: string
  to: string
  teacher: string
}

const num = (v?: number) => (typeof v === 'number' && isFinite(v) ? v : 0)

export function Accounting() {
  const { payments, students, teachers, center } = useApp()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') === 'commissions' ? 'commissions' : 'ledger') as Tab

  const [q, setQ] = useState('')
  const [batch, setBatch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [teacher, setTeacher] = useState('')

  // restore the last-used filters (batch/from/to/teacher) from pt_kv — same
  // pattern as the Students page batch filter; writes stay disabled until the
  // restore finishes so the first render never clobbers the saved values
  const filtersReady = useRef(false)
  useEffect(() => {
    void (async () => {
      const saved = await getKV<AcctFilters>(K.ACCT_FILTERS)
      if (saved) {
        if (saved.batch) setBatch(saved.batch)
        if (saved.from) setFrom(saved.from)
        if (saved.to) setTo(saved.to)
        if (saved.teacher) setTeacher(saved.teacher)
      }
      filtersReady.current = true
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!filtersReady.current) return
    void setKV(K.ACCT_FILTERS, { batch, from, to, teacher })
  }, [batch, from, to, teacher])

  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students])
  const batches = useMemo(
    () => Array.from(new Set(students.map((s) => s.batch).filter(Boolean))).sort(),
    [students],
  )

  const inRange = (p: Payment) => {
    if (from) {
      const f = new Date(from + 'T00:00:00').getTime()
      if (p.date < f) return false
    }
    if (to) {
      const t = new Date(to + 'T00:00:00').getTime() + 86400000 - 1
      if (p.date > t) return false
    }
    return true
  }

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return payments
      .filter(inRange)
      .filter((p) => {
        const s = studentMap.get(p.studentId)
        if (!s) return false
        if (batch && s.batch !== batch) return false
        if (ql && !s.name.toLowerCase().includes(ql)) return false
        return true
      })
      .sort((a, b) => b.date - a.date)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments, students, q, batch, from, to])

  const ledgerRows = rows

  const commissionRows = useMemo(
    () =>
      rows.filter((p) => {
        const t = p.receivedBy?.name || ''
        if (!t) return false
        if (teacher && t !== teacher) return false
        return num(p.commission) > 0
      }),
    [rows, teacher],
  )

  const totals = useMemo(() => {
    let slip = 0
    let real = 0
    let balance = 0
    for (const p of ledgerRows) {
      const r = num(p.realAmount ?? p.amount)
      const c = num(p.commission)
      slip += num(p.amount)
      real += r
      balance += r - c
    }
    return { slip, real, balance, count: ledgerRows.length }
  }, [ledgerRows])

  const commTotal = useMemo(
    () => commissionRows.reduce((a, p) => a + num(p.commission), 0),
    [commissionRows],
  )

  const setTab = (t: Tab) => setParams(t === 'ledger' ? {} : { tab: t }, { replace: true })

  return (
    <div className="pb-4">
      <PageHeader
        title="Accounting"
        subtitle={center.name || 'UTSAHO EDUCARE'}
      />

      <div className="px-4">
        {/* Sub-navigation */}
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-[#eef2f6] dark:bg-input-dark">
          {(
            [
              ['ledger', 'Ledger'],
              ['commissions', 'Commissions'],
            ] as Array<[Tab, string]>
          ).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cx(
                'rounded-xl py-2.5 text-[13.5px] font-bold transition active:scale-[0.98]',
                tab === t
                  ? 'bg-white dark:bg-card-dark text-ink dark:text-white shadow-sm'
                  : 'text-muted dark:text-muted-dark',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="mt-3 space-y-2.5">
          <div className="relative">
            <IconSearch className="w-[18px] h-[18px] absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by student name…"
              className="w-full rounded-xl bg-white dark:bg-card-dark border border-line dark:border-line-dark pl-10 pr-4 py-3 text-[15px] text-body dark:text-text-dark placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-teal/25"
            />
          </div>

          {tab === 'commissions' && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setTeacher('')}
                className={cx(
                  'shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition',
                  !teacher
                    ? 'bg-ink text-white'
                    : 'bg-white dark:bg-card-dark text-body/70 dark:text-muted-dark border border-line dark:border-line-dark',
                )}
              >
                All teachers
              </button>
              {teachers.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTeacher(teacher === t.name ? '' : t.name)}
                  className={cx(
                    'shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition',
                    teacher === t.name
                      ? 'bg-ink text-white'
                      : 'bg-white dark:bg-card-dark text-body/70 dark:text-muted-dark border border-line dark:border-line-dark',
                  )}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}

          {batches.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setBatch('')}
                className={cx(
                  'shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition',
                  !batch
                    ? 'bg-ink text-white'
                    : 'bg-white dark:bg-card-dark text-body/70 dark:text-muted-dark border border-line dark:border-line-dark',
                )}
              >
                All batches
              </button>
              {batches.map((b) => (
                <button
                  key={b}
                  onClick={() => setBatch(batch === b ? '' : b)}
                  className={cx(
                    'shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition',
                    batch === b
                      ? 'bg-ink text-white'
                      : 'bg-white dark:bg-card-dark text-body/70 dark:text-muted-dark border border-line dark:border-line-dark',
                  )}
                >
                  {b}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <div className="text-[11.5px] font-semibold text-muted dark:text-muted-dark mb-1">From</div>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full rounded-xl border border-line dark:border-line-dark bg-white dark:bg-input-dark px-3 py-2.5 text-[13.5px] font-semibold text-ink dark:text-white focus:outline-none focus:ring-2 focus:ring-teal/30"
              />
            </label>
            <label className="block">
              <div className="text-[11.5px] font-semibold text-muted dark:text-muted-dark mb-1">To</div>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full rounded-xl border border-line dark:border-line-dark bg-white dark:bg-input-dark px-3 py-2.5 text-[13.5px] font-semibold text-ink dark:text-white focus:outline-none focus:ring-2 focus:ring-teal/30"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Ledger */}
      {tab === 'ledger' && (
        <div className="px-4 mt-3">
          {ledgerRows.length === 0 ? (
            <Card className="!rounded-2xl">
              <EmptyState
                icon={<IconBook className="w-7 h-7" />}
                title="No entries"
                subtitle="Receipts within the selected filters will appear here."
              />
            </Card>
          ) : (
            <Card className="!rounded-xl overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-faint border-b border-line dark:border-line-dark">
                <div>Student — Batch</div>
                <div className="text-right w-[68px]">Slip</div>
                <div className="text-right w-[68px]">Real</div>
                <div className="text-right w-[72px]">Balance</div>
              </div>
              <div className="max-h-[46dvh] overflow-y-auto">
                {ledgerRows.map((p) => {
                  const s = studentMap.get(p.studentId)
                  const real = num(p.realAmount ?? p.amount)
                  const balance = real - num(p.commission)
                  return (
                    <div
                      key={p.id}
                      className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-3 py-2.5 border-b border-line/60 dark:border-line-dark/60 last:border-0"
                    >
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-semibold text-ink dark:text-white truncate">
                          {s?.name || '—'}
                        </div>
                        <div className="text-[11px] text-faint truncate">
                          {s?.batch || 'No batch'} · {fmtDate(p.date)}
                        </div>
                      </div>
                      <div className="text-right w-[68px] text-[12.5px] text-body dark:text-text-dark tabular-nums pt-0.5">
                        {fmtTaka(p.amount)}
                      </div>
                      <div className="text-right w-[68px] text-[12.5px] text-body dark:text-text-dark tabular-nums pt-0.5">
                        {fmtTaka(real)}
                      </div>
                      <div
                        className={cx(
                          'text-right w-[72px] text-[12.5px] font-bold tabular-nums pt-0.5',
                          balance < 0 ? 'text-danger' : 'text-ink dark:text-white',
                        )}
                      >
                        {fmtTaka(balance)}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-3 py-2.5 bg-cream dark:bg-input-dark border-t border-line dark:border-line-dark">
                <div className="text-[12.5px] font-bold text-ink dark:text-white pt-0.5">
                  Total · {totals.count} receipts
                </div>
                <div className="text-right w-[68px] text-[13px] font-bold text-ink dark:text-white tabular-nums">
                  {fmtTaka(totals.slip)}
                </div>
                <div className="text-right w-[68px] text-[13px] font-bold text-ink dark:text-white tabular-nums">
                  {fmtTaka(totals.real)}
                </div>
                <div className="text-right w-[72px] text-[13px] font-bold text-teal dark:text-teal-bright tabular-nums">
                  {fmtTaka(totals.balance)}
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Commissions */}
      {tab === 'commissions' && (
        <div className="px-4 mt-3 space-y-3">
          <Card className="!rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal/10 dark:bg-teal/20 grid place-items-center shrink-0">
              <IconUsers className="w-5 h-5 text-teal" />
            </div>
            <div className="flex-1">
              <div className="text-[11px] uppercase tracking-wider text-faint">Total commission</div>
              <div className="text-[18px] font-bold text-ink dark:text-white tabular-nums">
                {fmtTaka(commTotal)}
              </div>
            </div>
            <div className="text-right text-[12px] text-muted dark:text-muted-dark">
              {commissionRows.length} receipt{commissionRows.length === 1 ? '' : 's'}
              {teacher ? ` · ${teacher}` : ''}
            </div>
          </Card>

          {commissionRows.length === 0 ? (
            <Card className="!rounded-2xl">
              <EmptyState
                icon={<IconBook className="w-7 h-7" />}
                title="No commissions"
                subtitle={
                  teacher
                    ? `${teacher} has no commission entries in this range.`
                    : 'Receipts with a commission will appear here.'
                }
              />
            </Card>
          ) : (
            <Card className="!rounded-xl overflow-hidden">
              <div className="grid grid-cols-[1fr_auto] gap-x-2 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-faint border-b border-line dark:border-line-dark">
                <div>Student — Batch</div>
                <div className="text-right w-[88px]">Commission</div>
              </div>
              <div className="max-h-[46dvh] overflow-y-auto">
                {commissionRows.map((p) => {
                  const s = studentMap.get(p.studentId)
                  return (
                    <div
                      key={p.id}
                      className="grid grid-cols-[1fr_auto] gap-x-2 px-3 py-2.5 border-b border-line/60 dark:border-line-dark/60 last:border-0"
                    >
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-semibold text-ink dark:text-white truncate">
                          {s?.name || '—'}
                        </div>
                        <div className="text-[11px] text-faint truncate">
                          {s?.batch || 'No batch'} · {fmtDate(p.date)}
                        </div>
                      </div>
                      <div className="text-right w-[88px] text-[12.5px] font-bold text-ink dark:text-white tabular-nums pt-0.5">
                        {fmtTaka(num(p.commission))}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-x-2 px-3 py-2.5 bg-cream dark:bg-input-dark border-t border-line dark:border-line-dark">
                <div className="text-[12.5px] font-bold text-ink dark:text-white pt-0.5">Total</div>
                <div className="text-right w-[88px] text-[13px] font-bold text-teal dark:text-teal-bright tabular-nums">
                  {fmtTaka(commTotal)}
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}