import { DriveClient } from './drive'
import { db, getKV, setKV, queueOp, getStudents, getPayments, K } from './db'
import type { DriveRefs, OutboxOp, Student, Payment, Center, Session } from '../types'

let _client: DriveClient | null = null

export function setDriveToken(token: string): void {
  _client = new DriveClient(token)
}

function client(): DriveClient {
  if (!_client) throw new Error('Not signed in')
  return _client
}

function cleanStudent(s: Student) {
  const { photoBlob: _pb, ...rest } = s
  return rest
}
function cleanPayment(p: Payment) {
  const { pngBlob: _pb, ...rest } = p
  return rest
}

async function buildJSON(file: 'students' | 'payments' | 'meta'): Promise<string> {
  if (file === 'students') {
    const students = (await getStudents()).map(cleanStudent)
    return JSON.stringify({ version: 1, updatedAt: Date.now(), students })
  }
  if (file === 'payments') {
    const payments = (await getPayments()).map(cleanPayment)
    return JSON.stringify({ version: 1, updatedAt: Date.now(), payments })
  }
  const center = (await getKV<Center>(K.CENTER)) || defaultCenter()
  const receiptSeq = (await getKV<number>(K.RECEIPT_SEQ)) || 0
  return JSON.stringify({ version: 1, updatedAt: Date.now(), center, receiptSeq })
}

export function defaultCenter(): Center {
  return {
    name: 'Utshaho Educare',
    tagline: 'Learn · Grow · Succeed',
    address: '',
    phone: '',
  }
}

async function ensureStudentFolder(student: Student): Promise<void> {
  const drive = (await getKV<DriveRefs>(K.DRIVE))!
  if (!drive.studentsFolderId) {
    const id = await client().createFolder('Students', drive.rootFolderId!, { pt: 'students' })
    drive.studentsFolderId = id
    await setKV(K.DRIVE, drive)
  }
  if (!student.folderId) {
    const fid = await client().createFolder(
      `${student.batch || 'Batch'} - ${student.name}`,
      drive.studentsFolderId,
      { pt: 'student', studentId: student.id },
    )
    await db.students.update(student.id, { folderId: fid })
    student.folderId = fid
  }
  if (student.email && !student.folderShared) {
    try {
      await client().shareWith(student.folderId, student.email)
      await db.students.update(student.id, { folderShared: true })
    } catch {
      // sharing can fail (no Google account) — retried on next sync
    }
  }
}

async function applyOp(op: OutboxOp): Promise<void> {
  const drive = (await getKV<DriveRefs>(K.DRIVE))!
  switch (op.kind) {
    case 'pushJSON': {
      const fileId = drive.fileIds[op.file]
      if (!fileId) break
      const content = await buildJSON(op.file)
      await client().updateContent(fileId, 'application/json', content)
      break
    }
    case 'ensureStudentFolder': {
      const student = await db.students.get(op.studentId)
      if (student) await ensureStudentFolder(student)
      await queueOp({ kind: 'pushJSON', file: 'students' })
      break
    }
    case 'uploadMedia': {
      const student = await db.students.get(op.studentId)
      if (!student) break
      if (!student.folderId) await ensureStudentFolder(student)
      const cur = await db.students.get(op.studentId)
      if (!cur?.folderId) break
      const id = await client().createFile(cur.folderId, op.fileName, 'image/png', op.blob)
      if (op.type === 'photo') {
        await db.students.update(op.studentId, { photoFileId: id })
        await queueOp({ kind: 'pushJSON', file: 'students' })
      } else if (op.paymentId) {
        await db.payments.update(op.paymentId, { pngFileId: id })
        await queueOp({ kind: 'pushJSON', file: 'payments' })
      }
      break
    }
    case 'deleteMedia': {
      try {
        await client().deleteFile(op.fileId)
      } catch {
        // already gone
      }
      break
    }
  }
}

export async function flushOutbox(): Promise<void> {
  for (;;) {
    const entries = await db.outbox.toArray()
    if (!entries.length) return
    for (const e of entries) {
      // any failure aborts this pass and keeps the op queued for retry
      await applyOp(e.op)
      await db.outbox.delete(e.id!)
    }
  }
}

