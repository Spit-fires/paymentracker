import type { Student, Payment, Posting } from '../types'

/** Monthly-tuition payments only. One-time fees (kind === 'fee') are tracked
 *  separately in the Accounting > Fee tab and must NEVER leak into monthly
 *  accounting (dues, collected, posting cash, autofill, commissions). */
export function isMonthly(p: Payment): boolean {
  return p.kind !== 'fee'
}

/** One-time fee payments only - the inverse of isMonthly. */
export function isFee(p: Payment): boolean {
  return p.kind === 'fee'
}

export function studentPeriodPaid(payments: Payment[], studentId: string, period: string): number {
  return payments
    .filter((p) => isMonthly(p) && p.studentId === studentId && p.period === period)
    .reduce((sum, p) => sum + p.amount, 0)
}

/** What the student actually paid toward the fee - real amount when recorded,
 *  slip amount otherwise. Commission is NOT subtracted: the teacher's cut
 *  doesn't reduce what the student paid. */
export function studentPeriodPaidReal(payments: Payment[], studentId: string, period: string): number {
  return payments
    .filter((p) => isMonthly(p) && p.studentId === studentId && p.period === period)
    .reduce((sum, p) => sum + (p.realAmount ?? p.amount), 0)
}

/** Net money the CENTER kept from this student in the period - per-receipt
 *  balance (real − commission). Used by the balance-based due: the due shows
 *  what the center still expects, matching home "Collected". */
export function studentPeriodBalance(payments: Payment[], studentId: string, period: string): number {
  return payments
    .filter((p) => isMonthly(p) && p.studentId === studentId && p.period === period)
    .reduce((sum, p) => sum + balanceOf(p), 0)
}

/** The center's expected monthly income from a student: real payment (or slip
 *  when unset) minus the student's commission. */
export function studentBalanceFee(student: Student): number {
  return Math.max(0, (student.realPayment ?? student.defaultFee) - (student.commission ?? 0))
}

export function studentPeriodPaidAny(payments: Payment[], studentId: string, period: string): boolean {
  return payments.some((p) => isMonthly(p) && p.studentId === studentId && p.period === period)
}

export interface DuesRow {
  student: Student
  /** balance fee - the center's expected monthly income from this student */
  fee: number
  /** net money the center kept from this student so far this period */
  paid: number
  /** balance fee minus what the center kept - what the center still expects */
  due: number
  paidAny: boolean
}

export function duesForPeriod(students: Student[], payments: Payment[], period: string): DuesRow[] {
  const active = students.filter((s) => !s.archived)
  return active.map((student) => {
    const fee = studentBalanceFee(student)
    const paid = studentPeriodBalance(payments, student.id, period)
    return {
      student,
      fee,
      paid,
      due: Math.max(0, fee - paid),
      paidAny: studentPeriodPaidAny(payments, student.id, period),
    }
  })
}

export function lastPaymentForStudent(payments: Payment[], studentId: string): Payment | undefined {
  const list = payments
    .filter((p) => isMonthly(p) && p.studentId === studentId)
    .sort((a, b) => b.date - a.date)
  return list[0]
}

/** Last one-time fee receipt for a student - newest first. */
export function lastFeeForStudent(payments: Payment[], studentId: string): Payment | undefined {
  const list = payments
    .filter((p) => isFee(p) && p.studentId === studentId)
    .sort((a, b) => b.date - a.date)
  return list[0]
}

export function lastMonthPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Autofill amount: last month's total, else the student's default fee. */
export function autofillAmount(
  students: Student[],
  payments: Payment[],
  studentId: string,
  period: string,
): number {
  const s = students.find((x) => x.id === studentId)
  const last = studentPeriodPaid(payments, studentId, lastMonthPeriod(period))
  if (last > 0) return last
  return s?.defaultFee || 0
}

/** Autofill for the REAL payment field: the student's recorded real monthly
 *  payment, else last month's real total, else 0 (leave blank = same as slip). */
export function realAutofillAmount(
  students: Student[],
  payments: Payment[],
  studentId: string,
  period: string,
): number {
  const s = students.find((x) => x.id === studentId)
  if (s?.realPayment) return s.realPayment
  return studentPeriodPaidReal(payments, studentId, lastMonthPeriod(period))
}

/** Net money for the center: real payment received minus teacher commission. */
export function balanceOf(p: Payment): number {
  return (p.realAmount ?? p.amount) - (p.commission ?? 0)
}

export function monthTotals(payments: Payment[], period: string): number {
  return payments.filter((p) => isMonthly(p) && p.period === period).reduce((s, p) => s + balanceOf(p), 0)
}

export function totalAllTime(payments: Payment[]): number {
  return payments.filter(isMonthly).reduce((s, p) => s + balanceOf(p), 0)
}

/** Cash handed over ("posted") so far - sum of all ACTIVE postings
 *  (the caller must pass postings already filtered for tombstones). */
export function postingTotal(postings: Posting[]): number {
  return postings.reduce((s, p) => s + p.amount, 0)
}

/** Cash still in hand, ready to hand over: all-time collected (balance of
 *  every receipt) minus everything already posted. All-time, never resets. */
export function readyToPost(payments: Payment[], postings: Posting[]): number {
  return totalAllTime(payments) - postingTotal(postings)
}

export interface PostingRow {
  posting: Posting
  /** running Ledger - collected minus postings up to and including this row */
  ledger: number
}

/** Ledger rows oldest → newest, each carrying the running balance after it.
 *  The last row's ledger equals readyToPost. */
export function postingLedger(payments: Payment[], postings: Posting[]): PostingRow[] {
  const collected = totalAllTime(payments)
  const sorted = [...postings].sort((a, b) => a.date - b.date || a.id.localeCompare(b.id))
  let running = collected
  return sorted.map((posting) => {
    running -= posting.amount
    return { posting, ledger: running }
  })
}

export function paymentModes(payments: Payment[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of payments) {
    if (!isMonthly(p)) continue
    out[p.mode] = (out[p.mode] || 0) + balanceOf(p)
  }
  return out
}

/* ------------------------------------------------------------------ *
 * One-time fees (kind === 'fee') - a fully separate ledger.          *
 * ------------------------------------------------------------------ */

/** All one-time fee payments whose "paying for" month matches `period`,
 *  newest first - rows for the Accounting > Fee tab. */
export function feesForPeriod(payments: Payment[], period: string): Payment[] {
  return payments
    .filter((p) => isFee(p) && p.period === period)
    .sort((a, b) => b.date - a.date || b.receiptNo - a.receiptNo)
}

export interface FeeTotals {
  count: number
  slip: number
  real: number
  settled: number
  pending: number
  settledCount: number
}

/** Totals for the Fee tab over the given fee rows: slip sum, real sum
 *  (real amount when recorded, slip otherwise), and the private tick-box
 *  split (settled vs pending). Fees never carry commission. */
export function feeTotals(fees: Payment[]): FeeTotals {
  let slip = 0
  let real = 0
  let settled = 0
  let settledCount = 0
  for (const p of fees) {
    const r = p.realAmount ?? p.amount
    slip += p.amount
    real += r
    if (p.feeSettled) {
      settled += r
      settledCount++
    }
  }
  return { count: fees.length, slip, real, settled, pending: real - settled, settledCount }
}
