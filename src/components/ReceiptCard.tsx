import type { Payment, Student, Center } from '../types'
import { fmtTaka, takaToWords, fmtDate, periodLabel } from '../lib/format'

interface Props {
  center: Center
  student: Student
  payment: Payment
}

export function ReceiptCard({ center, student, payment }: Props) {
  return (
    <div className="receipt-card">
      {/* Header */}
      <div className="bg-[#12314f] text-white rounded-t-lg overflow-hidden">
        <div className="flex items-center justify-between px-7 pt-6 pb-5">
          <div>
            <div className="text-[15px] uppercase tracking-[0.28em] font-semibold">
              {center.name || 'Utshaho Educare'}
            </div>
            {center.tagline && (
              <div className="text-white/70 text-[11px] tracking-[0.14em] mt-1">
                {center.tagline}
              </div>
            )}
            {(center.address || center.phone) && (
              <div className="text-white/60 text-[10.5px] mt-1.5">
                {[center.address, center.phone].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="text-[11px] tracking-[0.24em] text-white/70 font-medium">
              PAYMENT RECEIPT
            </div>
            <div className="text-[22px] font-semibold tabular-nums mt-1">
              #{String(payment.receiptNo).padStart(4, '0')}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-7 py-6">
        <div className="text-[10.5px] uppercase tracking-[0.2em] text-[#8a8578] mb-3">
          Received from
        </div>
        <div className="grid grid-cols-[110px_1fr] gap-y-2.5 text-[14px]">
          <div className="text-[#8a8578]">Student</div>
          <div className="font-semibold text-[#1c2936]">{student.name}</div>
          <div className="text-[#8a8578]">Batch / Class</div>
          <div className="text-[#1c2936]">{student.batch || '—'}</div>
          <div className="text-[#8a8578]">Payment mode</div>
          <div className="text-[#1c2936]">{payment.mode}</div>
          <div className="text-[#8a8578]">For the month</div>
          <div className="text-[#1c2936]">{periodLabel(payment.period)}</div>
          <div className="text-[#8a8578]">Date</div>
          <div className="text-[#1c2936]">{fmtDate(payment.date)}</div>
        </div>

        {/* Amount */}
        <div className="mt-6 rounded-lg border border-[#e3ded2] bg-[#faf8f2] px-5 py-4 flex items-center justify-between gap-4">
          <div className="text-[10.5px] uppercase tracking-[0.2em] text-[#8a8578]">Amount paid</div>
          <div className="text-right">
            <div className="text-[26px] font-bold text-[#12314f] tabular-nums leading-none">
              {fmtTaka(payment.amount)}
            </div>
            <div className="text-[11px] italic text-[#6b665c] mt-1.5">
              Taka {takaToWords(payment.amount)} Only
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-end justify-between">
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.2em] text-[#8a8578]">
              Received by
            </div>
            <div className="w-36 border-b border-[#1c2936] mt-2" />
            <div className="text-[11px] text-[#8a8578] mt-1.5">{center.name || 'Utshaho Educare'}</div>
          </div>
          <div className="text-right text-[12px] text-[#6b665c] italic">Thank you!</div>
        </div>
      </div>
    </div>
  )
}
