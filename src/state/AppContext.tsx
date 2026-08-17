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
import type {
  Student,
  Payment,
  Posting,
  Attendance,
  AttendanceStatus,
  Center,
  Session,
  SessionUser,
  PaymentMode,
  Teacher,
  ReceivedBy,
} from '../types'
import { db, getKV, setKV, queueOp, K } from '../lib/db'
import { signIn, silentSignIn, revoke, lastSilentError, type TokenResult } from '../lib/auth'
import {
  ensureDriveStructure,
  flushOutbox,
  pull,
  setDriveToken,
  defaultCenter,
} from '../lib/sync'
import { newId, receiptFileName } from '../lib/format'
import { setToken, getToken, clearToken, tokenNeedsRefresh } from '../lib/token'
import { log } from '../lib/logs'
import { CLIENT_ID } from '../config'

export interface Toast {
  id: number
  msg: string
  kind: 'ok' | 'err' | 'info'
}

export interface NewStudentInput {
  name: string
  phone?: string
  phone2?: string
  batch: string
  defaultFee: number
  realPayment?: number
  commission?: number
  notes?: string
  photo?: Blob | null
}

export interface NewPaymentInput {
  studentId: string
  amount: number
  realAmount?: number
  commission?: number
  due?: number
  mode: PaymentMode
  receivedBy?: ReceivedBy
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
  /** saved session exists but silent re-auth failed - app stays usable, sync paused */
  needsReauth: boolean
  /** Google's error string for the last failed silent re-auth (diagnosis). */
  reauthError: string | null
  students: Student[]
  payments: Payment[]
  postings: Posting[]
  attendances: Attendance[]
  teachers: Teacher[]
  center: Center
  receiptSeq: number
  toast: Toast | null

  saveClientId: (id: string) => void
  login: (clientId: string) => Promise<void>
  logout: () => Promise<void>
  syncNow: (manual?: boolean) => Promise<void>
  refreshData: () => Promise<void>
  saveTeachers: (t: Teacher[]) => Promise<void>

  addStudent: (input: NewStudentInput) => Promise<Student>
  updateStudent: (id: string, patch: Partial<Student>) => Promise<void>
  archiveStudent: (id: string, archived: boolean) => Promise<void>
  deleteStudent: (id: string) => Promise<void>

  addPayment: (input: NewPaymentInput) => Promise<Payment>
  updatePayment: (id: string, patch: Partial<Payment>) => Promise<void>
  deletePayment: (id: string) => Promise<void>

  addPosting: (input: { amount: number; receivedBy?: ReceivedBy; date: number }) => Promise<Posting>
  updatePosting: (id: string, patch: Partial<Posting>) => Promise<void>
  deletePosting: (id: string) => Promise<void>

