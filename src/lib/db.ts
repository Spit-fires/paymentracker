import Dexie, { type Table } from 'dexie'
import type { Student, Payment, OutboxEntry, OutboxOp } from '../types'

export interface KV {
  key: string
  value: unknown
}

export const K = {
  CENTER: 'center',
  RECEIPT_SEQ: 'receiptSeq',
  DRIVE: 'driveRefs',
  SESSION: 'session',
} as const

class PTDatabase extends Dexie {
  students!: Table<Student, string>
  payments!: Table<Payment, string>
  kv!: Table<KV, string>
  outbox!: Table<OutboxEntry, number>

  constructor() {
    super('paymenttracker')
    this.version(1).stores({
      students: 'id, batch, archived',
      payments: 'id, studentId, receiptNo, period',
      kv: 'key',
      outbox: '++id, at',
    })
  }
}

export const db = new PTDatabase()

export async function getKV<T>(key: string): Promise<T | undefined> {
  const row = await db.kv.get(key)
  return row?.value as T | undefined
}

export async function setKV(key: string, value: unknown): Promise<void> {
  await db.kv.put({ key, value })
}

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
