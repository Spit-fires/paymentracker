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

export function periodNow(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number)
  if (!y || !m || m < 1 || m > 12) return period
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  })
}

export function receiptFileName(receiptNo: number, dateMs: number): string {
  const d = new Date(dateMs)
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
  return `${String(receiptNo).padStart(4, '0')}-${ymd}.png`
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
