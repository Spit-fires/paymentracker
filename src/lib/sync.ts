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
  while (true) {
    const entries = await db.outbox.toArray()
    if (!entries.length) break
    for (const e of entries) {
      try {
        await applyOp(e.op)
        await db.outbox.delete(e.id!)
      } catch {
        break
      }
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
              return {
                ...s,
                photoBlob: cur.photoBlob,
                photoFileId: cur.photoFileId,
                folderId: cur.folderId,
                folderShared: cur.folderShared,
              }
            })
            await db.students.bulkPut(merged)
          })
          changed = true
        } else if (file === 'payments' && Array.isArray(j.payments)) {
          await db.transaction('rw', db.payments, async () => {
            const local = new Map((await db.payments.toArray()).map((p) => [p.id, p]))
            const merged = j.payments.map((p: Payment) => {
              const cur = local.get(p.id)
              return cur?.pngBlob ? { ...p, pngBlob: cur.pngBlob } : cur?.pngFileId ? { ...p, pngFileId: cur.pngFileId } : p
            })
            await db.payments.bulkPut(merged)
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

export async function ensureDriveStructure(): Promise<DriveRefs> {
  const existing = await getKV<DriveRefs>(K.DRIVE)
  if (existing?.rootFolderId) return existing
  const c = client()
  const roots = await c.list("appProperties has { key='pt' and value='root' } and trashed=false", 'files(id)')
  let rootId = roots[0]?.id
  if (!rootId) rootId = await c.createFolder('PaymentTracker', 'root', { pt: 'root' })

  const files = await c.list(`'${rootId}' in parents and trashed=false`)
  const mk = async (name: string): Promise<string> => {
    const hit = files.find((f) => f.name === name)
    if (hit) return hit.id
    return c.createFile(rootId, name, 'application/json', JSON.stringify({ version: 1, updatedAt: 0 }), {
      pt: name,
    })
  }
  const drive: DriveRefs = {
    rootFolderId: rootId,
    fileIds: {
      students: await mk('_students.json'),
      payments: await mk('_payments.json'),
      meta: await mk('_meta.json'),
    },
  }
  await setKV(K.DRIVE, drive)
  return drive
}
