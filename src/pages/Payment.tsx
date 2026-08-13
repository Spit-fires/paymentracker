import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { toPng } from 'html-to-image'
import { useApp } from '../state/AppContext'
import {
  studentPeriodPaid,
  lastPaymentForStudent,
  autofillAmount,
} from '../lib/ledger'
import { fmtTaka, takaToWords, periodNow, periodLabel, receiptFileName } from '../lib/format'
import type { PaymentMode, Teacher } from '../types'
import { Card, Button, PageHeader, Spinner, useBlobUrl } from '../components/ui'
import { ReceiptCard } from '../components/ReceiptCard'
import { IconCheck, IconReceipt, IconPlus } from '../components/Icons'

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
  const { students, payments, center, receiptSeq, teachers, addPayment, updatePayment, showToast } = useApp()

  const student = students.find((s) => s.id === id)
  const photoUrl = useBlobUrl(student?.photoBlob)
  const prefill = params.get('prefill')
  const existing = useMemo(
    () => (prefill ? payments.find((x) => x.id === prefill) : undefined),
    [prefill, payments],
  )

  const period = periodNow()
  const [amount, setAmount] = useState('')
  const [realAmount, setRealAmount] = useState('')
  const [commissionOn, setCommissionOn] = useState(false)
  const [commission, setCommission] = useState('')
  const [due, setDue] = useState('0')
  const [mode, setMode] = useState<PaymentMode>('Cash')
  const [receivedBy, setReceivedBy] = useState<Teacher | undefined>()
  const [selPeriod, setSelPeriod] = useState(period)
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
        setSelPeriod(p.period)
        const d = new Date(p.date)
        setReceivedDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
        return
      }
    }
    setAmount(String(autofillAmount(students, payments, student.id, period)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student?.id, prefill])

  // upgrade a refilled teacher snapshot (synthetic id = name) to the real
  // Settings teacher once the list is available — without clobbering a
  // teacher the user picked from the chips themselves
  useEffect(() => {
    if (!receivedBy || receivedBy.id !== receivedBy.name) return
    const t = teachers.find((x) => x.name === receivedBy.name)
    if (t) setReceivedBy(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teachers])

  const lastTotal = useMemo(
    () => (student ? studentPeriodPaid(payments, student.id, selPeriod) : 0),
    [student, payments, selPeriod],
  )
  const lastPayment = useMemo(
    () => (student ? lastPaymentForStudent(payments, student.id) : undefined),
    [student, payments],
  )
  const amountNum = Number(amount) || 0
  const dueNum = Math.max(0, Number(due) || 0)
  const realNum = Number(realAmount) || 0
  const commissionNum = commissionOn ? Number(commission) || 0 : 0

  const draftPayment = useMemo(() => {
    if (!student) return null
    const dateMs = new Date(receivedDate + 'T00:00:00').getTime() || Date.now()
    return {
      id: 'preview',
      receiptNo: existing ? existing.receiptNo : receiptSeq + 1,
      studentId: student.id,
      amount: amountNum,
      due: dueNum,
      mode,
      receivedBy: receivedBy ? { name: receivedBy.name, phone: receivedBy.phone } : undefined,
      period: selPeriod,
      date: existing ? existing.date : dateMs,
      updatedAt: Date.now(),
    }
  }, [student, existing, amountNum, dueNum, mode, receivedBy, selPeriod, receiptSeq, receivedDate])

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
    if (commissionNum > 0 && !receivedBy) {
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
      // capture — a broken img would embed as empty in the saved receipt
      const imgs = previewRef.current.querySelectorAll('img')
      await Promise.all(Array.from(imgs).map((img) => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve()
        return new Promise<void>((r) => {
          img.onload = () => r()
          img.onerror = () => r()
        })
      }))
      const blob = await toPng(previewRef.current, { pixelRatio: 2 }).then((dataUrl) =>
        fetch(dataUrl).then((r) => r.blob()),
      )
      if (existing) {
        await updatePayment(existing.id, {
          amount: amountNum,
          realAmount: realAmount.trim() === '' ? undefined : realNum,
          commission: commissionOn ? commissionNum : undefined,
          due: dueNum,
          mode,
          receivedBy: receivedBy ? { name: receivedBy.name, phone: receivedBy.phone } : undefined,
          period: selPeriod,
          pngBlob: blob,
        })
        showToast(`Receipt #${String(existing.receiptNo).padStart(4, '0')} updated`, 'ok')
        navigate(`/receipt/${existing.id}`)
      } else {
        const payment = await addPayment({
          studentId: student.id,
          amount: amountNum,
          realAmount: realAmount.trim() === '' ? undefined : realNum,
          commission: commissionOn ? commissionNum : undefined,
          due: dueNum,
          mode,
          receivedBy: receivedBy ? { name: receivedBy.name, phone: receivedBy.phone } : undefined,
          period: selPeriod,
          date: new Date(receivedDate + 'T00:00:00').getTime() || Date.now(),
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
              Taka {takaToWords(amountNum)} Only — this is the amount printed on the receipt.
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

        {/* Real payment + commission (accounting only — never on the receipt) */}
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
              What the center actually collects — leave blank to use the slip amount.
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-[13px] font-semibold text-body/80 dark:text-muted-dark">
                Commission (৳)
              </div>
              <div className="text-[12px] text-muted dark:text-muted-dark">
                The receiving teacher's share — shown only in Accounting, never on the receipt.
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
              Select a teacher under “Received by” — commission is added to that teacher.
            </div>
          )}
        </Card>

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
