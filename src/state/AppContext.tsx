import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Student, Payment, Center, Session, SessionUser, PaymentMode } from '../types'
import { db, getKV, setKV, queueOp, K } from '../lib/db'
import { signIn, silentSignIn, revoke } from '../lib/auth'
import {
  ensureDriveStructure,
  flushOutbox,
  pull,
  setDriveToken,
  defaultCenter,
} from '../lib/sync'
import { newId, receiptFileName } from '../lib/format'
import { setToken, getToken, clearToken } from '../lib/token'

export interface Toast {
  id: number
  msg: string
  kind: 'ok' | 'err' | 'info'
}

export interface NewStudentInput {
  name: string
  email: string
  phone?: string
  batch: string
  defaultFee: number
  notes?: string
  photo?: Blob | null
}

export interface NewPaymentInput {
  studentId: string
  amount: number
  mode: PaymentMode
  period: string
  date: number
  pngBlob: Blob
}

interface Ctx {
  initialized: boolean
  user: SessionUser | null
  clientId?: string
  online: boolean
  syncing: boolean
  lastSyncAt: number
  locked: boolean
  students: Student[]
  payments: Payment[]
  center: Center
  receiptSeq: number
  toast: Toast | null

  saveClientId: (id: string) => void
  login: (clientId: string) => Promise<void>
  logout: () => Promise<void>
  syncNow: () => Promise<void>
  refreshData: () => Promise<void>

  addStudent: (input: NewStudentInput) => Promise<Student>
  updateStudent: (id: string, patch: Partial<Student>) => Promise<void>
  archiveStudent: (id: string, archived: boolean) => Promise<void>
  deleteStudent: (id: string) => Promise<void>

  addPayment: (input: NewPaymentInput) => Promise<Payment>
  updatePayment: (id: string, patch: Partial<Payment>) => Promise<void>
  deletePayment: (id: string) => Promise<void>

  updateCenter: (c: Center) => Promise<void>

  setTheme: (t: 'light' | 'dark') => Promise<void>
  setPin: (hash: string) => Promise<void>
  clearPin: () => Promise<void>
  setLocked: (v: boolean) => void

  showToast: (msg: string, kind?: Toast['kind']) => void
}

const AppCtx = createContext<Ctx>(null as unknown as Ctx)

export const useApp = () => useContext(AppCtx)

let toastId = 0