  saveAttendance: (input: {
    batch: string
    day: string
    marks: Array<{ studentId: string; status: AttendanceStatus }>
  }) => Promise<void>
  toggleCleared: (id: string, cleared: boolean) => Promise<void>

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
// guards the init effect against React StrictMode's double-mount in dev,
// which otherwise races two GIS popup flows and can log the user out
let bootStarted = false

export function AppProvider({ children }: { children: ReactNode }) {
  const [initialized, setInitialized] = useState(false)
  const [user, setUser] = useState<SessionUser | null>(null)
  const [clientId, setClientId] = useState<string | undefined>()
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [syncing, setSyncing] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState(0)
  const [locked, setLocked] = useState(false)
  const [needsReauth, setNeedsReauth] = useState(false)
  const [reauthError, setReauthError] = useState<string | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [postings, setPostings] = useState<Posting[]>([])
  const [attendances, setAttendances] = useState<Attendance[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [center, setCenter] = useState<Center>(defaultCenter())
  const [receiptSeq, setReceiptSeq] = useState(0)
  const [toast, setToast] = useState<Toast | null>(null)

  const syncTimer = useRef<number | undefined>(undefined)
  const retryTimer = useRef<number | undefined>(undefined)

  const showToast = useCallback((msg: string, kind: Toast['kind'] = 'info') => {
    const id = ++toastId
    setToast({ id, msg, kind })
    window.setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 3200)
  }, [])

  const refreshData = useCallback(async () => {
    setStudents((await db.students.toArray()).filter((s) => !s.deletedAt))
    setPayments((await db.payments.toArray()).filter((p) => !p.deletedAt))
    setPostings((await db.postings.toArray()).filter((p) => !p.deletedAt))
    setAttendances((await db.attendance.toArray()).filter((a) => !a.deletedAt))
    setCenter((await getKV<Center>(K.CENTER)) || defaultCenter())
    setTeachers(((await getKV<Teacher[]>(K.TEACHERS)) || []).filter((t) => !t.deletedAt))
    setReceiptSeq((await getKV<number>(K.RECEIPT_SEQ)) || 0)
  }, [])

  const syncNow = useCallback(
    async (manual = false) => {
      if (!online) {
        if (manual) showToast('Offline - changes saved locally', 'info')
        return
      }
      // Google access tokens live ~1h; silently renew before hitting the API
      if (tokenNeedsRefresh() && clientId) {
        const hint = (await getKV<Session>(K.SESSION))?.user?.email
        const fresh = await silentSignIn(clientId, hint)
        if (fresh?.token) {
          setToken(fresh.token, fresh.expiresIn)
          setDriveToken(fresh.token)
          setNeedsReauth(false)
        }
      }
      if (!getToken()) {
        if (manual) showToast('Sign in to sync', 'info')
        return
      }
      setSyncing(true)
      log('sync', 'Sync started')
      try {
        await ensureDriveStructure()
        // merge remote changes first (local-newer records win), then push local,
        // then pull again to re-apply everything we just pushed plus new remote state.
        // Re-push diverged records (newer locally than on Drive) so multi-device
        // edits on the same account converge instead of drifting.
        const { needPush } = await pull()
        if (needPush.length) {
          for (const f of needPush) await queueOp({ kind: 'pushJSON', file: f })
        }
        // claim a fresh receipt-number window when the current one is exhausted -
        // one meta write per window instead of one per receipt; the max-merge on
        // pull keeps concurrent claims from ever regressing the shared sequence
        const res = (await getKV<{ high: number; used: number }>(K.SEQ_RESERVED)) || { high: 0, used: 0 }
        const seqNow = (await getKV<number>(K.RECEIPT_SEQ)) || 0
        if (res.used >= res.high) {
          const high = Math.max(seqNow, res.high) + 20
          // keep the window's used where the fleet's merged counter stands -
          // starting it from the stale value would renumber receipts from #1 -
          // and do NOT inflate RECEIPT_SEQ here: it tracks issued numbers so
          // the draft preview stays truthful; the window carries its own
          // high-water mark in the meta file
          await setKV(K.SEQ_RESERVED, { high, used: Math.max(res.used, seqNow) })
          await queueOp({ kind: 'pushJSON', file: 'meta' })
        }
        // count AFTER pull - it may have queued orphan-media cleanups or
        // re-pushes - so the flush never skips work it just created
        const queued = await db.outbox.count()
        // an idle sync (nothing to push) skips the upload pass and the second
        // download entirely - only metadata checks, which keeps sync fast
        if (queued > 0) {
          await flushOutbox()
          await pull()
        }
        await refreshData()
        setLastSyncAt(Date.now())
        if (retryTimer.current) {
          window.clearTimeout(retryTimer.current)
          retryTimer.current = undefined
        }
        log('sync', 'Sync completed')
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Sync failed'
        log('error', `Sync failed: ${msg}`)
        showToast(msg, 'err')
        // a transient failure must not stall the outbox until the next user
        // action - back off and retry once shortly
        if (getToken() && navigator.onLine && !retryTimer.current) {
          retryTimer.current = window.setTimeout(() => {
            retryTimer.current = undefined
            void syncNow()
          }, 30000)
        }
      } finally {
        setSyncing(false)
      }
    },
    [online, showToast, refreshData, clientId],
  )

  const scheduleSync = useCallback(() => {
    window.clearTimeout(syncTimer.current)
    // jitter the debounce so devices on the same account don't sync in lockstep
    syncTimer.current = window.setTimeout(() => {
      void syncNow()
    }, 2500 + Math.random() * 2500)
  }, [syncNow])

  const saveTeachers = useCallback(
    async (t: Teacher[]) => {
      const prevById = new Map(teachers.map((x) => [x.id, x]))
      const now = Date.now()
      const next: Teacher[] = t.map((x) => {
        const prev = prevById.get(x.id)
        if (prev && prev.name === x.name && prev.phone === x.phone) {
          return { ...x, updatedAt: prev.updatedAt || now }
        }
        return { ...x, updatedAt: now }
      })
      // removals become tombstones so other devices drop the teacher too
      const incoming = new Set(t.map((x) => x.id))
      for (const [id, prev] of prevById) {
        if (incoming.has(id)) continue
        if (prev.deletedAt) next.push(prev)
        else next.push({ ...prev, deletedAt: now, updatedAt: now })
      }
      await setKV(K.TEACHERS, next)
      setTeachers(next)
      await queueOp({ kind: 'pushJSON', file: 'meta' })
      scheduleSync()
    },
    [teachers, scheduleSync],
  )

  // init
  useEffect(() => {
    if (bootStarted) return
    bootStarted = true
    let alive = true
    let retry: number | undefined
    ;(async () => {
      const session = await getKV<Session>(K.SESSION)
      if (!alive) return
      // the deployed CLIENT_ID always wins over any ID pasted into an
      // earlier build - a stale stored ID is a silent origin_mismatch trap
      const cid = CLIENT_ID || session?.clientId
      setClientId(cid)
      if (session?.user) setUser(session.user)
      if (session?.pinHash && session.user) setLocked(true)
      if (session?.theme) document.documentElement.classList.toggle('dark', session.theme === 'dark')
      await refreshData()
      if (cid && session?.user) {
        if (!navigator.onLine) {
          // offline: keep the session, data lives locally anyway
          if (alive) setInitialized(true)
          return
        }
        // Token-first: a stored token that is still valid needs no OAuth at
        // all - skip GIS entirely so a plain refresh never touches the login
        // flow (the popup the user saw was Google's picker, which prompt:'none'
        // avoids but which is still better to not reach at all).
        const stored = getToken()
        let tok: TokenResult | null =
          stored && !tokenNeedsRefresh() ? { token: stored } : null
        if (!tok) {
          const hint = session?.user?.email
          log('info', 'Stored token expired, attempting silent sign-in')
          tok = await silentSignIn(cid, hint)
          // GIS can hiccup on cold start - retry once before giving up
          if (!tok && alive) {
            await new Promise((r) => setTimeout(r, 900))
            tok = await silentSignIn(cid, hint)
          }
        }
        if (tok) {
          if (tok.token !== stored) setToken(tok.token, tok.expiresIn)
          setDriveToken(tok.token)
          log('info', 'Session restored successfully')
          if (alive) {
            await ensureDriveStructure().catch(() => undefined)
            void syncNow()
          }
        } else {
          // saved session but silent re-auth failed - keep the user signed
          // in locally (data is on-device anyway) and retry in the background;
          // a small banner offers one-tap re-auth. No forced login screen.
          if (alive) {
            setNeedsReauth(true)
            setReauthError(lastSilentError)
            retry = window.setInterval(async () => {
              const hint = (await getKV<Session>(K.SESSION))?.user?.email
              const t = await silentSignIn(cid, hint)
              if (!t) {
                setReauthError(lastSilentError)
                return
              }
              window.clearInterval(retry)
              if (!alive) return
              setToken(t.token, t.expiresIn)
              setDriveToken(t.token)
              setNeedsReauth(false)
              setReauthError(null)
              void syncNow()
            }, 30000)
          }
        }
      }
      if (alive) setInitialized(true)
    })()
    return () => {
      alive = false
      window.clearInterval(retry)
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
      const hint = (await getKV<Session>(K.SESSION))?.user?.email
      const { token, expiresIn, user } = await signIn(cid, hint)
      setToken(token, expiresIn)
      setDriveToken(token)
      setUser(user)
      const session = (await getKV<Session>(K.SESSION)) || { theme: 'light', lastPulledAt: 0 }
      await setKV(K.SESSION, { ...session, clientId: cid, user })
      setClientId(cid)
      log('info', `Login completed: ${user.email}`)
      showToast(`Signed in as ${user.email}`, 'ok')
      setNeedsReauth(false)
      setReauthError(null)
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
    setNeedsReauth(false)
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
        phone: input.phone?.trim(),
        phone2: input.phone2?.trim(),
        batch: input.batch.trim() || 'General',
        defaultFee: input.defaultFee,
        realPayment: input.realPayment,
        commission: input.commission,
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
      if (renamed || !cur.folderId) {
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
      if (!s) return
      const theirPayments = await db.payments.where('studentId').equals(id).toArray()
      if (s?.photoFileId) await queueOp({ kind: 'deleteMedia', fileId: s.photoFileId })
      if (s?.folderId) await queueOp({ kind: 'deleteMedia', fileId: s.folderId })
      for (const p of theirPayments) {
        if (p.pngFileId) await queueOp({ kind: 'deleteMedia', fileId: p.pngFileId })
      }
      await db.transaction('rw', db.students, db.payments, async () => {
        const now = Date.now()
        // tombstone instead of hard delete - other devices apply the delete
        // via sync; a newer edit elsewhere resurrects the record instead of
        // it silently vanishing from the shared file
        await db.students.put({ ...s, deletedAt: now, updatedAt: now })
        for (const p of theirPayments) {
          await db.payments.put({ ...p, deletedAt: now, updatedAt: now })
        }
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
      // issue from the reserved window (claimed during sync, shared across
      // devices via the meta file) - RECEIPT_SEQ and the window's used mark
      // advance in lockstep so the draft preview always shows the true next
      // number, and the monotonic max below keeps multi-device allocation
      // continuous across offline fallback drift
      const res = (await getKV<{ high: number; used: number }>(K.SEQ_RESERVED)) || { high: 0, used: 0 }
      const seqNow = (await getKV<number>(K.RECEIPT_SEQ)) || 0
      const next = Math.max(res.used, seqNow) + 1
      await setKV(K.SEQ_RESERVED, { high: res.high, used: next })
      await setKV(K.RECEIPT_SEQ, next)
      setReceiptSeq(next)
      const p: Payment = {
        id: newId(),
        receiptNo: next,
        studentId: input.studentId,
        amount: input.amount,
        realAmount: input.realAmount,
        commission: input.commission,
        due: input.due || 0,
        mode: input.mode,
        receivedBy: input.receivedBy,
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
      // no per-receipt meta push - the shared sequence propagates when any
      // device claims its next reservation window during sync
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
      // html-to-image re-captures on every edit; when the raster didn't
      // actually change (identical byte size), skip the upload + delete
      // round-trip and keep the existing Drive file
      const blobSameSize = !!(patch.pngBlob && cur.pngBlob && patch.pngBlob.size === cur.pngBlob.size)
      if (patch.pngBlob && !blobSameSize) {
        // upload the new PNG first, then delete the old one - a crash in
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
      // don't delete the Drive PNG eagerly: if the tombstone push fails, the
      // receipt must stay intact for the other devices. queueMediaDeletes
      // (flushOutbox) removes the PNG only after the push has succeeded.
      const now = Date.now()
      const tombstone = { ...cur, deletedAt: now, updatedAt: now }
      if (cur.pngFileId) tombstone.pendingMedia = cur.pngFileId
      await db.payments.put(tombstone)
      await queueOp({ kind: 'pushJSON', file: 'payments' })
      await refreshData()
      scheduleSync()
    },
    [refreshData, scheduleSync],
  )

  const addPosting = useCallback(
    async (input: { amount: number; receivedBy?: ReceivedBy; date: number }): Promise<Posting> => {
      const now = Date.now()
      const p: Posting = {
        id: newId(),
        amount: input.amount,
        receivedBy: input.receivedBy,
        date: input.date,
        updatedAt: now,
      }
      await db.postings.add(p)
      await queueOp({ kind: 'pushJSON', file: 'postings' })
      await refreshData()
      scheduleSync()
      return p
    },
    [refreshData, scheduleSync],
  )

  const updatePosting = useCallback(
    async (id: string, patch: Partial<Posting>) => {
      const cur = await db.postings.get(id)
      if (!cur) return
      await db.postings.put({ ...cur, ...patch, updatedAt: Date.now() })
      await queueOp({ kind: 'pushJSON', file: 'postings' })
      await refreshData()
      scheduleSync()
    },
    [refreshData, scheduleSync],
  )

  const deletePosting = useCallback(
    async (id: string) => {
      const cur = await db.postings.get(id)
      if (!cur) return
      await db.postings.put({ ...cur, deletedAt: Date.now(), updatedAt: Date.now() })
      await queueOp({ kind: 'pushJSON', file: 'postings' })
      await refreshData()
      scheduleSync()
    },
    [refreshData, scheduleSync],
  )

  const saveAttendance = useCallback(
    async (input: {
      batch: string
      day: string
      marks: Array<{ studentId: string; status: AttendanceStatus }>
    }) => {
      // one logical edit per batch-day: a single timestamp keeps same-day
      // edits from two devices merging into a perpetual re-push loop (equal
      // stamps + equal sigs converge instantly)
      const now = Date.now()
      const batch = input.batch
      await db.transaction('rw', db.attendance, async () => {
        const rows: Attendance[] = input.marks.map((m) => ({
          id: `${m.studentId}_${input.day}`,
          studentId: m.studentId,
          batch,
          day: input.day,
          status: m.status,
          updatedAt: now,
        }))
        await db.attendance.bulkPut(rows)
      })
      await queueOp({ kind: 'pushJSON', file: 'attendance' })
      await refreshData()
      scheduleSync()
    },
    [refreshData, scheduleSync],
  )

  const toggleCleared = useCallback(
    async (id: string, cleared: boolean) => {
      const row = attendances.find((a) => a.id === id)
      if (!row) return
      await db.attendance.put({ ...row, cleared, updatedAt: Date.now() })
      await queueOp({ kind: 'pushJSON', file: 'attendance' })
      await refreshData()
      scheduleSync()
    },
    [attendances, refreshData, scheduleSync],
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
      needsReauth,
      reauthError,
      students,
      payments,
      postings,
      attendances,
      teachers,
      center,
      receiptSeq,
      toast,
      saveClientId,
      login,
      logout,
      syncNow,
      refreshData,
      saveTeachers,
      addStudent,
      updateStudent,
      archiveStudent,
      deleteStudent,
      addPayment,
      updatePayment,
      deletePayment,
      addPosting,
      updatePosting,
      deletePosting,
      saveAttendance,
      toggleCleared,
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
      needsReauth,
      reauthError,
      students,
      payments,
      postings,
      attendances,
      teachers,
      center,
      receiptSeq,
      toast,
      saveClientId,
      login,
      logout,
      syncNow,
      refreshData,
      saveTeachers,
      addStudent,
      updateStudent,
      archiveStudent,
      deleteStudent,
      addPayment,
      updatePayment,
      deletePayment,
      addPosting,
      updatePosting,
      deletePosting,
      saveAttendance,
      toggleCleared,
      updateCenter,
      setTheme,
      setPin,
      clearPin,
      setLocked,
      showToast,
    ],
  )

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}
