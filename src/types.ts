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
  /** school dropdown - SSAC/TGS/RUMC/MC/Other (free text when Other); empty = not set */
  school?: string
  /** SSAC student ID - only when school === 'SSAC'; empty = not set */
  ssacId?: string
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
  /** per-day sequence for invoice number (DDMMYYUE##), resets each calendar day */
  dailySeq?: number
  studentId: string
  /** 'monthly' (default/undefined = monthly tuition) or 'fee' - a one-time
   *  fee (admission/exam/books…) tracked separately from monthly accounting
   *  in the Accounting > Fee tab */
  kind?: 'monthly' | 'fee'
  /** free-text title for one-time fees, e.g. "Admission", "Exam" - shown on
   *  the receipt and the Fee tab; monthly payments never set this */
  feeLabel?: string
  /** Fee-tab tick box - private tracking marker; toggling syncs like any edit */
  feeSettled?: boolean
  /** Commissions-tab tick box - private tracking marker for the teacher's
   *  payout; toggling syncs like any edit */
  commSettled?: boolean
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
  period: string // 'YYYY-MM' month paid for (or range key when periodType is 'range')
  /** 'month' (default) or 'range' — range uses periodFrom/periodTo */
  periodType?: 'month' | 'range'
  /** when periodType is 'range' — inclusive start day */
  periodFrom?: number
  /** when periodType is 'range' — inclusive end day */
  periodTo?: number
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
 *  `text` is free text (teacher-written), substituted into the absent-student
 *  WhatsApp message via the {routine} token. `time`/`subjects` are legacy
 *  fields kept for old records created before the merge. */
export interface Routine {
  id: string
  /** local day key, 'YYYY-MM-DD' - defaults to tomorrow when planning */
  day: string
  batch: string
  /** free text: class time + subjects, e.g. "3:00 PM - 5:00 PM\nMath, English" */
  text?: string
  /** @deprecated legacy, merged into text */
  time?: string
  /** @deprecated legacy, merged into text */
  subjects?: string
  updatedAt: number
  /** tombstone - set (instead of removing) when deleted; syncs deletes across devices */
  deletedAt?: number
}

/** Quick Access card - a note (rich text) or a link shortcut, managed from
 *  the Home > Quick Access screen. Syncs via _quick.json with LWW merging. */
export interface QuickCard {
  id: string
  kind: 'note' | 'link'
  title: string
  /** short description shown on the card */
  desc?: string
  /** link cards - the URL to open */
  url?: string
  /** note cards - rich text HTML (same sanitizer as receipt rules) */
  noteHtml?: string
  createdAt: number
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
  /** WhatsApp fee-reminder template; tokens: {student} {period} {center} {date} {batch} */
  reminderMsg?: string
  /** WhatsApp receipt-share template; tokens: {student} {period} {center} {link} {date} {batch} */
  receiptMsg?: string
  /** WhatsApp one-time-fee receipt-share template; tokens: {student} {fee}
   *  {amount} {period} {center} {link} {date} {batch} */
  feeReceiptMsg?: string
  /** WhatsApp absent-student template; tokens: {student} {date} {batch} {center} */
  attendanceMsg?: string
  /** WhatsApp routine-send template; tokens: {student} {date} {batch} {center} {routine} {routine date} {routine day} */
  routineMsg?: string
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
  fileIds: { students?: string; payments?: string; meta?: string; postings?: string; attendance?: string; routines?: string; quick?: string }
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
  pulledAt?: Partial<Record<'students' | 'payments' | 'meta' | 'postings' | 'attendance' | 'routines' | 'quick', number>>
}

export type OutboxOp =
  | { kind: 'pushJSON'; file: 'students' | 'payments' | 'meta' | 'postings' | 'attendance' | 'routines' | 'quick' }
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
