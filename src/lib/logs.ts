export type LogLevel = 'info' | 'warn' | 'error' | 'sync'

export interface LogEntry {
  id: number
  time: number
  level: LogLevel
  msg: string
  detail?: string
}

const LS_KEY = 'pt_logs'
const MAX = 200

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
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(entries.slice(-MAX)))
  } catch {
    /* quota exceeded */
  }
  _listeners.forEach((fn) => fn())
}

let _seq = Date.now()

export function log(level: LogLevel, msg: string, detail?: string): void {
  const entries = read()
  entries.push({ id: ++_seq, time: Date.now(), level, msg, detail })
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
