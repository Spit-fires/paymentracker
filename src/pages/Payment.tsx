import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { domToPng } from 'modern-screenshot'
import { toPng as htmlToImageToPng } from 'html-to-image'
import { useApp } from '../state/AppContext'
import {
  studentPeriodPaid,
  lastPaymentForStudent,
  lastFeeForStudent,
  autofillAmount,
  realAutofillAmount,
} from '../lib/ledger'
import { fmtTaka, takaToWords, periodNow, periodLabel, receiptFileName, dayKey, fmtInvoiceNo, invoiceDailySeq } from '../lib/format'
import type { PaymentMode, Teacher } from '../types'
import { Card, Button, PageHeader, Spinner, useBlobUrl } from '../components/ui'
import { ReceiptCard } from '../components/ReceiptCard'
import { IconCheck, IconReceipt, IconPlus, IconInfo } from '../components/Icons'

const MODES: PaymentMode[] = ['Cash', 'Bkash', 'Nagad', 'Other']

function shiftPeriod(p: string, delta: number): string {
  const [y, m] = p.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Rasterize the receipt node to a PNG data URL. modern-screenshot draws
 * images directly to canvas (works on iOS Safari where html-to-image's
 * SVG foreignObject renders images blank); fall back to html-to-image. */
async function capturePng(node: HTMLElement): Promise<string> {
  try {
    return await domToPng(node, { scale: 2 })
  } catch {
    return htmlToImageToPng(node, { pixelRatio: 2 })
  }
}

export function Payment() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { students, payments, center, receiptSeq, teachers, addPayment, updatePayment, showToast } = useApp()

  const student = students.find((s) => s.id === id)
  const photoUrl = useBlobUrl(student?.photoBlob)
  const prefill = params.get('prefill')
  const feeParam = params.get('fee') === '1'
  const existing = useMemo(
    () => (prefill ? payments.find((x) => x.id === prefill) : undefined),
    [prefill, payments],
  )

  // saved fee titles - every label used on a one-time fee becomes a dropdown
  // option (same pattern as school names derived from students)
  const feeTitles = useMemo(
    () =>
      Array.from(
        new Set(
          payments
            .filter((p) => p.kind === 'fee' && p.feeLabel?.trim())
            .map((p) => p.feeLabel!.trim()),
        ),
      ).sort(),
    [payments],
  )

  const period = periodNow()
  const [kind, setKind] = useState<'monthly' | 'fee'>(feeParam ? 'fee' : 'monthly')
  const [feeTitle, setFeeTitle] = useState('')
  // "Other" mode for the fee-title dropdown - mirrors the school picker
  const [feeOther, setFeeOther] = useState(false)
  const [amount, setAmount] = useState('')
  const [realAmount, setRealAmount] = useState('')
  const [commissionOn, setCommissionOn] = useState(false)
  const [commission, setCommission] = useState('')
  const [due, setDue] = useState('0')
  const [mode, setMode] = useState<PaymentMode>('Cash')
  const [receivedBy, setReceivedBy] = useState<Teacher | undefined>()
  const [selPeriod, setSelPeriod] = useState(period)
  const [periodType, setPeriodType] = useState<'month' | 'range'>('month')
  const [rangeFrom, setRangeFrom] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [rangeTo, setRangeTo] = useState(() => {
    const d = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [receivedDate, setReceivedDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [busy, setBusy] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!student) return
    // autofill from last month, or from a linked payment for re-record
    if (prefill) {
      const p = payments.find((x) => x.id === prefill)
      if (p) {
        setKind(p.kind === 'fee' ? 'fee' : 'monthly')
        setFeeTitle(p.kind === 'fee' ? p.feeLabel || '' : '')
        // a prefilled label is always a known option (the record itself is in
        // payments) - but stay safe with labels that somehow aren't
        setFeeOther(p.kind === 'fee' ? !!p.feeLabel?.trim() && !feeTitles.includes(p.feeLabel.trim()) : false)
        setAmount(String(p.amount))
        setRealAmount(p.realAmount != null ? String(p.realAmount) : '')
        setCommissionOn(p.commission != null)
        setCommission(p.commission != null ? String(p.commission) : '')
        setDue(String(p.due || 0))
        setMode(p.mode)
        if (p.receivedBy) {
          const t = teachers.find((x) => x.name === p.receivedBy?.name)
          setReceivedBy(t || { id: p.receivedBy.name, name: p.receivedBy.name, phone: p.receivedBy.phone })
        }
        if (p.kind === 'fee') {
          // one-time fees are always month-based - no date-range variant
          setPeriodType('month')
          setSelPeriod(p.period)
        } else if (p.periodType === 'range' && p.periodFrom && p.periodTo) {
          setPeriodType('range')
          const f = new Date(p.periodFrom)
          const t = new Date(p.periodTo)
          setRangeFrom(`${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`)
          setRangeTo(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`)
        } else {
          setPeriodType('month')
          setSelPeriod(p.period)
        }
        const d = new Date(p.date)
        setReceivedDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
        return
      }
    }
    // one-time fees never autofill - each fee is its own amount
    if (feeParam) {
      setFeeTitle('')
      setFeeOther(false)
      return
    }
    setAmount(String(autofillAmount(students, payments, student.id, period)))
    // real payment prefills from the student's recorded real fee, else last
    // month's real total - blank keeps it "same as slip"
    const real = realAutofillAmount(students, payments, student.id, period)
    if (real > 0) setRealAmount(String(real))
    // commission prefills from the student's monthly commission when there are
    // teachers to receive it - receipt edits keep their own values
    if (student.commission && teachers.length > 0) {
      setCommissionOn(true)
      setCommission(String(student.commission))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student?.id, prefill, feeParam])

  /** Monthly ↔ Fee switch: fees drop commission (never tracked on fees) and
   *  monthly re-runs the amount autofill when the slip is still blank. */
  const switchKind = (next: 'monthly' | 'fee') => {
    if (next === kind) return
    setKind(next)
    if (next === 'fee') {
      setCommissionOn(false)
      setCommission('')
    } else if (amount.trim() === '' && student) {
      setAmount(String(autofillAmount(students, payments, student.id, selPeriod)))
      const real = realAutofillAmount(students, payments, student.id, selPeriod)
      if (real > 0) setRealAmount(String(real))
    }
  }

  // upgrade a refilled teacher snapshot (synthetic id = name) to the real
  // Settings teacher once the list is available - without clobbering a
  // teacher the user picked from the chips themselves
  useEffect(() => {
    if (!receivedBy || receivedBy.id !== receivedBy.name) return
    const t = teachers.find((x) => x.name === receivedBy.name)
    if (t) setReceivedBy(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teachers])

  const lastTotal = useMemo(
    () => (student && kind === 'monthly' ? studentPeriodPaid(payments, student.id, selPeriod) : 0),
    [student, payments, selPeriod, kind],
  )
  const lastPayment = useMemo(
    () =>
      student
        ? kind === 'fee'
          ? lastFeeForStudent(payments, student.id)
          : lastPaymentForStudent(payments, student.id)
        : undefined,
    [student, payments, kind],
  )
  const amountNum = Number(amount) || 0
  const dueNum = Math.max(0, Number(due) || 0)
  const realNum = Number(realAmount) || 0
  const commissionNum = commissionOn ? Number(commission) || 0 : 0

  const draftPayment = useMemo(() => {
    if (!student) return null
    const dateMs = new Date(receivedDate + 'T00:00:00').getTime() || Date.now()
    const dailySeq = (() => {
      if (existing?.dailySeq != null) return existing.dailySeq
      const day = dayKey(new Date(existing ? existing.date : dateMs))
      const sameDay = payments.filter((p) => !p.deletedAt && dayKey(new Date(p.date)) === day)
      const maxDaily = sameDay.length ? Math.max(0, ...sameDay.map((x) => x.dailySeq ?? 0)) : 0
      const missingOnDay = sameDay.filter((x) => x.dailySeq == null).length
      return Math.max(maxDaily, missingOnDay) + 1
    })()
    const isFee = kind === 'fee'
    const isRange = !isFee && periodType === 'range'
    const fromMs = isRange ? new Date(rangeFrom + 'T00:00:00').getTime() || dateMs : 0
    const toMs = isRange ? new Date(rangeTo + 'T00:00:00').getTime() || fromMs : 0
    const periodVal = selPeriod
    return {
      id: 'preview',
      receiptNo: existing ? existing.receiptNo : receiptSeq + 1,
      dailySeq,
      studentId: student.id,
      kind: (isFee ? 'fee' : 'monthly') as 'monthly' | 'fee',
      feeLabel: isFee ? feeTitle.trim() || undefined : undefined,
      amount: amountNum,
      due: dueNum,
      mode,
      receivedBy: receivedBy ? { name: receivedBy.name, phone: receivedBy.phone } : undefined,
      period: periodVal,
      periodType: (isFee ? 'month' : periodType) as 'month' | 'range',
      periodFrom: isRange ? fromMs : undefined,
      periodTo: isRange ? toMs : undefined,
      date: existing ? existing.date : dateMs,
      updatedAt: Date.now(),
    }
  }, [student, existing, kind, feeTitle, amountNum, dueNum, mode, receivedBy, selPeriod, periodType, rangeFrom, rangeTo, receiptSeq, receivedDate, payments])

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
    if (kind === 'monthly' && periodType === 'range') {
      const fromMs = new Date(rangeFrom + 'T00:00:00').getTime()
      const toMs = new Date(rangeTo + 'T00:00:00').getTime()
      if (!fromMs || !toMs || fromMs > toMs) return showToast('Select a valid date range', 'err')
    }
    if (kind === 'monthly' && commissionNum > 0 && !receivedBy) {
      showToast('Commission requires selecting the receiving teacher', 'err')
      return
    }
    if (realAmount.trim() !== '' && commissionNum > realNum) {
      showToast('Commission is more than the real payment', 'info')
    }
    if (!previewRef.current) return showToast('Please wait, still loading', 'err')
    setBusy(true)
    try {
      // Wait for all images (logo, paid seal) to actually load before PNG
      // capture - a broken img would embed as empty in the saved receipt
      const imgs = previewRef.current.querySelectorAll('img')
      await Promise.all(Array.from(imgs).map((img) => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve()
        return new Promise<void>((r) => {
          img.onload = () => r()
          img.onerror = () => r()
        })
      }))
      const dataUrl = await capturePng(previewRef.current)
      const blob = await fetch(dataUrl).then((r) => r.blob())
      const isFee = kind === 'fee'
      const isRange = !isFee && periodType === 'range'
      const fromMs = isRange ? new Date(rangeFrom + 'T00:00:00').getTime() : 0
      const toMs = isRange ? new Date(rangeTo + 'T00:00:00').getTime() : 0
      const periodVal = selPeriod
      if (existing) {
        await updatePayment(existing.id, {
          amount: amountNum,
          realAmount: realAmount.trim() === '' ? undefined : realNum,
          commission: isFee ? undefined : commissionOn ? commissionNum : undefined,
          due: dueNum,
          mode,
          receivedBy: receivedBy ? { name: receivedBy.name, phone: receivedBy.phone } : undefined,
          period: periodVal,
          periodType: isFee ? 'month' : periodType,
          periodFrom: isRange ? fromMs : undefined,
          periodTo: isRange ? toMs : undefined,
          kind: isFee ? 'fee' : 'monthly',
          feeLabel: isFee ? feeTitle.trim() || undefined : undefined,
          pngBlob: blob,
        })
        showToast(`Invoice ${fmtInvoiceNo(existing.date, existing.dailySeq ?? invoiceDailySeq(existing, payments))} updated`, 'ok')
        navigate(`/receipt/${existing.id}`)
      } else {
        const payment = await addPayment({
          studentId: student.id,
          amount: amountNum,
          realAmount: realAmount.trim() === '' ? undefined : realNum,
          commission: isFee ? undefined : commissionOn ? commissionNum : undefined,
          due: dueNum,
          mode,
          receivedBy: receivedBy ? { name: receivedBy.name, phone: receivedBy.phone } : undefined,
          period: periodVal,
          periodType: isFee ? 'month' : periodType,
          periodFrom: isRange ? fromMs : undefined,
          periodTo: isRange ? toMs : undefined,
          kind: isFee ? 'fee' : 'monthly',
          feeLabel: isFee ? feeTitle.trim() || undefined : undefined,
          date: new Date(receivedDate + 'T00:00:00').getTime() || Date.now(),
          pngBlob: blob,
        })
        showToast(`Invoice ${fmtInvoiceNo(payment.date, payment.dailySeq ?? invoiceDailySeq(payment, [...payments, payment]))} created`, 'ok')
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
      <PageHeader
        title={existing ? (kind === 'fee' ? 'Edit fee receipt' : 'Edit receipt') : kind === 'fee' ? 'Record fee' : 'Record payment'}
        back
        onBack={() => navigate(-1)}
      />

      <div className="px-4 space-y-4">
        {/* Monthly tuition vs one-time fee - locked while editing so an
            existing receipt can never be converted across the two ledgers */}
        {!existing && (
          <div className="flex rounded-xl bg-white dark:bg-card-dark border border-line dark:border-line-dark p-1">
            <button
              onClick={() => switchKind('monthly')}
              className={`flex-1 rounded-lg py-2.5 text-[13.5px] font-bold transition ${kind === 'monthly' ? 'bg-ink text-white dark:bg-ink-soft' : 'text-body/70 dark:text-muted-dark'}`}
            >
              Monthly payment
            </button>
            <button
              onClick={() => switchKind('fee')}
              className={`flex-1 rounded-lg py-2.5 text-[13.5px] font-bold transition ${kind === 'fee' ? 'bg-ink text-white dark:bg-ink-soft' : 'text-body/70 dark:text-muted-dark'}`}
            >
              One-time fee
            </button>
          </div>
        )}

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
              <div className="text-[10px] uppercase tracking-wider text-faint">{kind === 'fee' ? 'Last fee' : 'Last payment'}</div>
              <div className="text-[13px] font-bold text-teal tabular-nums">{fmtTaka(lastPayment.amount)}</div>
            </div>
          )}
        </Card>

        {/* Fee title - one-time fees only; dropdown of saved titles with an
            "Other" free-text option - new titles are remembered (like schools) */}
        {kind === 'fee' && (
          <Card className="!rounded-2xl p-4">
            <div className="text-[13px] font-semibold text-body/80 dark:text-muted-dark mb-1.5">
              Fee title <span className="text-faint font-normal">· optional</span>
            </div>
            <select
              value={feeOther ? 'Other' : feeTitle}
              onChange={(e) => {
                const v = e.target.value
                if (v === 'Other') {
                  setFeeOther(true)
                  // keep a typed value if one is already there, otherwise clear
                  if (feeTitles.includes(feeTitle)) setFeeTitle('')
                } else {
                  setFeeOther(false)
                  setFeeTitle(v)
                }
              }}
              className="w-full rounded-xl bg-white dark:bg-input-dark border border-line dark:border-line-dark px-3 py-3 text-[14px] font-semibold text-ink dark:text-white focus:outline-none focus:ring-2 focus:ring-teal/25"
            >
              <option value="">None — no title</option>
              {feeTitles.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              <option value="Other">Other — new fee title</option>
            </select>
            {feeOther && (
              <input
                value={feeTitle}
                onChange={(e) => setFeeTitle(e.target.value)}
                placeholder="Type fee title (e.g. Admission, Exam, Books…)"
                maxLength={60}
                className="mt-2 w-full rounded-xl border border-line dark:border-line-dark bg-white dark:bg-input-dark px-4 py-3 text-[15px] font-semibold text-ink dark:text-white placeholder:font-normal placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-teal/30"
              />
            )}
            <div className="text-[12px] text-muted dark:text-muted-dark mt-1">
              Printed on the receipt and shown in the Accounting fee list. Titles you type are saved as options.
            </div>
          </Card>
        )}

        {/* Amount */}
        <Card className="!rounded-2xl p-4">
          <div className="text-[13px] font-semibold text-body/80 dark:text-muted-dark mb-1.5">
            Slip Payment (৳)
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
              Taka {takaToWords(amountNum)} Only - this is the amount printed on the receipt.
            </div>
          )}
          {kind === 'monthly' && lastTotal > 0 && (
            <button
              onClick={() => setAmount(String(lastTotal))}
              className="text-[12.5px] font-semibold text-teal mt-2 py-1"
            >
              Use this month's total ({fmtTaka(lastTotal)})
            </button>
          )}
        </Card>

        {/* Real payment + commission (accounting only - never on the receipt).
            *  Fees never carry a commission - the teacher cut only exists on
            *  monthly tuition. */}
        {kind === 'monthly' && (
        <Card className="!rounded-2xl p-4 space-y-4">
          <div>
            <div className="text-[13px] font-semibold text-body/80 dark:text-muted-dark mb-1.5">
              Real Payment (৳) <span className="text-faint font-normal">· optional</span>
            </div>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[16px] font-bold text-ink dark:text-white">
                ৳
              </span>
              <input
                value={realAmount}
                onChange={(e) => setRealAmount(e.target.value.replace(/[^\d.]/g, ''))}
                inputMode="numeric"
                placeholder={amountNum > 0 ? `Same as slip (${fmtTaka(amountNum)})` : '0'}
                className="w-full rounded-xl border border-line dark:border-line-dark bg-white dark:bg-input-dark pl-10 pr-4 py-3 text-[16px] font-bold text-ink dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-teal/30"
              />
            </div>
            <div className="text-[12px] text-muted dark:text-muted-dark mt-1">
              What the center actually collects - leave blank to use the slip amount.
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-[13px] font-semibold text-body/80 dark:text-muted-dark">
                Commission (৳)
              </div>
              <div className="text-[12px] text-muted dark:text-muted-dark">
                The receiving teacher's share - shown only in Accounting, never on the receipt.
              </div>
            </div>
            <button
              onClick={() => setCommissionOn((v) => !v)}
              className={`relative w-12 h-7 rounded-full transition shrink-0 ${
                commissionOn ? 'bg-teal' : 'bg-line dark:bg-ink-soft'
              }`}
              aria-label="Toggle commission"
            >
              <span
                className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${
                  commissionOn ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </button>
          </div>
          {commissionOn && (
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[16px] font-bold text-ink dark:text-white">
                ৳
              </span>
              <input
                value={commission}
                onChange={(e) => setCommission(e.target.value.replace(/[^\d.]/g, ''))}
                inputMode="numeric"
                placeholder="0"
                className="w-full rounded-xl border border-line dark:border-line-dark bg-white dark:bg-input-dark pl-10 pr-4 py-3 text-[16px] font-bold text-ink dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-teal/30"
              />
            </div>
          )}
          {commissionOn && commissionNum > 0 && !receivedBy && (
            <div className="text-[12px] font-semibold text-danger">
              Select a teacher under “Received by” - commission is added to that teacher.
            </div>
          )}
        </Card>
        )}

        {/* Due (partial payments) */}
        <Card className="!rounded-2xl p-4">
          <div className="text-[13px] font-semibold text-body/80 dark:text-muted-dark mb-1.5">
            Due (remaining on this receipt) · defaults to ৳0
          </div>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[18px] font-bold text-ink dark:text-white">
              ৳
            </span>
            <input
              value={due}
              onChange={(e) => setDue(e.target.value.replace(/[^\d.]/g, ''))}
              inputMode="numeric"
              placeholder="0"
              className="w-full rounded-xl border border-line dark:border-line-dark bg-white dark:bg-input-dark pl-11 pr-4 py-3 text-[18px] font-bold text-ink dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-teal/30"
            />
          </div>
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

        {/* Received by */}
        <div>
          <div className="text-[13px] font-semibold text-body/80 dark:text-muted-dark mb-1.5">
            Received by
          </div>
          {teachers.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setReceivedBy(undefined)}
                className={`rounded-xl px-4 py-2.5 text-[13.5px] font-bold transition active:scale-[0.97] ${
                  !receivedBy
                    ? 'bg-ink text-white shadow-[0_2px_8px_rgba(18,49,79,0.25)] dark:bg-ink-soft'
                    : 'bg-white dark:bg-card-dark border border-line dark:border-line-dark text-body/70 dark:text-muted-dark'
                }`}
              >
                None
              </button>
              {teachers.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setReceivedBy(t)}
                  className={`rounded-xl px-4 py-2.5 text-[13.5px] font-bold transition active:scale-[0.97] ${
                    receivedBy?.id === t.id || receivedBy?.name === t.name
                      ? 'bg-ink text-white shadow-[0_2px_8px_rgba(18,49,79,0.25)] dark:bg-ink-soft'
                      : 'bg-white dark:bg-card-dark border border-line dark:border-line-dark text-body/70 dark:text-muted-dark'
                  }`}
                >
                  {t.name}
                </button>
              ))}
              <Link to="/settings" className="rounded-xl px-4 py-2.5 text-[13.5px] font-semibold text-teal border border-dashed border-teal/40 flex items-center gap-1.5">
                <IconPlus className="w-3.5 h-3.5" /> Add teacher
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[12.5px] text-muted dark:text-muted-dark">
              <Link to="/settings" className="flex items-center gap-1.5 text-teal font-semibold">
                <IconPlus className="w-3.5 h-3.5" /> Add teachers
              </Link>
              in Settings to show who received this payment.
            </div>
          )}
        </div>

        {/* Period — Month vs Date to Date */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="text-[13px] font-semibold text-body/80 dark:text-muted-dark">
              {kind === 'fee' ? 'Fee recorded in' : 'Paying for'}
            </div>
            <span className="group relative inline-flex">
              <IconInfo className="w-3.5 h-3.5 text-muted dark:text-muted-dark" />
              <span className="pointer-events-none absolute left-1/2 top-full z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1 text-[11px] font-semibold text-white shadow group-hover:block dark:bg-ink-soft">Month the payment is recorded for</span>
            </span>
          </div>
          {kind === 'monthly' && (
          <div className="flex rounded-xl bg-white dark:bg-card-dark border border-line dark:border-line-dark p-1 mb-2">
            <button
              onClick={() => setPeriodType('month')}
              className={`flex-1 rounded-lg py-2.5 text-[13.5px] font-bold transition ${periodType === 'month' ? 'bg-ink text-white dark:bg-ink-soft' : 'text-body/70 dark:text-muted-dark'}`}
            >
              Month
            </button>
            <button
              onClick={() => setPeriodType('range')}
              className={`flex-1 rounded-lg py-2.5 text-[13.5px] font-bold transition ${periodType === 'range' ? 'bg-ink text-white dark:bg-ink-soft' : 'text-body/70 dark:text-muted-dark'}`}
            >
              Date to Date
            </button>
          </div>
          )}
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
          {kind === 'monthly' && periodType === 'range' && (
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <div className="text-[11px] font-semibold text-muted dark:text-muted-dark mb-1">From</div>
                <input
                  type="date"
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                  max={rangeTo}
                  className="w-full rounded-xl border border-line dark:border-line-dark bg-white dark:bg-input-dark px-3 py-3 text-[14px] font-semibold text-ink dark:text-white focus:outline-none focus:ring-2 focus:ring-teal/30"
                />
              </div>
              <div>
                <div className="text-[11px] font-semibold text-muted dark:text-muted-dark mb-1">To</div>
                <input
                  type="date"
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value)}
                  min={rangeFrom}
                  className="w-full rounded-xl border border-line dark:border-line-dark bg-white dark:bg-input-dark px-3 py-3 text-[14px] font-semibold text-ink dark:text-white focus:outline-none focus:ring-2 focus:ring-teal/30"
                />
              </div>
            </div>
          )}
        </div>

        {/* Date received */}
        <div>
          <div className="text-[13px] font-semibold text-body/80 dark:text-muted-dark mb-1.5">
            Date received
          </div>
          <input
            type="date"
            value={receivedDate}
            onChange={(e) => setReceivedDate(e.target.value)}
            className="w-full rounded-xl border border-line dark:border-line-dark bg-white dark:bg-input-dark px-4 py-3 text-[14px] font-semibold text-ink dark:text-white focus:outline-none focus:ring-2 focus:ring-teal/30"
          />
        </div>

        {/* Live preview note */}
        <div className="flex items-start gap-2 text-[12px] text-muted dark:text-muted-dark">
          <IconReceipt className="w-4 h-4 shrink-0 mt-0.5" />
          {existing ? (
            <span>
              Invoice {fmtInvoiceNo(existing.date, existing.dailySeq ?? invoiceDailySeq(existing, payments))} will be{' '}
              <b className="text-teal">updated</b>, keeping its original number and date.
            </span>
          ) : (
            <span>
              Invoice {fmtInvoiceNo(new Date(receivedDate + 'T00:00:00').getTime() || Date.now(), draftPayment?.dailySeq ?? 1)} · {receiptFileName(receiptSeq + 1, Date.now())}{' '}
              will be saved to this student's Drive folder.
            </span>
          )}
        </div>

        <Button full size="lg" onClick={submit} disabled={busy}>
          {busy ? <Spinner className="text-white" /> : <IconCheck className="w-5 h-5" />}
          {busy ? 'Saving…' : existing ? 'Save changes' : kind === 'fee' ? 'Record fee' : 'Submit payment'}
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
