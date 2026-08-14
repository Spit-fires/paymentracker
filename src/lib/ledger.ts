import type { Student, Payment } from '../types'

export function studentPeriodPaid(payments: Payment[], studentId: string, period: string): number {
  return payments
    .filter((p) => p.studentId === studentId && p.period === period)
    .reduce((sum, p) => sum + p.amount, 0)
}

export function studentPeriodPaidAny(payments: Payment[], studentId: string, period: string): boolean {
  return payments.some((p) => p.studentId === studentId && p.period === period)
}

export interface DuesRow {
  student: Student
  paid: number
  due: number
  paidAny: boolean
}

export function duesForPeriod(students: Student[], payments: Payment[], period: string): DuesRow[] {
  const active = students.filter((s) => !s.archived)
  return active.map((student) => {
    const paid = studentPeriodPaid(payments, student.id, period)
    return {
      student,
      paid,
      due: Math.max(0, student.defaultFee - paid),
      paidAny: paid > 0,
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
