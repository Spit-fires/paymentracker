export type PaymentMode = 'Cash' | 'Bkash' | 'Nagad' | 'Other'

export interface Student {
  id: string
  name: string
  /** kept for legacy data only — no longer collected in the form */
  email?: string
  phone?: string
  /** extra number, used for calls (primary phone defaults to WhatsApp) */
  phone2?: string
  batch: string
  defaultFee: number
  notes?: string
  photoFileId?: string
  photoBlob?: Blob
  folderId?: string
  folderShared?: boolean
  archived: boolean
  createdAt: number
  updatedAt: number
  /** tombstone — set (instead of removing) when deleted; syncs deletes across devices */
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
  amount: number
  /** remaining amount owed on this payment (partial payments), 0 = settled */
  due?: number
  mode: PaymentMode
  receivedBy?: ReceivedBy
  period: string // 'YYYY-MM' month paid for
  date: number // epoch ms when recorded
  pngFileId?: string
  pngBlob?: Blob
  updatedAt: number
  /** tombstone — set (instead of removing) when deleted; syncs deletes across devices */
  deletedAt?: number
}

export interface Center {
  name: string
  tagline: string
  address: string
  phone: string
  /** receipt logo as a dataURL (small PNG/JPG), uploaded in Settings */
  logo?: string
  /** payment rules paragraph, shown in Bengali at the bottom of the receipt */
  rules?: string
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
  /** tombstone — syncs teacher removal to other devices */
  deletedAt?: number
}

export interface DriveRefs {
  rootFolderId?: string
  studentsFolderId?: string
  /** Google account that owns this folder — refs are only trusted for that account. */
  ownerEmail?: string
  fileIds: { students?: string; payments?: string; meta?: string }
  /** modifiedTime of each JSON file at last sync — lets pull() skip downloads */
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
}

export type OutboxOp =
  | { kind: 'pushJSON'; file: 'students' | 'payments' | 'meta' }
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
