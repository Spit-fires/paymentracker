const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function three(n: number): string {
  const out: string[] = []
  const h = Math.floor(n / 100)
  const rest = n % 100
  if (h) out.push(`${ONES[h]} Hundred`)
  if (rest) {
    if (rest < 20) out.push(ONES[rest])
    else out.push(`${TENS[Math.floor(rest / 10)]}${rest % 10 ? '-' + ONES[rest % 10] : ''}`)
  }
  return out.join(' ')
}

/** Convert a whole-number taka amount to English words, Indian/BD grouping (crore, lakh). */
export function takaToWords(amount: number): string {
  const n = Math.round(amount)
  if (n === 0) return 'Zero'
  if (!isFinite(n) || n < 0) return ''
  const crore = Math.floor(n / 10000000)
  const lakh = Math.floor((n % 10000000) / 100000)
  const thousand = Math.floor((n % 100000) / 1000)
  const rest = n % 1000
  const parts: string[] = []
  if (crore) parts.push(`${three(crore)} Crore`)
  if (lakh) parts.push(`${three(lakh)} Lakh`)
  if (thousand) parts.push(`${three(thousand)} Thousand`)
  if (rest) parts.push(three(rest))
  return parts.join(' ')
}

/** Format taka using BD-style (lakh) grouping. */
export function fmtTaka(n: number): string {
  const v = Math.round(n * 100) / 100
  const s = v.toLocaleString('en-IN', { maximumFractionDigits: 2 })
  return `৳${s}`
}

export function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function fmtDateLong(ms: number): string {
  return new Date(ms).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** weekday name, e.g. "Wednesday" */
export function fmtWeekday(ms: number): string {
  return new Date(ms).toLocaleDateString('en-GB', { weekday: 'long' })
}

export function periodNow(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Local calendar-day key 'YYYY-MM-DD' - never toISOString(), which shifts
 *  a local day onto UTC and can land on yesterday/tomorrow. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function todayKey(): string {
  return dayKey(new Date())
}

export function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number)
  if (!y || !m || m < 1 || m > 12) return period
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  })
}

/** Display for payment period — Month → "August 2025", Range → "10 Aug 2025 – 20 Aug 2025" */
export function periodDisplay(p: { period: string; periodType?: string; periodFrom?: number; periodTo?: number }): string {
  if (p.periodType === 'range' && p.periodFrom && p.periodTo) {
    const from = new Date(p.periodFrom)
    const to = new Date(p.periodTo)
    const sameMonth = from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()
    const sameYear = from.getFullYear() === to.getFullYear()
    if (sameMonth) {
      return `${String(from.getDate()).padStart(2, '0')} – ${String(to.getDate()).padStart(2, '0')} ${from.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`
    }
    if (sameYear) {
      return `${from.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} – ${to.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`
    }
    return `${fmtDate(p.periodFrom!)} – ${fmtDate(p.periodTo!)}`
  }
  return periodLabel(p.period)
}

/** Short label for range, e.g. "10 Aug - 20 Aug" */
export function rangeLabel(fromMs: number, toMs: number): string {
  return periodDisplay({ period: '', periodType: 'range', periodFrom: fromMs, periodTo: toMs })
}

export function receiptFileName(receiptNo: number, dateMs: number): string {
  const d = new Date(dateMs)
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
  return `${String(receiptNo).padStart(4, '0')}-${ymd}.png`
}

/** Invoice number: DDMMYY + UE + dailySeq (padded to 2, resets per day). e.g. 230826UE03 */
export function fmtInvoiceNo(dateMs: number, dailySeq: number): string {
  const d = new Date(dateMs)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear() % 100).padStart(2, '0')
  return `${dd}${mm}${yy}UE${String(dailySeq).padStart(2, '0')}`
}

/** Derive the invoice daily sequence for a payment, falling back to a
 *  per-day count for old records that predate the dailySeq field. */
export function invoiceDailySeq(payment: { date: number; receiptNo: number; dailySeq?: number }, all: { date: number; receiptNo: number; dailySeq?: number }[]): number {
  if (payment.dailySeq != null) return payment.dailySeq
  const day = dayKey(new Date(payment.date))
  const sameDay = all.filter((p) => dayKey(new Date(p.date)) === day)
  sameDay.sort((a, b) => a.receiptNo - b.receiptNo)
  const idx = sameDay.findIndex((p) => p.receiptNo === payment.receiptNo)
  return idx >= 0 ? idx + 1 : 1
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** day key shifted by a number of days (e.g. +1 = the next day) */
export function addDays(key: string, delta: number): string {
  const d = new Date(`${key}T12:00:00`)
  d.setDate(d.getDate() + delta)
  return dayKey(d)
}

/** Fill {token} placeholders in an editable message template. Unknown tokens
 *  are left verbatim so templates stay forward-compatible. Tokens may contain
 *  spaces (e.g. {routine time}) - they are matched greedily per word group. */
export function fillMessage(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{([\w ]+?)\}/g, (m, k: string) => (k.trim() in vars ? String(vars[k.trim()]) : m))
}
