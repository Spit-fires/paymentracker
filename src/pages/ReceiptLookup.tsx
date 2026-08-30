import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import { fmtTaka, fmtDate, payingForDisplay, fmtInvoiceNo, invoiceDailySeq } from '../lib/format'
import { Card, EmptyState, PageHeader, Input } from '../components/ui'
import { IconReceipt, IconArrow } from '../components/Icons'

export function ReceiptLookup() {
  const { payments, students } = useApp()
  const navigate = useNavigate()
  const [q, setQ] = useState('')

  const results = useMemo(() => {
    const t = q.trim()
    if (!t) return []
    const num = t.replace(/\D/g, '')
    const qLower = t.toLowerCase()
    const qUpper = t.toUpperCase()
    const list = payments
      .filter((p) => {
        const inv = fmtInvoiceNo(p.date, p.dailySeq ?? invoiceDailySeq(p, payments))
        if (num && String(p.receiptNo) === num) return true
        if (num && String(p.receiptNo).includes(num)) return true
        if (inv.toLowerCase().includes(qLower) || inv.toUpperCase().includes(qUpper)) return true
        const s = students.find((x) => x.id === p.studentId)
        if (s && s.name.toLowerCase().includes(qLower)) return true
        return false
      })
      .sort((a, b) => b.date - a.date || b.receiptNo - a.receiptNo)
      .slice(0, 20)
    return list
  }, [payments, students, q])

  return (
    <div>
      <PageHeader title="Find receipt" subtitle="Search by receipt number or student name" back onBack={() => navigate(-1)} />
      <div className="px-4">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. 0042 or Rafi"
          autoFocus
          className="!text-[17px]"
        />
      </div>

      <div className="px-4 pt-4 space-y-2">
        {q && results.length === 0 && (
          <Card className="!rounded-2xl">
            <EmptyState icon={<IconReceipt className="w-7 h-7" />} title="No receipt found" />
          </Card>
        )}
        {results.map((p) => {
          const s = students.find((x) => x.id === p.studentId)
          return (
            <button
              key={p.id}
              onClick={() => navigate(`/receipt/${p.id}`)}
              className="w-full text-left"
            >
              <Card className="!rounded-xl p-3.5 flex items-center gap-3 active:scale-[0.99] transition">
                <div className="min-w-[78px] h-10 rounded-lg bg-[#e8f0f7] dark:bg-hover-dark grid place-items-center text-ink dark:text-accent-dark text-[10px] font-bold shrink-0 px-2 text-center leading-none whitespace-nowrap">
                  {fmtInvoiceNo(p.date, p.dailySeq ?? invoiceDailySeq(p, payments))}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-bold text-ink dark:text-white truncate">
                    {s?.name || '-'} <span className="font-semibold text-muted">· {fmtTaka(p.amount)}</span>
                  </div>
                  <div className="text-[12px] text-muted dark:text-muted-dark flex items-center gap-1.5">
                    {p.kind === 'fee' && (
                      <span className="text-[9.5px] font-bold uppercase tracking-wider text-teal dark:text-teal-bright bg-teal/10 dark:bg-teal/20 rounded px-1.5 py-0.5 shrink-0">
                        Fee
                      </span>
                    )}
                    <span className="truncate">{payingForDisplay(p)} · {fmtDate(p.date)} · {p.mode}</span>
                  </div>
                </div>
                <IconArrow className="w-4 h-4 text-faint dark:text-[#5f7a92]" />
              </Card>
            </button>
          )
        })}
      </div>
    </div>
  )
}