export function AppProvider({ children }: { children: ReactNode }) {
  const [initialized, setInitialized] = useState(false)
  const [user, setUser] = useState<SessionUser | null>(null)
  const [clientId, setClientId] = useState<string | undefined>()
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [syncing, setSyncing] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState(0)
  const [locked, setLocked] = useState(false)
  const [students, setStudents] = useState<Student[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [center, setCenter] = useState<Center>(defaultCenter())
  const [receiptSeq, setReceiptSeq] = useState(0)
  const [toast, setToast] = useState<Toast | null>(null)

  const syncTimer = useRef<number | undefined>(undefined)

  const showToast = useCallback((msg: string, kind: Toast['kind'] = 'info') => {
    const id = ++toastId
    setToast({ id, msg, kind })
    window.setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 3200)
  }, [])

  const refreshData = useCallback(async () => {
    setStudents(await db.students.toArray())
    setPayments(await db.payments.toArray())
    setCenter((await getKV<Center>(K.CENTER)) || defaultCenter())
    setReceiptSeq((await getKV<number>(K.RECEIPT_SEQ)) || 0)
  }, [])

  const syncNow = useCallback(async () => {
    if (!getToken() || !online) return
    setSyncing(true)
    try {
      await ensureDriveStructure()
      // merge remote changes first (local-newer records win), then push local,
      // then pull again to re-apply everything we just pushed plus new remote state
      await pull()
      await flushOutbox()
      await pull()
      await refreshData()
      setLastSyncAt(Date.now())
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Sync failed', 'err')
    } finally {
      setSyncing(false)
    }
  }, [online, showToast, refreshData])

  const scheduleSync = useCallback(() => {
    window.clearTimeout(syncTimer.current)
    syncTimer.current = window.setTimeout(() => {
      void syncNow()
    }, 2500)
  }, [syncNow])

  // init
  useEffect(() => {
    let alive = true
    ;(async () => {
      const session = await getKV<Session>(K.SESSION)
      if (!alive) return
      setClientId(session?.clientId)
      if (session?.user) setUser(session.user)
      if (session?.pinHash && session.user) setLocked(true)
      if (session?.theme) document.documentElement.classList.toggle('dark', session.theme === 'dark')
      await refreshData()
      if (session?.clientId && session?.user) {
        if (!navigator.onLine) {
          // offline: keep the session, data lives locally anyway
          if (alive) setInitialized(true)
          return
        }
        const token = await silentSignIn(session.clientId)
        if (token) {
          setToken(token)
          setDriveToken(token)
          if (alive) {
            await ensureDriveStructure().catch(() => undefined)
            void syncNow()
          }
        } else {
          // token expired / revoked
          if (alive) setUser(null)
          await setKV(K.SESSION, { ...session, user: undefined })
        }
      }
      if (alive) setInitialized(true)
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const saveClientId = useCallback(async (id: string) => {
    const session = (await getKV<Session>(K.SESSION)) || { theme: 'light', lastPulledAt: 0 }
    await setKV(K.SESSION, { ...session, clientId: id.trim() })
    setClientId(id.trim())
  }, [])

  const login = useCallback(
    async (cid: string) => {
      const { token, user } = await signIn(cid)
      setToken(token)
      setDriveToken(token)
      setUser(user)
      const session = (await getKV<Session>(K.SESSION)) || { theme: 'light', lastPulledAt: 0 }
      await setKV(K.SESSION, { ...session, clientId: cid, user })
      setClientId(cid)
      showToast(`Signed in as ${user.email}`, 'ok')
      setInitialized(true)
      await ensureDriveStructure().catch((e) => showToast(e.message, 'err'))
      void syncNow()
    },
    [showToast, syncNow],
  )

  const logout = useCallback(async () => {
    const tok = getToken()
    if (tok) await revoke(tok)
    clearToken()
    setDriveToken('')
    setUser(null)
    setLocked(false)
    const session = await getKV<Session>(K.SESSION)
    await setKV(K.SESSION, { ...session, user: undefined })
    // keep local data for next login
  }, [])

  const addStudent = useCallback(
    async (input: NewStudentInput): Promise<Student> => {
      const now = Date.now()
      const s: Student = {
        id: newId(),
        name: input.name.trim(),
        email: input.email.trim(),
        phone: input.phone?.trim(),
        batch: input.batch.trim() || 'General',
        defaultFee: input.defaultFee,
        notes: input.notes?.trim(),
        photoBlob: input.photo || undefined,
        archived: false,
        createdAt: now,
        updatedAt: now,
      }
      await db.students.add(s)
      await queueOp({ kind: 'ensureStudentFolder', studentId: s.id })
      if (input.photo) {
        await queueOp({
          kind: 'uploadMedia',
          type: 'photo',
          studentId: s.id,
          fileName: 'photo.jpg',
          blob: input.photo,
        })
      }
      await queueOp({ kind: 'pushJSON', file: 'students' })
      await refreshData()
      scheduleSync()
      return s
    },
    [refreshData, scheduleSync],
  )

  const updateStudent = useCallback(
    async (id: string, patch: Partial<Student>) => {
      const cur = await db.students.get(id)
      if (!cur) return
      const updated = { ...cur, ...patch, updatedAt: Date.now() }
      await db.students.put(updated)
      const renamed = patch.name !== undefined || patch.batch !== undefined
      const emailChanged = patch.email !== undefined && patch.email !== cur.email
      if (renamed || emailChanged || !cur.folderId) {
        if (emailChanged) {
          await db.students.update(id, { folderShared: false })
        }
        await queueOp({ kind: 'ensureStudentFolder', studentId: id })
      }
      if (patch.photoBlob && patch.photoBlob !== cur.photoBlob) {
        await queueOp({
          kind: 'uploadMedia',
          type: 'photo',
          studentId: id,
          fileName: 'photo.jpg',
          blob: patch.photoBlob,
        })
        if (cur.photoFileId) {
          await queueOp({ kind: 'deleteMedia', fileId: cur.photoFileId })
        }
      }
      await queueOp({ kind: 'pushJSON', file: 'students' })
      await refreshData()
      scheduleSync()
    },
    [refreshData, scheduleSync],
  )

  const archiveStudent = useCallback(
    async (id: string, archived: boolean) => {
      await db.students.update(id, { archived, updatedAt: Date.now() })
      await queueOp({ kind: 'pushJSON', file: 'students' })
      await refreshData()
      scheduleSync()
    },
    [refreshData, scheduleSync],
  )

  const deleteStudent = useCallback(
    async (id: string) => {
      const s = await db.students.get(id)
      const theirPayments = await db.payments.where('studentId').equals(id).toArray()
      if (s?.photoFileId) await queueOp({ kind: 'deleteMedia', fileId: s.photoFileId })
      if (s?.folderId) await queueOp({ kind: 'deleteMedia', fileId: s.folderId })
      for (const p of theirPayments) {
        if (p.pngFileId) await queueOp({ kind: 'deleteMedia', fileId: p.pngFileId })
      }
      await db.transaction('rw', db.students, db.payments, async () => {
        await db.students.delete(id)
        await db.payments.where('studentId').equals(id).delete()
      })
      await queueOp({ kind: 'pushJSON', file: 'students' })
      await queueOp({ kind: 'pushJSON', file: 'payments' })
      await refreshData()
      scheduleSync()
    },
    [refreshData, scheduleSync],
  )

  const addPayment = useCallback(
    async (input: NewPaymentInput): Promise<Payment> => {
      const seq = (await getKV<number>(K.RECEIPT_SEQ)) || 0
      const next = seq + 1
      await setKV(K.RECEIPT_SEQ, next)
      setReceiptSeq(next)
      const p: Payment = {
        id: newId(),
        receiptNo: next,
        studentId: input.studentId,
        amount: input.amount,
        mode: input.mode,
        period: input.period,
        date: input.date,
        pngBlob: input.pngBlob,
        updatedAt: Date.now(),
      }
      await db.payments.add(p)
      await queueOp({
        kind: 'uploadMedia',
        type: 'receipt',
        studentId: input.studentId,
        paymentId: p.id,
        fileName: receiptFileName(next, Date.now()),
        blob: input.pngBlob,
      })
      await queueOp({ kind: 'pushJSON', file: 'payments' })
      await queueOp({ kind: 'pushJSON', file: 'meta' })
      await refreshData()
      scheduleSync()
      return p
    },
    [refreshData, scheduleSync],
  )

  const updatePayment = useCallback(
    async (id: string, patch: Partial<Payment>) => {
      const cur = await db.payments.get(id)
      if (!cur) return
      const updated = { ...cur, ...patch, updatedAt: Date.now() }
      await db.payments.put(updated)
      if (patch.pngBlob && patch.pngBlob !== cur.pngBlob) {
        // upload the new PNG first, then delete the old one — a crash in
        // between leaves the old file intact and the id still referenced
        await queueOp({
          kind: 'uploadMedia',
          type: 'receipt',
          studentId: cur.studentId,
          paymentId: cur.id,
          fileName: receiptFileName(cur.receiptNo, cur.date),
          blob: patch.pngBlob,
        })
        if (cur.pngFileId) {
          await queueOp({ kind: 'deleteMedia', fileId: cur.pngFileId })
        }
      }
      await queueOp({ kind: 'pushJSON', file: 'payments' })
      await refreshData()
      scheduleSync()
    },
    [refreshData, scheduleSync],
  )

  const deletePayment = useCallback(
    async (id: string) => {
      const cur = await db.payments.get(id)
      if (!cur) return
      if (cur.pngFileId) await queueOp({ kind: 'deleteMedia', fileId: cur.pngFileId })
      await db.payments.delete(id)
      await queueOp({ kind: 'pushJSON', file: 'payments' })
      await refreshData()
      scheduleSync()
    },
    [refreshData, scheduleSync],
  )

  const updateCenter = useCallback(
    async (c: Center) => {
      await setKV(K.CENTER, c)
      setCenter(c)
      await queueOp({ kind: 'pushJSON', file: 'meta' })
      scheduleSync()
    },
    [scheduleSync],
  )

  const setTheme = useCallback(async (t: 'light' | 'dark') => {
    document.documentElement.classList.toggle('dark', t === 'dark')
    const session = (await getKV<Session>(K.SESSION)) || { theme: 'light', lastPulledAt: 0 }
    await setKV(K.SESSION, { ...session, theme: t })
  }, [])

  const setPin = useCallback(async (hash: string) => {
    const session = (await getKV<Session>(K.SESSION)) || { theme: 'light', lastPulledAt: 0 }
    await setKV(K.SESSION, { ...session, pinHash: hash })
  }, [])

  const clearPin = useCallback(async () => {
    const session = (await getKV<Session>(K.SESSION)) || { theme: 'light', lastPulledAt: 0 }
    await setKV(K.SESSION, { ...session, pinHash: undefined })
  }, [])

  const value = useMemo<Ctx>(
    () => ({
      initialized,
      user,
      clientId,
      online,
      syncing,
      lastSyncAt,
      locked,
      students,
      payments,
      center,
      receiptSeq,
      toast,
      saveClientId,
      login,
      logout,
      syncNow,
      refreshData,
      addStudent,
      updateStudent,
      archiveStudent,
      deleteStudent,
      addPayment,
      updatePayment,
      deletePayment,
      updateCenter,
      setTheme,
      setPin,
      clearPin,
      setLocked,
      showToast,
    }),
    [
      initialized,
      user,
      clientId,
      online,
      syncing,
      lastSyncAt,
      locked,
      students,
      payments,
      center,
      receiptSeq,
      toast,
      saveClientId,
      login,
      logout,
      syncNow,
      refreshData,
      addStudent,
      updateStudent,
      archiveStudent,
      deleteStudent,
      addPayment,
      updatePayment,
      deletePayment,
      updateCenter,
      setTheme,
      setPin,
      clearPin,
      showToast,
    ],
  )

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}
