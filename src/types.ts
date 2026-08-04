export type PaymentMode = 'Cash' | 'Bkash' | 'Nagad' | 'Other'

export interface Student {
  id: string
  name: string
  email: string
  phone?: string
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
}

export interface Payment {
  id: string
  receiptNo: number
  studentId: string
  amount: number
  mode: PaymentMode
  period: string // 'YYYY-MM' month paid for
  date: number // epoch ms when recorded
  pngFileId?: string
  pngBlob?: Blob
  updatedAt: number
}

export interface Center {
  name: string
  tagline: string
  address: string
  phone: string
}

export interface DriveRefs {
  rootFolderId?: string
  studentsFolderId?: string
  fileIds: { students?: string; payments?: string; meta?: string }
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
