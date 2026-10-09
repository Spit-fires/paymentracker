import Dexie, { type Table } from 'dexie'
import type { Student, Payment, Posting, Attendance, Routine, QuickCard, AttReport, StudentResult, OutboxEntry, OutboxOp } from '../types'
import { log } from './logs'

export const K = {
  CENTER: 'center',
  RECEIPT_SEQ: 'receiptSeq',
  DRIVE: 'driveRefs',
  SESSION: 'session',
  TEACHERS: 'teachers',
  BATCH_FILTER: 'batchFilter',
  /** last-used Students paid/due/all status filter */
  STATUS_FILTER: 'statusFilter',
  /** last-used Accounting filters: { batch, from, to, teacher } */
  ACCT_FILTERS: 'acctFilters',
  /** per-device receipt-number reservation: { high, used } - issued while used < high */
  SEQ_RESERVED: 'seqReserved',
  /** last-used Attendance batch filter */
  ATT_BATCH: 'attBatch',
  /** master subject list for the routine builder - synced via the meta file */
  SUBJECTS: 'subjects',
  /** teacher-maintained batch → school-exam mappings - synced via the meta file */
  EXAM_MAPS: 'examMaps',
} as const

/**
 * Small KV state (session, drive refs, center, receipt seq, teachers) lives in
 * localStorage - a single synchronous JSON blob. Keeping it out of IndexedDB
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
    /* quota exceeded - non-critical small values only */
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
  postings!: Table<Posting, string>
  attendance!: Table<Attendance, string>
  routines!: Table<Routine, string>
  quick!: Table<QuickCard, string>
  attrep!: Table<AttReport, string>
  results!: Table<StudentResult, string>
  outbox!: Table<OutboxEntry, number>

  constructor() {
    super('paymenttracker')
    this.version(1).stores({
      students: 'id, batch, archived',
      payments: 'id, studentId, receiptNo, period',
      outbox: '++id, at',
    })
    // v2 adds the postings table (cash handover ledger). The v1 schema is
    // kept verbatim above - Dexie upgrades existing installs to v2 in place.
    this.version(2).stores({
      students: 'id, batch, archived',
      payments: 'id, studentId, receiptNo, period',
      postings: 'id',
      outbox: '++id, at',
    })
    // v3 adds the attendance table (per-student per-day marks)
    this.version(3).stores({
      students: 'id, batch, archived',
      payments: 'id, studentId, receiptNo, period',
      postings: 'id',
      attendance: 'id, studentId, day, batch',
      outbox: '++id, at',
    })
    // v4 adds the routines table (per-batch per-day class schedules)
    this.version(4).stores({
      students: 'id, batch, archived',
      payments: 'id, studentId, receiptNo, period',
      postings: 'id',
      attendance: 'id, studentId, day, batch',
      routines: 'id, day, batch',
      outbox: '++id, at',
    })
    // v5 adds the quick access cards table (notes + link shortcuts)
    this.version(5).stores({
      students: 'id, batch, archived',
      payments: 'id, studentId, receiptNo, period',
      postings: 'id',
      attendance: 'id, studentId, day, batch',
      routines: 'id, day, batch',
      quick: 'id',
      outbox: '++id, at',
    })
    // v6 adds the attendance report ticks (guardian-informed markers per
    // student per class per period)
    this.version(6).stores({
      students: 'id, batch, archived',
      payments: 'id, studentId, receiptNo, period',
      postings: 'id',
      attendance: 'id, studentId, day, batch',
      routines: 'id, day, batch',
      quick: 'id',
      attrep: 'id',
      outbox: '++id, at',
    })
    // v7 adds the backed-up report cards (one metadata row per student per
    // exam - the PDF bytes live on Drive, never in IndexedDB)
    this.version(7).stores({
      students: 'id, batch, archived',
      payments: 'id, studentId, receiptNo, period',
      postings: 'id',
      attendance: 'id, studentId, day, batch',
      routines: 'id, day, batch',
      quick: 'id',
      attrep: 'id',
      results: 'id, studentId, examId',
      outbox: '++id, at',
    })
  }
}

export const db = new PTDatabase()

/** Read a whole table, but never let one poisoned record (torn blob write,
 *  corruption) blank an entire list - on failure, retry record-by-record
 *  and return everything that still parses. Every step is logged exactly. */
export async function loadTable<T>(table: Table<T, string>, label: string): Promise<T[]> {
  try {
    return await table.toArray()
  } catch (e) {
    log('warn', `Table '${label}' bulk read failed, retrying record-by-record`, e instanceof Error ? e.message : undefined)
    const out: T[] = []
    let skipped = 0
    try {
      const keys = await table.toCollection().primaryKeys()
      for (const k of keys) {
        try {
          const r = await table.get(k as string)
          if (r !== undefined) out.push(r)
        } catch {
          skipped++
        }
      }
    } catch {
      /* ignore */
    }
    if (skipped > 0) {
      log('warn', `Table '${label}': skipped ${skipped} unreadable record(s)`, `recovered ${out.length}`)
    } else {
      log('info', `Table '${label}' recovered fully on retry`, `recovered ${out.length}`)
    }
    return out
  }
}

export async function getStudents(): Promise<Student[]> {
  return db.students.toArray()
}

export async function getPayments(): Promise<Payment[]> {
  return db.payments.toArray()
}

export async function getPostings(): Promise<Posting[]> {
  return db.postings.toArray()
}

export async function getAttendance(): Promise<Attendance[]> {
  return db.attendance.toArray()
}

export async function getRoutines(): Promise<Routine[]> {
  return db.routines.toArray()
}

export async function getQuickCards(): Promise<QuickCard[]> {
  return db.quick.toArray()
}

export async function getAttReports(): Promise<AttReport[]> {
  return db.attrep.toArray()
}

export async function getStudentResults(): Promise<StudentResult[]> {
  return db.results.toArray()
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
