import Dexie, { type Table } from 'dexie'
import type { Student, Payment, OutboxEntry, OutboxOp } from '../types'

export const K = {
  CENTER: 'center',
  RECEIPT_SEQ: 'receiptSeq',
  DRIVE: 'driveRefs',
  SESSION: 'session',
  TEACHERS: 'teachers',
  BATCH_FILTER: 'batchFilter',
} as const

/**
 * Small KV state (session, drive refs, center, receipt seq, teachers) lives in
 * localStorage — a single synchronous JSON blob. Keeping it out of IndexedDB
 * avoids the mobile-browser IndexedDB staleness/corruption that caused the
 * "refresh → login loop" (clearing IndexedDB was the only fix).
 */
const LS_KEY = 'pt_kv'

function readAll(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return {}
    const j = JSON.parse(raw)
    return j && typeof j === 'object' ? j : {}
  } catch {
    return {}
  }
}

function writeAll(m: Record<string, unknown>): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(m))
  } catch {
    /* quota exceeded — non-critical small values only */
  }
}

export async function getKV<T>(key: string): Promise<T | undefined> {
  return readAll()[key] as T | undefined
}

export async function setKV(key: string, value: unknown): Promise<void> {
  const all = readAll()
  if (value === undefined) delete all[key]
  else all[key] = value
  writeAll(all)
}

class PTDatabase extends Dexie {
  students!: Table<Student, string>
  payments!: Table<Payment, string>
  outbox!: Table<OutboxEntry, number>

  constructor() {
    super('paymenttracker')
    this.version(1).stores({
      students: 'id, batch, archived',
      payments: 'id, studentId, receiptNo, period',
      outbox: '++id, at',
    })
  }
}

export const db = new PTDatabase()

export async function getStudents(): Promise<Student[]> {
  return db.students.toArray()
}

export async function getPayments(): Promise<Payment[]> {
  return db.payments.toArray()
}

export async function queueOp(op: OutboxOp): Promise<void> {
  if (op.kind === 'pushJSON') {
    // coalesce: only one pending push per file
    await db.outbox
      .filter((e) => e.op.kind === 'pushJSON' && e.op.file === op.file)
      .delete()
  }
  await db.outbox.add({ op, at: Date.now() })
}