/** Replace local data from Drive when remote is newer. Returns true if anything changed. */
export async function pull(): Promise<boolean> {
  const drive = await getKV<DriveRefs>(K.DRIVE)
  if (!drive?.rootFolderId) return false
  const session = (await getKV<Session>(K.SESSION)) || { theme: 'light', lastPulledAt: 0 }
  let changed = false
  let latest = session.lastPulledAt

  const files: Array<['students' | 'payments' | 'meta', string | undefined]> = [
    ['students', drive.fileIds.students],
    ['payments', drive.fileIds.payments],
    ['meta', drive.fileIds.meta],
  ]
  for (const [file, fileId] of files) {
    if (!fileId) continue
    try {
      const text = await client().downloadText(fileId)
      const j = JSON.parse(text)
      if (!j || typeof j !== 'object') continue
      latest = Math.max(latest, j.updatedAt || 0)
      if ((j.updatedAt || 0) > session.lastPulledAt) {
        if (file === 'students' && Array.isArray(j.students)) {
          await db.transaction('rw', db.students, async () => {
            const local = new Map((await db.students.toArray()).map((s) => [s.id, s]))
            const merged = j.students.map((s: Student) => {
              const cur = local.get(s.id)
              if (!cur) return s
              // keep local when it's fresher than our last pull (likely unsynced)
              // or newer than the remote record; otherwise take remote
              const keepLocal =
                (cur.updatedAt || 0) > session.lastPulledAt || (cur.updatedAt || 0) >= (s.updatedAt || 0)
              const base = keepLocal ? cur : s
              return {
                ...base,
                photoBlob: cur.photoBlob,
                photoFileId: s.photoFileId || cur.photoFileId,
                folderId: s.folderId || cur.folderId,
                folderShared: s.folderShared || cur.folderShared,
              }
            })
            await db.students.bulkPut(merged)
            // propagate deletes, but never drop records newer than the last pull
            const remoteIds = new Set(j.students.map((s: Student) => s.id))
            for (const loc of local.values()) {
              if (!remoteIds.has(loc.id) && (loc.updatedAt || 0) <= session.lastPulledAt) {
                await db.students.delete(loc.id)
              }
            }
          })
          changed = true
        } else if (file === 'payments' && Array.isArray(j.payments)) {
          await db.transaction('rw', db.payments, async () => {
            const local = new Map((await db.payments.toArray()).map((p) => [p.id, p]))
            const merged = j.payments.map((p: Payment) => {
              const cur = local.get(p.id)
              if (!cur) return p
              const keepLocal =
                (cur.updatedAt || 0) > session.lastPulledAt || (cur.updatedAt || 0) >= (p.updatedAt || 0)
              const base = keepLocal ? cur : p
              return {
                ...base,
                pngBlob: cur.pngBlob || p.pngBlob,
                pngFileId: p.pngFileId || cur.pngFileId,
              }
            })
            await db.payments.bulkPut(merged)
            const remoteIds = new Set(j.payments.map((p: Payment) => p.id))
            for (const loc of local.values()) {
              if (!remoteIds.has(loc.id) && (loc.updatedAt || 0) <= session.lastPulledAt) {
                await db.payments.delete(loc.id)
              }
            }
          })
          changed = true
        } else if (file === 'meta' && j.center) {
          await setKV(K.CENTER, j.center)
          const seq = Math.max(j.receiptSeq || 0, (await getKV<number>(K.RECEIPT_SEQ)) || 0)
          await setKV(K.RECEIPT_SEQ, seq)
          changed = true
        }
      }
    } catch {
      // file missing or parse error — skip
    }
  }
  if (changed) {
    await setKV(K.SESSION, { ...session, lastPulledAt: latest })
  }
  return changed
}

function isNotFound(e: unknown): boolean {
  const status = (e as { status?: number }).status
  if (status === 404) return true
  return /not found/i.test(String((e as Error).message || ''))
}

export async function ensureDriveStructure(): Promise<DriveRefs> {
  const c = client()
  const session = (await getKV<Session>(K.SESSION)) || { theme: 'light', lastPulledAt: 0 }
  const email = session.user?.email

  const existing = await getKV<DriveRefs>(K.DRIVE)
  // only trust refs recorded for the signed-in account, and only if the
  // folder still exists — it may have been deleted inside Drive
  if (existing?.rootFolderId && existing.ownerEmail === email) {
    try {
      await c.get(existing.rootFolderId)
      return existing
    } catch (e) {
      if (!isNotFound(e)) throw e
      // deleted → rebuild below
    }
  }

  // (re)discover in the CURRENT account: app-marked root first, then a plain
  // name match (covers folders from older versions or created manually),
  // otherwise create a fresh root folder
  let roots = await c.list(
    "appProperties has { key='pt' and value='root' } and trashed=false",
    'files(id,name,mimeType)',
  )
  if (!roots.length) {
    roots = await c.list(
      "name = 'PaymentTracker' and mimeType = 'application/vnd.google-apps.folder' and trashed=false",
      'files(id,name,mimeType)',
    )
  }
  const rootId = roots[0]?.id || (await c.createFolder('PaymentTracker', 'root', { pt: 'root' }))

  const files = await c.list(`'${rootId}' in parents and trashed=false`)
  const mk = async (name: string): Promise<string> => {
    const hit = files.find((f) => f.name === name)
    if (hit) return hit.id
    return c.createFile(rootId, name, 'application/json', JSON.stringify({ version: 1, updatedAt: 0 }), {
      pt: name,
    })
  }

  let studentsFolderId: string | undefined
  const studentFolders = files.filter((f) => f.mimeType === 'application/vnd.google-apps.folder')
  const hit = studentFolders.find((f) => f.name === 'Students')
  studentsFolderId = hit?.id || studentsFolderId
  if (!studentsFolderId) {
    studentsFolderId = await c.createFolder('Students', rootId, { pt: 'students' })
  }

  const drive: DriveRefs = {
    rootFolderId: rootId,
    studentsFolderId,
    ownerEmail: email,
    fileIds: {
      students: await mk('_students.json'),
      payments: await mk('_payments.json'),
      meta: await mk('_meta.json'),
    },
  }
  await setKV(K.DRIVE, drive)
  return drive
}
