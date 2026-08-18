export type PaymentMode = 'Cash' | 'Bkash' | 'Nagad' | 'Other'

export interface Student {
  id: string
  name: string
  /** kept for legacy data only - no longer collected in the form */
  email?: string
  phone?: string
  /** extra number, used for calls (primary phone defaults to WhatsApp) */
  phone2?: string
  batch: string
  defaultFee: number
  /** the student's true monthly fee - teacher-only bookkeeping, never printed
   *  on the receipt; blank = same as defaultFee */
  realPayment?: number
  /** teacher's monthly share from this student - teacher-only, never printed;
   *  blank = 0. The center's balance fee = realPayment − commission. */
  commission?: number
  notes?: string
  photoFileId?: string
  photoBlob?: Blob
  folderId?: string
  folderShared?: boolean
  archived: boolean
  createdAt: number
  updatedAt: number
  /** tombstone - set (instead of removing) when deleted; syncs deletes across devices */
  deletedAt?: number
}

export interface ReceivedBy {
  name: string
  phone?: string
}

export interface Payment {
  id: string
  receiptNo: number
  studentId: string
  /** slip amount - what is written on the printed receipt */
  amount: number
  /** what the center actually collected; blank/undefined = same as slip */
  realAmount?: number
  /** receiving teacher's share; requires a "received by" teacher, never
   *  shown on the receipt - appears only in Accounting */
  commission?: number
  /** remaining amount owed on this payment (partial payments), 0 = settled */
  due?: number
  mode: PaymentMode
  receivedBy?: ReceivedBy
  period: string // 'YYYY-MM' month paid for
  date: number // epoch ms when recorded
  pngFileId?: string
  pngBlob?: Blob
  updatedAt: number
  /** tombstone - set (instead of removing) when deleted; syncs deletes across devices */
  deletedAt?: number
  /** local-only flag on a tombstone: the Drive PNG to delete AFTER the
   *  tombstone push succeeds - never serialized, never synced */
  pendingMedia?: string
}

/** Cash handover ("posting"): accumulated cash given to an authorized person
 *  (e.g. Hasan sir). The posting ledger is ALL-TIME - collected minus posted
 *  never resets. */
export interface Posting {
  id: string
  /** cash handed over (৳) */
  amount: number
  /** who took the cash - teachers dropdown, optional ("None"), editable later */
  receivedBy?: ReceivedBy
  /** handover date, epoch ms */
  date: number
  updatedAt: number
  /** tombstone - set (instead of removing) when deleted; syncs deletes across devices */
  deletedAt?: number
}

export type AttendanceStatus = 'present' | 'absent' | 'leave'

/** One attendance mark per student per day. The id is deterministic
 *  (`studentId_day`), so re-taking a day updates instead of duplicating and
 *  two devices editing the same day merge cleanly via the LWW machinery. */
export interface Attendance {
  id: string
  studentId: string
  /** denormalized for fast batch filtering without joins */
  batch: string
  /** local day key, 'YYYY-MM-DD' */
  day: string
  status: AttendanceStatus
  updatedAt: number
  /** ticked after the absent WhatsApp message is sent; a per-student 'cleared' marker for the day */
  cleared?: boolean
  /** tombstone - set (instead of removing) when deleted; syncs deletes across devices */
  deletedAt?: number
}

/** One routine (class schedule) per batch per day. The id is deterministic
 *  (`day_batch`), so re-saving a day+batch updates instead of duplicating and
 *  two devices editing the same slot merge cleanly via the LWW machinery.
 *  `time` and `subjects` are free text (teacher-written), substituted into the
 *  absent-student WhatsApp message via {routine time} / {routine subjects}. */
export interface Routine {
  id: string
  /** local day key, 'YYYY-MM-DD' - defaults to tomorrow when planning */
  day: string
  batch: string
  /** free-text class time, e.g. "3:00 PM - 5:00 PM" */
  time?: string
  /** free-text subject list, one per line */
  subjects?: string
  updatedAt: number
  /** tombstone - set (instead of removing) when deleted; syncs deletes across devices */
  deletedAt?: number
}

export interface Center {
  name: string
  tagline: string
  /** plain-text address (legacy / mirror of addressHtml) */
  address: string
  /** plain-text phone (legacy / mirror of phoneHtml) */
  phone: string
  /** rich-text address as HTML - renders on receipts; plain text falls back to `address` */
  addressHtml?: string
  /** rich-text phone as HTML - renders on receipts; plain text falls back to `phone` */
  phoneHtml?: string
  /** receipt logo as a dataURL (small PNG/JPG), uploaded in Settings */
  logo?: string
  /** plain-text payment rules (legacy, pre-rich-editor), shown at the bottom
   *  of the receipt; kept in sync with rulesHtml for older devices */
  rules?: string
  /** rich-text payment rules as HTML - renders as বিশেষ নিয়মাবলী on receipts */
  rulesHtml?: string
  /** WhatsApp fee-reminder template; tokens: {student} {period} {center} */
  reminderMsg?: string
  /** WhatsApp receipt-share template; tokens: {student} {period} {center} {link} */
  receiptMsg?: string
  /** WhatsApp absent-student template; tokens: {student} {date} {batch} {center} */
  attendanceMsg?: string
  /** custom PAID stamp image as a dataURL, uploaded in Settings */
  paidImage?: string
}

/** Teacher/collector who can be picked as "received by" when recording a payment. */
export interface Teacher {
  id: string
  name: string
  phone?: string
  /** last-modified clock for last-writer-wins merging across devices */
  updatedAt?: number
  /** tombstone - syncs teacher removal to other devices */
  deletedAt?: number
}

export interface DriveRefs {
  rootFolderId?: string
  studentsFolderId?: string
  /** Google account that owns this folder - refs are only trusted for that account. */
  ownerEmail?: string
  fileIds: { students?: string; payments?: string; meta?: string; postings?: string; attendance?: string; routines?: string }
  /** modifiedTime of each JSON file at last sync - lets pull() skip downloads */
  stamps?: Record<string, string>
}

export interface SessionUser {
  name: string
  email: string
  picture?: string
}

export interface Session {
  clientId?: string
  user?: SessionUser
  pinHash?: string
  theme: 'light' | 'dark'
  lastPulledAt: number
  /** per-file: timestamp of the last snapshot each JSON file was fully processed from */
  pulledAt?: Partial<Record<'students' | 'payments' | 'meta' | 'postings' | 'attendance' | 'routines', number>>
}

export type OutboxOp =
  | { kind: 'pushJSON'; file: 'students' | 'payments' | 'meta' | 'postings' | 'attendance' | 'routines' }
  | {
      kind: 'uploadMedia'
      type: 'photo' | 'receipt'
      studentId: string
      paymentId?: string
      fileName: string
      blob: Blob
    }
  | { kind: 'deleteMedia'; fileId: string }
  | { kind: 'ensureStudentFolder'; studentId: string }

export interface OutboxEntry {
  id?: number
  op: OutboxOp
  at: number
}
