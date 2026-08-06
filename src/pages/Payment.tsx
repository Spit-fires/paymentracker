import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toPng } from 'html-to-image'
import { useApp } from '../state/AppContext'
import {
  studentPeriodPaid,
  lastPaymentForStudent,
  autofillAmount,
} from '../lib/ledger'
import { fmtTaka, takaToWords, periodNow, periodLabel, receiptFileName } from '../lib/format'
import type { PaymentMode } from '../types'
import { Card, Button, PageHeader, Spinner, useBlobUrl } from '../components/ui'
import { ReceiptCard } from '../components/ReceiptCard'
import { IconCheck, IconReceipt } from '../components/Icons'

const MODES: PaymentMode[] = ['Cash', 'Bkash', 'Nagad', 'Other']

function shiftPeriod(p: string, delta: number): string {
  const [y, m] = p.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function Payment() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { students, payments, center, receiptSeq, addPayment, updatePayment, showToast } = useApp()

  const student = students.find((s) => s.id === id)
  const photoUrl = useBlobUrl(student?.photoBlob)
  const prefill = params.get('prefill')
  const existing = useMemo(
    () => (prefill ? payments.find((x) => x.id === prefill) : undefined),
    [prefill, payments],
  )

  const period = periodNow()
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState<PaymentMode>('Cash')
  const [selPeriod, setSelPeriod] = useState(period)
  const [busy, setBusy] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!student) return
    // autofill from last month, or from a linked payment for re-record
    if (prefill) {
      const p = payments.find((x) => x.id === prefill)
      if (p) {
        setAmount(String(p.amount))
        setMode(p.mode)
        setSelPeriod(p.period)
        return
      }
    }
    setAmount(String(autofillAmount(students, payments, student.id, period)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student?.id, prefill])

  const lastTotal = useMemo(
    () => (student ? studentPeriodPaid(payments, student.id, selPeriod) : 0),
    [student, payments, selPeriod],
  )
  const lastPayment = useMemo(
    () => (student ? lastPaymentForStudent(payments, student.id) : undefined),
    [student, payments],
  )
  const amountNum = Number(amount) || 0

  const draftPayment = useMemo(() => {
    if (!student) return null
    return {
      id: 'preview',
      receiptNo: existing ? existing.receiptNo : receiptSeq + 1,
      studentId: student.id,
      amount: amountNum,
      mode,
      period: selPeriod,
      date: existing ? existing.date : Date.now(),
      updatedAt: Date.now(),
    }
  }, [student, existing, amountNum, mode, selPeriod, receiptSeq])

  if (!student) {
    return (
      <div>
        <PageHeader title="Record payment" back onBack={() => navigate('/students')} />
        <Card className="mx-4">
          <div className="text-center text-[14px] text-muted py-8">Student not found</div>
        </Card>
      </div>
    )
  }

  const submit = async () => {
    if (amountNum <= 0) return showToast('Enter a valid amount', 'err')
    if (!previewRef.current) return showToast('Please wait, still loading', 'err')
    setBusy(true)
    try {
      const blob = await toPng(previewRef.current, { pixelRatio: 2, cacheBust: true }).then((dataUrl) =>
        fetch(dataUrl).then((r) => r.blob()),
      )
      if (existing) {
        await updatePayment(existing.id, {
          amount: amountNum,
          mode,
          period: selPeriod,
          pngBlob: blob,
        })
        showToast(`Receipt #${String(existing.receiptNo).padStart(4, '0')} updated`, 'ok')
        navigate(`/receipt/${existing.id}`)
      } else {
        const payment = await addPayment({
          studentId: student.id,
          amount: amountNum,
          mode,
          period: selPeriod,
          date: Date.now(),
          pngBlob: blob,
        })
        showToast(`Receipt #${String(payment.receiptNo).padStart(4, '0')} created`, 'ok')
        navigate(`/receipt/${payment.id}?new=1`)
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not create receipt', 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title={existing ? 'Edit receipt' : 'Record payment'} back onBack={() => navigate(-1)} />

      <div className="px-4 space-y-4">
        {/* Student summary */}
        <Card className="!rounded-2xl p-4 flex items-center gap-3">
          {photoUrl ? (
            <img src={photoUrl} alt="" className="w-12 h-12 rounded-full object-cover" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-ink dark:bg-ink-soft grid place-items-center text-white font-bold text-[16px] shrink-0">
              {student.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[16px] font-bold text-ink dark:text-white truncate">{student.name}</div>
            <div className="text-[12.5px] text-muted dark:text-muted-dark">
              {student.batch || 'No batch'} {student.defaultFee > 0 && `· fee ${fmtTaka(student.defaultFee)}`}
            </div>
          </div>
          {lastPayment && (
            <div className="text-right shrink-0">
              <div className="text-[10px] uppercase tracking-wider text-faint">Last payment</div>
              <div className="text-[13px] font-bold text-teal tabular-nums">{fmtTaka(lastPayment.amount)}</div>
            </div>
          )}
        </Card>

        {/* Amount */}
        <Card className="!rounded-2xl p-4">
          <div className="text-[13px] font-semibold text-body/80 dark:text-muted-dark mb-1.5">
            Amount paid (৳)
          </div>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[20px] font-bold text-ink dark:text-white">
              ৳
            </span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
              inputMode="numeric"
              placeholder="0"
              className="w-full rounded-xl border border-line dark:border-line-dark bg-white dark:bg-input-dark pl-11 pr-4 py-3.5 text-[26px] font-bold text-ink dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-teal/30"
            />
          </div>
          {amountNum > 0 && (
            <div className="text-[12.5px] italic text-muted dark:text-muted-dark mt-2">
              Taka {takaToWords(amountNum)} Only
            </div>
          )}
          {lastTotal > 0 && (
            <button
              onClick={() => setAmount(String(lastTotal))}
              className="text-[12.5px] font-semibold text-teal mt-2 py-1"
            >
              Use this month's total ({fmtTaka(lastTotal)})
            </button>
          )}
        </Card>

        {/* Mode */}
        <div>
          <div className="text-[13px] font-semibold text-body/80 dark:text-muted-dark mb-1.5">
            Payment mode
          </div>
          <div className="grid grid-cols-4 gap-2">
            {MODES.map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-xl py-3 text-[13.5px] font-bold transition active:scale-[0.97] ${
                  mode === m
                    ? 'bg-ink text-white shadow-[0_2px_8px_rgba(18,49,79,0.25)] dark:bg-ink-soft'
                    : 'bg-white dark:bg-card-dark border border-line dark:border-line-dark text-body/70 dark:text-muted-dark'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Period */}
        <div>
          <div className="text-[13px] font-semibold text-body/80 dark:text-muted-dark mb-1.5">
            Paying for
          </div>
          <div className="flex items-center justify-between rounded-xl bg-white dark:bg-card-dark border border-line dark:border-line-dark px-3 py-2">
            <button
              onClick={() => setSelPeriod(shiftPeriod(selPeriod, -1))}
              className="w-9 h-9 grid place-items-center rounded-lg text-body dark:text-text-dark text-[18px] active:scale-95 transition"
              aria-label="Previous month"
            >
              ‹
            </button>
            <div className="text-[14px] font-semibold text-ink dark:text-white">{periodLabel(selPeriod)}</div>
            <button
              onClick={() => setSelPeriod(shiftPeriod(selPeriod, 1))}
              className="w-9 h-9 grid place-items-center rounded-lg text-body dark:text-text-dark text-[18px] active:scale-95 transition"
              aria-label="Next month"
            >
              ›
            </button>
          </div>
        </div>

        {/* Live preview note */}
        <div className="flex items-start gap-2 text-[12px] text-muted dark:text-muted-dark">
          <IconReceipt className="w-4 h-4 shrink-0 mt-0.5" />
          {existing ? (
            <span>
              Receipt #{String(existing.receiptNo).padStart(4, '0')} will be{' '}
              <b className="text-teal">updated</b>, keeping its original number and date.
            </span>
          ) : (
            <span>
              Receipt #{String(receiptSeq + 1).padStart(4, '0')} · {receiptFileName(receiptSeq + 1, Date.now())}{' '}
              will be saved to this student's Drive folder.
            </span>
          )}
        </div>

        <Button full size="lg" onClick={submit} disabled={busy}>
          {busy ? <Spinner className="text-white" /> : <IconCheck className="w-5 h-5" />}
          {busy ? 'Saving…' : existing ? 'Save changes' : 'Submit payment'}
        </Button>
      </div>

      {/* Off-screen receipt for PNG capture */}
      {draftPayment && (
        <div className="fixed left-[-2000px] top-0 pointer-events-none" aria-hidden>
          <div ref={previewRef}>
            <ReceiptCard
              center={center}
              student={student}
              payment={{
                ...draftPayment,
                amount: Math.max(amountNum, 0),
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
