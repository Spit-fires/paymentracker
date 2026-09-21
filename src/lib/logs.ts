export type LogLevel = 'info' | 'warn' | 'error' | 'sync'

export interface LogEntry {
  id: number
  time: number
  level: LogLevel
  msg: string
  detail?: string
  /** consecutive repeats folded into one line (sync spam must not rotate
   *  real errors out of the capped store) */
  count?: number
}

const LS_KEY = 'pt_logs'
const MAX = 200
const MAX_MSG = 300
const MAX_DETAIL = 500

let _listeners: Array<() => void> = []

function read(): LogEntry[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const j = JSON.parse(raw)
    return Array.isArray(j) ? j : []
  } catch {
    return []
  }
}

function write(entries: LogEntry[]): void {
  const trimmed = entries.slice(-MAX)
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(trimmed))
  } catch {
    // quota pressure: drop the oldest half and retry once, so the newest
    // entries (usually the error that matters) still land instead of being
    // silently swallowed
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(trimmed.slice(-Math.floor(MAX / 2))))
    } catch {
      /* fully out of room - drop */
    }
  }
  for (const fn of _listeners) {
    try {
      fn()
    } catch {
      /* one broken listener must not break logging */
    }
  }
}

const cut = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1) + '…' : s)

let _seq = Date.now()

export function log(level: LogLevel, msg: string, detail?: string): void {
  const entries = read()
  const m = cut(msg, MAX_MSG)
  const d = detail ? cut(detail, MAX_DETAIL) : undefined
  const last = entries[entries.length - 1]
  // fold consecutive repeats: refresh the time/detail and bump the count
  if (last && last.level === level && last.msg === m) {
    last.count = (last.count || 1) + 1
    last.time = Date.now()
    if (d) last.detail = d
    write(entries)
    return
  }
  entries.push({ id: ++_seq, time: Date.now(), level, msg: m, detail: d })
  write(entries)
}

export function getLogs(): LogEntry[] {
  return read()
}

export function clearLogs(): void {
  write([])
}

export function onLogsChange(fn: () => void): () => void {
  _listeners.push(fn)
  return () => {
    _listeners = _listeners.filter((f) => f !== fn)
  }
}
