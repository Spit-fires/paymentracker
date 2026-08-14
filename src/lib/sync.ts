import { DriveClient } from './drive'
import { db, getKV, setKV, queueOp, getStudents, getPayments, K } from './db'
import { fmtDate } from './format'
import { log } from './logs'
import type {
  DriveRefs,
  OutboxOp,
  OutboxEntry,
  Student,
  Payment,
  Center,
  Session,
  Teacher,
} from '../types'

let _client: DriveClient | null = null

export function setDriveToken(token: string): void {
  _client = new DriveClient(token)
}

function client(): DriveClient {
  if (!_client) throw new Error('Not signed in')
  return _client
}

/**
 * Public "anyone with the link" URL for a receipt PNG, so WhatsApp messages
 * can carry a directly viewable link instead of an attachment. Returns null
 * when the file isn't uploaded yet or we're offline.
 */
export async function receiptViewLink(paymentId: string): Promise<string | null> {
  const payment = await db.payments.get(paymentId)
  if (!payment?.pngFileId) return null
  try {
    return await client().ensurePublic(payment.pngFileId)
  } catch (e) {
    log('warn', `ensurePublic failed for ${payment.pngFileId}: ${e instanceof Error ? e.message : e}`)
    return null
  }
}

/**
 * Force-retry making a receipt's PNG publicly viewable on Drive.
 * Called on-demand when the user taps WhatsApp before the initial
 * ensurePublic has completed.
 */
export async function retryEnsurePublic(paymentId: string): Promise<string | null> {
  const payment = await db.payments.get(paymentId)
  if (!payment?.pngFileId) return null
  try {
    const link = await client().ensurePublic(payment.pngFileId)
    log('sync', `Retry ensurePublic succeeded for receipt #${payment.receiptNo}`)
    return link
  } catch (e) {
    log('warn', `Retry ensurePublic failed: ${e instanceof Error ? e.message : e}`)
    return null
  }
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
  const teachers = (await getKV<Teacher[]>(K.TEACHERS)) || []
  const seqReserved = (await getKV<{ high: number; used: number }>(K.SEQ_RESERVED)) || { high: 0, used: 0 }
  return JSON.stringify({ version: 1, updatedAt: Date.now(), center, receiptSeq, teachers, seqReserved })
}

export function defaultCenter(): Center {
  return {
    name: 'UTSAHO EDUCARE',
    tagline: 'Learn · Grow · Succeed',
    address: '',
    phone: '',
    // keep the pre-editor messages as the defaults — an empty/missing saved
    // message falls back to these, so existing setups keep working untouched
    reminderMsg:
      'Assalamu alaikum {student},\n\nThis is a friendly reminder that your {period} fee is pending for {center}. Please make the payment at your earliest convenience. Thank you!',
    receiptMsg: '{student} এর {period} বেতন পরিশোধের রশিদ দেখতে নিচের লিংকে ক্লিক করুন। {link}',
  }
}

/** Create a Google Spreadsheet inside the Drive root with Students and
 *  Payments tabs, then return its view link. The Sheets API accepts our
 *  drive.file token because the spreadsheet is created by this app. */
export async function exportToSheet(
  students: Student[],
  payments: Payment[],
  center: Center,
): Promise<string> {
  const drive = await getKV<DriveRefs>(K.DRIVE)
  if (!drive?.rootFolderId) throw new Error('Drive not ready — sign in first')
  const { id, webViewLink } = await client().createSpreadsheet(
    `${center.name || 'Utsaho Educare'} Data - ${fmtDate(Date.now())}`,
    drive.rootFolderId,
  )
  const names = new Map(students.map((s) => [s.id, s.name]))
  await client().sheetUpdate(id, [
    { updateSheetProperties: { properties: { sheetId: 0, title: 'Students' }, fields: 'title' } },
    { addSheet: { properties: { title: 'Payments' } } },
  ])
  await client().sheetValues(id, 'Students!A1', [
    ['Name', 'Phone', 'Alt number', 'Batch / Class', 'Default fee (৳)', 'Notes', 'Archived'],
    ...students.map((s) => [
      s.name,
      s.phone || '',
      s.phone2 || '',
      s.batch,
      s.defaultFee || 0,
      s.notes || '',
      s.archived ? 'yes' : '',
    ]),
  ])
  await client().sheetValues(id, 'Payments!A1', [
    ['Receipt No', 'Date', 'Student', 'Period', 'Mode', 'Amount (৳)', 'Due (৳)', 'Received by'],
    ...payments.map((p) => [
      p.receiptNo,
      fmtDate(p.date),
      names.get(p.studentId) || '',
      p.period,
      p.mode,
      p.amount,
      p.due || 0,
      p.receivedBy?.name || '',
    ]),
  ])
  return webViewLink
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
}

