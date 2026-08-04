import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import { fmtTaka, fmtDate, periodLabel } from '../lib/format'
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
    const list = payments
      .filter((p) => {
        if (num && String(p.receiptNo) === num) return true
        if (num && String(p.receiptNo).includes(num)) return true
        const s = students.find((x) => x.id === p.studentId)
        if (s && s.name.toLowerCase().includes(t.toLowerCase())) return true
        return false
      })
      .sort((a, b) => b.receiptNo - a.receiptNo)
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
              <Card className="!rounded-xl p-3.5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#e8f0f7] dark:bg-[#1d3144] grid place-items-center text-[#12314f] dark:text-[#cfe2f4] text-[12px] font-bold shrink-0">
                  #{String(p.receiptNo).padStart(4, '0')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-bold text-[#12314f] dark:text-white truncate">
                    {s?.name || '—'} <span className="font-semibold text-[#8a8578]">· {fmtTaka(p.amount)}</span>
                  </div>
                  <div className="text-[12px] text-[#8a8578] dark:text-[#93a7bb]">
                    {periodLabel(p.period)} · {fmtDate(p.date)} · {p.mode}
                  </div>
                </div>
                <IconArrow className="w-4 h-4 text-[#c4beb0] dark:text-[#5f7a92]" />
              </Card>
            </button>
          )
        })}
      </div>
    </div>
  )
}
