import type { Student, Payment } from '../types'

export function studentPeriodPaid(payments: Payment[], studentId: string, period: string): number {
  return payments
    .filter((p) => p.studentId === studentId && p.period === period)
    .reduce((sum, p) => sum + p.amount, 0)
}

/** What the student actually paid toward the fee — real amount when recorded,
 *  slip amount otherwise. Commission is NOT subtracted: the teacher's cut
 *  doesn't reduce what the student paid. */
export function studentPeriodPaidReal(payments: Payment[], studentId: string, period: string): number {
  return payments
    .filter((p) => p.studentId === studentId && p.period === period)
    .reduce((sum, p) => sum + (p.realAmount ?? p.amount), 0)
}

/** Net money the CENTER kept from this student in the period — per-receipt
 *  balance (real − commission). Used by the balance-based due: the due shows
 *  what the center still expects, matching home "Collected". */
export function studentPeriodBalance(payments: Payment[], studentId: string, period: string): number {
  return payments
    .filter((p) => p.studentId === studentId && p.period === period)
    .reduce((sum, p) => sum + balanceOf(p), 0)
}

/** The center's expected monthly income from a student: real payment (or slip
 *  when unset) minus the student's commission. */
export function studentBalanceFee(student: Student): number {
  return Math.max(0, (student.realPayment ?? student.defaultFee) - (student.commission ?? 0))
}

export function studentPeriodPaidAny(payments: Payment[], studentId: string, period: string): boolean {
  return payments.some((p) => p.studentId === studentId && p.period === period)
}

export interface DuesRow {
  student: Student
  /** balance fee — the center's expected monthly income from this student */
  fee: number
  /** net money the center kept from this student so far this period */
  paid: number
  /** balance fee minus what the center kept — what the center still expects */
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
    .filter((p) => p.studentId === studentId)
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
  return payments.filter((p) => p.period === period).reduce((s, p) => s + balanceOf(p), 0)
}

export function totalAllTime(payments: Payment[]): number {
  return payments.reduce((s, p) => s + balanceOf(p), 0)
}

export function paymentModes(payments: Payment[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of payments) out[p.mode] = (out[p.mode] || 0) + balanceOf(p)
  return out
}