async function applyOp(op: OutboxOp): Promise<void> {
  const drive = (await getKV<DriveRefs>(K.DRIVE))!
  switch (op.kind) {
    case 'pushJSON': {
      const fileId = drive.fileIds[op.file]
      if (!fileId) break
      const content = await buildJSON(op.file)
      await client().updateContent(fileId, 'application/json', content)
      log('sync', `Pushed ${op.file}.json to Drive`)
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
      log('sync', `Uploaded ${op.fileName} to Drive`)
      if (op.type === 'photo') {
        await db.students.update(op.studentId, { photoFileId: id })
        await queueOp({ kind: 'pushJSON', file: 'students' })
      } else if (op.paymentId) {
        await db.payments.update(op.paymentId, { pngFileId: id })
        await queueOp({ kind: 'pushJSON', file: 'payments' })
        // make the receipt publicly viewable so the WhatsApp link works
        try {
          await client().ensurePublic(id)
          log('sync', `Made receipt ${op.fileName} publicly viewable`)
        } catch (e) {
          log('warn', `Failed to make receipt public: ${e instanceof Error ? e.message : e}`)
        }
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
    // receipt PNGs are the slowest ops (large bodies, network-bound) — run
    // them in small parallel batches; everything else stays strictly ordered
    let i = 0
    while (i < entries.length) {
      const batch: OutboxEntry[] = []
      while (i < entries.length && batch.length < 3 && entries[i].op.kind === 'uploadMedia') {
        batch.push(entries[i])
        i++
      }
      if (batch.length) {
        // a failed upload just stays queued — the next pass retries it and
        // this pass continues with the remaining ops
        await Promise.all(
          batch.map(async (e) => {
            await applyOp(e.op)
            await db.outbox.delete(e.id!)
          }),
        )
        continue
      }
      const e = entries[i]
      i++
      try {
        await applyOp(e.op)
        await db.outbox.delete(e.id!)
      } catch (err) {
        log('error', `Outbox op failed (${e.op.kind}): ${err instanceof Error ? err.message : err}`)
        throw err // abort this pass — op stays queued
      }
    }
  }
}

/** signature of the user-editable fields — used to break same-timestamp ties */
function studentSig(s: Student): string {
  return JSON.stringify([s.name, s.phone || '', s.phone2 || '', s.batch, s.defaultFee, s.realPayment ?? null, s.notes || '', s.archived, s.deletedAt ?? null])
}
function paymentSig(p: Payment): string {
  return JSON.stringify([
    p.receiptNo,
    p.studentId,
    p.amount,
    p.realAmount ?? null,
    p.commission ?? null,
    p.due || 0,
    p.mode,
    p.receivedBy ? [p.receivedBy.name, p.receivedBy.phone || ''] : null,
    p.period,
    p.date,
    p.deletedAt ?? null,
  ])
}

/**
 * Union-merge two teacher lists (last-writer-wins per member, tombstones for
 * removals). Ties (equal or unknown timestamps) deterministically resolve to
 * the remote copy so merge storms are impossible.
 */
function mergeTeachers(local: Teacher[], remote: Teacher[]): Teacher[] {
  const byId = new Map(local.map((t) => [t.id, t]))
  for (const rt of remote) {
    const lt = byId.get(rt.id)
    if (!lt) {
      byId.set(rt.id, rt)
      continue
    }
    const rtAt = rt.updatedAt || 0
    const ltAt = lt.updatedAt || 0
    if (rtAt > ltAt) {
      byId.set(rt.id, rt)
    } else if (rtAt === ltAt) {
      // equal stamps — prefer remote (deterministic, no re-push loop)
      if (JSON.stringify(lt) !== JSON.stringify(rt)) byId.set(rt.id, rt)
    }
    // rtAt < ltAt → keep local (newer) — the caller re-pushes via diff
  }
  return [...byId.values()]
}

/**
 * Replace local data from Drive when remote is newer. Returns what changed and
 * which JSON files hold records that are newer locally than on Drive (those
 * must be re-pushed so every device converges instead of drifting).
 */
export async function pull(): Promise<{
  changed: boolean
  needPush: Array<'students' | 'payments' | 'meta'>
}> {
  const drive = await getKV<DriveRefs>(K.DRIVE)
  if (!drive?.rootFolderId) return { changed: false, needPush: [] }
  const c = client()
  const session = (await getKV<Session>(K.SESSION)) || { theme: 'light', lastPulledAt: 0 }
  // per-file pull tracking: each JSON file is processed only when IT changed
  // since we last processed it. The old shared global gate let the meta file
  // (rewritten with a fresh Date.now() on every single sync) jump the cutoff
  // past slower-updated students/payments snapshots — those snapshots were
  // then silently skipped forever, which is how a delete on one device never
  // reached another. `lastPulledAt` stays as the baseline for pre-upgrade
  // sessions and as a safety net for files never processed since then.
  const pulledAt = { ...(session.pulledAt || {}) }
  const baseAt = (f: 'students' | 'payments' | 'meta') => (pulledAt[f] ?? session.lastPulledAt) || 0
  let changed = false
  let pullDirty = false
  let latest = session.lastPulledAt
  const needPush: Array<'students' | 'payments' | 'meta'> = []
  const stamps = { ...(drive.stamps || {}) }
  let stampDirty = false

  const files: Array<['students' | 'payments' | 'meta', string | undefined]> = [
    ['students', drive.fileIds.students],
    ['payments', drive.fileIds.payments],
    ['meta', drive.fileIds.meta],
  ]
  // run two passes: the second is nearly free (in-memory stamps skip
  // unchanged files) and catches files that another device rewrote while
  // we were downloading pass 1 — closes the torn-snapshot window
  for (let pass = 0; pass < 2; pass++) {
  for (const [file, fileId] of files) {
    if (!fileId) continue
    try {
      // cheap metadata call first — skip the (possibly large) download when
      // this file has not changed since we last saw it
      const meta = await c.get(fileId, 'id,modifiedTime')
      if (meta.modifiedTime && meta.modifiedTime === stamps[file]) continue
      const text = await c.downloadText(fileId)
      const j = JSON.parse(text)
      if (!j || typeof j !== 'object') continue
      latest = Math.max(latest, j.updatedAt || 0)
      const fileAt = j.updatedAt || 0
      // a device with a fast/slow clock wins/loses every merge silently —
      // surface it so the fleets' clocks can be fixed
      if (fileAt && Math.abs(Date.now() - fileAt) > 60 * 60 * 1000) {
        log('warn', `Clock skew: ${file}.json built ${Math.round((Date.now() - fileAt) / 60000)} min from device time`)
      }
      if (fileAt > baseAt(file)) {
        if (file === 'students' && Array.isArray(j.students)) {
          await db.transaction('rw', db.students, async () => {
            const local = new Map((await db.students.toArray()).map((s) => [s.id, s]))
            const remoteIds = new Set(j.students.map((s: Student) => s.id))
            // 1) tombstones: purge locally unless we edited the record after
            // the remote delete — a newer local edit resurrects it via re-push
            for (const s of j.students) {
              if (!s.deletedAt) continue
              const cur = local.get(s.id)
              if (!cur) continue
              if ((cur.updatedAt || 0) > (s.deletedAt || 0)) {
                if (!needPush.includes('students')) needPush.push('students')
                continue
              }
              await db.students.delete(s.id)
              local.delete(s.id)
            }
            // 2) records missing from the file: absence is NEVER a delete —
            //    deletes are explicit tombstones above. Missing = the author's
            //    snapshot predates it (created/edited elsewhere) → re-push so
            //    every device converges
            for (const loc of local.values()) {
              if (remoteIds.has(loc.id)) continue
              if (!needPush.includes('students')) needPush.push('students')
            }
            // 3) plain records: keep local when fresher than our last pull or
            //    newer than the remote record; otherwise take remote
            const merged = j.students
              .filter((s: Student) => !s.deletedAt)
              .map((s: Student) => {
                const cur = local.get(s.id)
                if (!cur) return s
                // a local tombstone always beats a stale remote copy — the
                // remote record is only a snapshot taken before the delete;
                // re-push so every device converges on the tombstone
                if (cur.deletedAt && !s.deletedAt) {
                  if (!needPush.includes('students')) needPush.push('students')
                  return {
                    ...cur,
                    photoBlob: cur.photoBlob,
                    photoFileId: s.photoFileId || cur.photoFileId,
                    folderId: s.folderId || cur.folderId,
                    folderShared: s.folderShared || cur.folderShared,
                  }
                }
                const keepLocal =
                  (cur.updatedAt || 0) > baseAt('students') || (cur.updatedAt || 0) >= (s.updatedAt || 0)
                // strictly newer locally → divergent, must re-push; equal
                // timestamps with different content also diverge (break the
                // tie deterministically: local copy wins, then re-push once)
                const div =
                  (cur.updatedAt || 0) > (s.updatedAt || 0) ||
                  ((cur.updatedAt || 0) === (s.updatedAt || 0) && studentSig(cur) !== studentSig(s))
                if (keepLocal && div) {
                  if (!needPush.includes('students')) needPush.push('students')
                }
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
          })
          changed = true
        } else if (file === 'payments' && Array.isArray(j.payments)) {
          // Drive files whose references get replaced by the remote copy —
          // queued for deletion after the transaction (outbox writes can't
          // nest inside the running one)
          const orphans: string[] = []
          await db.transaction('rw', db.payments, async () => {
            const local = new Map((await db.payments.toArray()).map((p) => [p.id, p]))
            const remoteIds = new Set(j.payments.map((p: Payment) => p.id))
            // 1) tombstones
            for (const p of j.payments) {
              if (!p.deletedAt) continue
              const cur = local.get(p.id)
              if (!cur) continue
              if ((cur.updatedAt || 0) > (p.deletedAt || 0)) {
                if (!needPush.includes('payments')) needPush.push('payments')
                continue
              }
              await db.payments.delete(p.id)
              local.delete(p.id)
            }
            // 2) records missing from the file: absence is NEVER a delete —
            //    deletes are explicit tombstones above. Missing = the author's
            //    snapshot predates it (created/edited elsewhere) → re-push so
            //    every device converges
            for (const loc of local.values()) {
              if (remoteIds.has(loc.id)) continue
              if (!needPush.includes('payments')) needPush.push('payments')
            }
            // 3) plain records
            const merged = j.payments
              .filter((p: Payment) => !p.deletedAt)
              .map((p: Payment) => {
                const cur = local.get(p.id)
                if (!cur) return p
                // a local tombstone always beats a stale remote copy — the
                // remote record is only a snapshot taken before the delete;
                // re-push so every device converges on the tombstone
                if (cur.deletedAt && !p.deletedAt) {
                  if (!needPush.includes('payments')) needPush.push('payments')
                  return {
                    ...cur,
                    pngBlob: cur.pngBlob || p.pngBlob,
                    pngFileId: p.pngFileId || cur.pngFileId,
                  }
                }
                const keepLocal =
                  (cur.updatedAt || 0) > baseAt('payments') || (cur.updatedAt || 0) >= (p.updatedAt || 0)
                // strictly newer locally → divergent, must re-push; equal
                // timestamps with different content also diverge (local wins,
                // then a single re-push lets every device settle)
                const div =
                  (cur.updatedAt || 0) > (p.updatedAt || 0) ||
                  ((cur.updatedAt || 0) === (p.updatedAt || 0) && paymentSig(cur) !== paymentSig(p))
                if (keepLocal && div) {
                  if (!needPush.includes('payments')) needPush.push('payments')
                }
                const base = keepLocal ? cur : p
                // remote file won → our old file is orphaned on Drive
                if (!keepLocal && cur.pngFileId && cur.pngFileId !== p.pngFileId) {
                  orphans.push(cur.pngFileId)
                }
                return {
                  ...base,
                  pngBlob: cur.pngBlob || p.pngBlob,
                  pngFileId: p.pngFileId || cur.pngFileId,
                }
              })
            await db.payments.bulkPut(merged)
            // two devices can allocate the same receipt number while both
            // offline — keep the earliest record, renumber the rest so the
            // shared stream never produces duplicate receipt numbers again.
            // Scans every active record (including local-only receipts that
            // were never in this file) so offline-created numbers are caught too.
            const active = (await db.payments.toArray())
              .filter((p) => !p.deletedAt)
              .sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0))
            const used = new Set<number>()
            for (const p of active) {
              if (!used.has(p.receiptNo)) {
                used.add(p.receiptNo)
                continue
              }
              const oldNo = p.receiptNo
              let n = Math.max(0, ...used) + 1
              while (used.has(n)) n++
              used.add(n)
              await db.payments.update(p.id, { receiptNo: n })
              if (!needPush.includes('payments')) needPush.push('payments')
              log('sync', `Renumbered receipt #${oldNo} → #${n} (duplicate from concurrent device)`)
            }
            // a renumbered record must never collide with numbers the
            // reservation window will hand to new receipts — advance the
            // shared counters to the highest active number so future
            // allocations (and the preview) sit above it
            if (used.size) {
              const maxNo = Math.max(...used)
              const curRes = (await getKV<{ high: number; used: number }>(K.SEQ_RESERVED)) || { high: 0, used: 0 }
              if (maxNo > curRes.used) {
                await setKV(K.SEQ_RESERVED, { high: curRes.high, used: maxNo })
              }
              const curSeq = (await getKV<number>(K.RECEIPT_SEQ)) || 0
              if (maxNo > curSeq) await setKV(K.RECEIPT_SEQ, maxNo)
            }
          })
          if (orphans.length) {
            log('sync', `Cleaning ${orphans.length} orphaned receipt file(s)`)
            for (const fid of orphans) await queueOp({ kind: 'deleteMedia', fileId: fid })
          }
          changed = true
        } else if (file === 'meta' && j.center) {
          await setKV(K.CENTER, { ...((await getKV<Center>(K.CENTER)) || {}), ...j.center })
          const seq = Math.max(j.receiptSeq || 0, (await getKV<number>(K.RECEIPT_SEQ)) || 0)
          await setKV(K.RECEIPT_SEQ, seq)
          // the reservation window travels with the meta file too — without
          // it a second device only sees the window high-water mark and
          // re-allocates numbers the claiming device already burned locally
          const curRes = (await getKV<{ high: number; used: number }>(K.SEQ_RESERVED)) || { high: 0, used: 0 }
          const remRes = (j.seqReserved as { high?: number; used?: number }) || {}
          await setKV(K.SEQ_RESERVED, {
            high: Math.max(curRes.high, remRes.high || 0),
            used: Math.max(curRes.used, remRes.used || 0),
          })
          // teachers merge per member (LWW + tombstones) instead of
          // whole-array overwrite, so two admins adding teachers in parallel
          // never clobber each other's new entry
          const curT = (await getKV<Teacher[]>(K.TEACHERS)) || []
          const remoteT = Array.isArray(j.teachers) ? j.teachers : []
          const mergedT = mergeTeachers(curT, remoteT)
          await setKV(K.TEACHERS, mergedT)
          // compare as canonical sets — order must not trigger re-pushes
          const canon = (arr: Teacher[]) =>
            JSON.stringify([...arr].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)))
          if (canon(mergedT) !== canon(remoteT)) {
            if (!needPush.includes('meta')) needPush.push('meta')
          }
          changed = true
        }
        // this exact snapshot is now fully merged — never reprocess it.
        // Advancing only here (after a successful merge) means a failed
        // transaction leaves pulledAt untouched and the file is retried
        pulledAt[file] = Math.max(pulledAt[file] || 0, fileAt)
        pullDirty = true
      }
      // commit the stamp only after a successful download+parse — a failed
      // pull must not mark the file as seen (next sync retries it)
      if (meta.modifiedTime && meta.modifiedTime !== stamps[file]) {
        stamps[file] = meta.modifiedTime
        stampDirty = true
      }
    } catch (e) {
      // file missing or parse error — skip but log
      log('warn', `Pull ${file} failed: ${e instanceof Error ? e.message : e}`)
    }
  }
  }
  if (stampDirty) {
    await setKV(K.DRIVE, { ...drive, stamps })
  }
  if (pullDirty) {
    await setKV(K.SESSION, { ...session, pulledAt, lastPulledAt: latest })
    log('sync', 'Pulled latest data from Drive')
  }
  return { changed, needPush }
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
  log('sync', 'Drive structure ready')
  return drive
}
