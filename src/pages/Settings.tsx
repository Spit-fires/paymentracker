import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import { db, setKV, queueOp, K, getKV } from '../lib/db'
import { hashPin } from '../lib/pin'
import { periodNow, periodLabel, fmtDate } from '../lib/format'
import { defaultCenter, exportToSheet } from '../lib/sync'
import { openExternal } from '../lib/phone'
import { getLogs, clearLogs, onLogsChange, type LogEntry } from '../lib/logs'
import { Card, Button, Field, Input, PageHeader, Modal, Avatar, SectionLabel, Textarea } from '../components/ui'
import { RichEditor } from '../components/RichEditor'
import { ReauthBanner } from '../components/ReauthBanner'
import {
  IconSun,
  IconMoon,
  IconLock,
  IconSync,
  IconDownload,
  IconUpload,
  IconLogout,
  IconReceipt,
  IconCheck,
  IconFolder,
  IconPlus,
  IconTrash,
  IconUsers,
} from '../components/Icons'
import type { Center, Session, DriveRefs } from '../types'
import { newId } from '../lib/format'

function csvCell(v: string | number): string {
  let s = String(v ?? '')
  // guard against CSV formula injection (=, +, -, @)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function Settings() {
  const {
    user,
    online,
    syncing,
    syncNow,
    logout,
    center,
    updateCenter,
    setTheme,
    setPin,
    clearPin,
    students,
    payments,
    postings,
    attendances,
    routines,
    showToast,
    needsReauth,
    teachers,
    saveTeachers,
  } = useApp()

  const [form, setForm] = useState<Center>(center)
  const [saved, setSaved] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [pin, setPinVal] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [hasPin, setHasPin] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [driveRefs, setDriveRefs] = useState<DriveRefs | null>(null)
  const [tName, setTName] = useState('')
  const [tPhone, setTPhone] = useState('')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [logsOpen, setLogsOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const logoRef = useRef<HTMLInputElement>(null)
  const paidRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getKV<DriveRefs>(K.DRIVE)
      .then((d) => d && setDriveRefs(d))
      .catch(() => undefined)
  }, [syncing])

  useEffect(() => {
    setLogs(getLogs())
    return onLogsChange(() => setLogs(getLogs()))
  }, [])

  const period = periodNow()
  const driveRootUrl = driveRefs?.rootFolderId
    ? `https://drive.google.com/drive/folders/${driveRefs.rootFolderId}`
    : undefined

  const saveCenter = async () => {
    await updateCenter({ ...form, name: form.name.trim() || defaultCenter().name })
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
    showToast('Center profile saved', 'ok')
  }

  const confirmPin = async () => {
    if (!/^\d{4}$/.test(pin)) return showToast('PIN must be 4 digits', 'err')
    if (pin !== pinConfirm) return showToast('PINs do not match', 'err')
    await setPin(await hashPin(pin))
    setHasPin(true)
    setPinOpen(false)
    setPin('')
    setPinConfirm('')
    showToast('PIN lock enabled', 'ok')
  }

  const backup = async () => {
    const driveRefs = await getKV(K.DRIVE)
    const data = {
      app: 'paymenttracker',
      version: 1,
      exportedAt: new Date().toISOString(),
      center,
      receiptSeq: (await getKV<number>(K.RECEIPT_SEQ)) || 0,
      driveRefs,
      students: students.map(({ photoBlob: _pb, ...rest }) => rest),
      payments: payments.map(({ pngBlob: _pb, ...rest }) => rest),
      postings,
      attendance: attendances,
      routines: routines,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `paymenttracker-backup-${fmtDate(Date.now()).replace(/ /g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
    showToast('Backup downloaded', 'ok')
  }

  const restore = async (file?: File | null) => {
    if (!file) return
    try {
      const j = JSON.parse(await file.text())
      if (!j.students || !j.payments) throw new Error('Not a PaymentTracker backup')
      await db.transaction('rw', db.students, db.payments, db.outbox, async () => {
        await db.students.clear()
        await db.payments.clear()
        await db.outbox.clear()
        await db.students.bulkPut(j.students)
        await db.payments.bulkPut(j.payments)
      })
      // postings only when the backup carries them - restoring a pre-posting
      // backup must never wipe the live cash-handover ledger
      if (Array.isArray(j.postings)) {
        await db.transaction('rw', db.postings, async () => {
          await db.postings.clear()
          await db.postings.bulkPut(j.postings)
        })
        await queueOp({ kind: 'pushJSON', file: 'postings' })
      }
      // attendance only when the backup carries it - a pre-attendance backup
      // must never wipe live attendance records
      if (Array.isArray(j.attendance)) {
        await db.transaction('rw', db.attendance, async () => {
          await db.attendance.clear()
          await db.attendance.bulkPut(j.attendance)
        })
        await queueOp({ kind: 'pushJSON', file: 'attendance' })
      }
      // routines only when the backup carries it - a pre-routine backup must
      // never wipe live class schedules
      if (Array.isArray(j.routines)) {
        await db.transaction('rw', db.routines, async () => {
          await db.routines.clear()
          await db.routines.bulkPut(j.routines)
        })
        await queueOp({ kind: 'pushJSON', file: 'routines' })
      }
      if (j.center) await setKV(K.CENTER, j.center)
      await setKV(K.RECEIPT_SEQ, j.receiptSeq || 0)
      if (j.driveRefs) await setKV(K.DRIVE, j.driveRefs)
      await queueOp({ kind: 'pushJSON', file: 'students' })
      await queueOp({ kind: 'pushJSON', file: 'payments' })
      await queueOp({ kind: 'pushJSON', file: 'meta' })
      await syncNow()
      setRestoreOpen(false)
      showToast('Backup restored', 'ok')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Restore failed', 'err')
    }
  }

  const exportSheet = async () => {
    try {
      const link = await exportToSheet(students, payments, postings, attendances, center)
      showToast('Google Sheet created', 'ok')
      openExternal(link)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Sheet export failed', 'err')
    }
  }

  const exportCSV = (allMonths: boolean) => {
    const rows: Array<Record<string, string | number>> = []
    for (const p of payments) {
      if (!allMonths && p.period !== period) continue
      const s = students.find((x) => x.id === p.studentId)
      rows.push({
        'Receipt No': p.receiptNo,
        Date: new Date(p.date).toISOString().slice(0, 10),
        Student: s?.name || '',
        Batch: s?.batch || '',
        Phone: s?.phone || '',
        Mode: p.mode,
        Period: p.period,
        Amount: p.amount,
      })
    }
    if (!rows.length) return showToast('No payments to export', 'err')
    const header = Object.keys(rows[0])
    const csv = [
      header.join(','),
      ...rows.map((r) => header.map((h) => csvCell(r[h])).join(',')),
    ].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = allMonths ? `payments-all.csv` : `payments-${period}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showToast('CSV exported', 'ok')
  }

  return (
    <div className="pb-4">
      <PageHeader title="Settings" />

      {needsReauth && (
        <div className="px-4 mb-1">
          <ReauthBanner />
        </div>
      )}

      {/* Account */}
      <SectionLabel>Account</SectionLabel>
      <div className="px-4">
        <Card className="!rounded-2xl p-4 flex items-center gap-3">
          <Avatar src={user?.picture} name={user?.name || 'T'} size={46} />
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-bold text-ink dark:text-white truncate">{user?.name}</div>
            <div className="text-[12.5px] text-muted dark:text-muted-dark truncate">{user?.email}</div>
          </div>
          <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/40 rounded-full px-2.5 py-1">
            {online ? 'Online' : 'Offline'}
          </div>
        </Card>
      </div>

      {/* Sync + shortcuts */}
      <SectionLabel>Quick links</SectionLabel>
      <div className="px-4 space-y-2">
        <button onClick={() => void syncNow(true)} className="w-full text-left">
          <Card className="!rounded-xl p-3.5 flex items-center gap-3 active:scale-[0.99] transition">
            <div className="w-10 h-10 rounded-xl bg-teal/10 dark:bg-teal/20 grid place-items-center shrink-0">
              <IconSync className={`w-5 h-5 text-teal ${syncing ? 'animate-spin' : ''}`} />
            </div>
            <div className="flex-1">
              <div className="text-[14px] font-bold text-ink dark:text-white">Sync with Drive</div>
              <div className="text-[12px] text-muted dark:text-muted-dark">
                {syncing ? 'Syncing…' : online ? 'Push & pull latest data' : 'You are offline'}
              </div>
            </div>
          </Card>
        </button>
        <Link to="/receipt/lookup" className="block">
          <Card className="!rounded-xl p-3.5 flex items-center gap-3 active:scale-[0.99] transition">
            <div className="w-10 h-10 rounded-xl bg-teal/10 dark:bg-teal/20 grid place-items-center shrink-0">
              <IconReceipt className="w-5 h-5 text-teal" />
            </div>
            <div className="flex-1">
              <div className="text-[14px] font-bold text-ink dark:text-white">Find a receipt</div>
              <div className="text-[12px] text-muted dark:text-muted-dark">Search by receipt number</div>
            </div>
          </Card>
        </Link>
        {driveRootUrl && (
          <a href={driveRootUrl} target="_blank" rel="noreferrer" className="block">
            <Card className="!rounded-xl p-3.5 flex items-center gap-3 active:scale-[0.99] transition">
              <div className="w-10 h-10 rounded-xl bg-[#e8f0f7] dark:bg-hover-dark grid place-items-center shrink-0">
                <IconFolder className="w-5 h-5 text-ink dark:text-accent-dark" />
              </div>
              <div className="flex-1">
                <div className="text-[14px] font-bold text-ink dark:text-white">Open Drive folder</div>
                <div className="text-[12px] text-muted dark:text-muted-dark">
                  PaymentTracker folder in your Google Drive
                </div>
              </div>
            </Card>
          </a>
        )}
      </div>

      {/* Center profile */}
      <SectionLabel>Center profile (appears on receipts)</SectionLabel>
      <div className="px-4 space-y-3">
        <Card className="!rounded-2xl p-4 space-y-3">
          {/* Logo */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => logoRef.current?.click()}
              className="w-20 h-20 rounded-2xl overflow-hidden bg-[#e8f0f7] dark:bg-hover-dark grid place-items-center text-ink dark:text-accent-dark border-2 border-dashed border-[#c9d6e0] dark:border-line-dark shrink-0"
            >
              {form.logo ? (
                <img src={form.logo} alt="Receipt logo" className="w-full h-full object-contain p-1.5" />
              ) : (
                <span className="text-[11px] font-semibold px-1 text-center">Add logo</span>
              )}
            </button>
            <input
              ref={logoRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                const r = new FileReader()
                r.onload = () => setForm((p) => ({ ...p, logo: String(r.result || '') }))
                r.readAsDataURL(f)
              }}
            />
            <div className="text-[12px] text-muted dark:text-muted-dark leading-relaxed">
              Receipt logo (PNG/JPG). Shows at the top-left of every receipt.
              {form.logo && (
                <button
                  onClick={() => setForm((p) => ({ ...p, logo: undefined }))}
                  className="block text-[12px] font-semibold text-danger mt-1"
                >
                  Remove logo
                </button>
              )}
            </div>
          </div>

          <Field label="Center name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Tagline">
            <Input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
          </Field>
          <div className="grid grid-cols-1 gap-3">
            <Field label="Address / area" hint="Multi-line - use the toolbar for bold, colors and alignment">
              <RichEditor
                value={form.addressHtml || ''}
                onChange={(html, text) =>
                  setForm((p) => ({ ...p, addressHtml: html || undefined, address: text || '' }))
                }
                placeholder="e.g. House 12, Road 5, Dhanmondi, Dhaka"
              />
            </Field>
            <Field label="Phone" hint="Multi-line - e.g. hotline on the first line, mobile on the second">
              <RichEditor
                value={form.phoneHtml || ''}
                onChange={(html, text) =>
                  setForm((p) => ({ ...p, phoneHtml: html || undefined, phone: text || '' }))
                }
                placeholder="e.g. +880 1234 567890"
              />
            </Field>
          </div>
          <Field label="বিশেষ নিয়মাবলী" hint="Shown at the bottom of every receipt - use the toolbar for bold, colors, sizes and alignment">
            <RichEditor
              value={form.rulesHtml || ''}
              onChange={(html, text) => setForm((p) => ({ ...p, rulesHtml: html || undefined, rules: text || undefined }))}
              placeholder="যেমন: প্রতি মাসে ফি নির্ধারিত সময়ে পরিশোধ করতে হবে। দেরি করলে জরিমানা প্রযোজ্য হবে।"
            />
          </Field>
          {/* PAID stamp image */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => paidRef.current?.click()}
              className="w-20 h-20 rounded-2xl overflow-hidden bg-[#e8f0f7] dark:bg-hover-dark grid place-items-center text-ink dark:text-accent-dark border-2 border-dashed border-[#c9d6e0] dark:border-line-dark shrink-0"
            >
              {form.paidImage ? (
                <img src={form.paidImage} alt="PAID stamp" className="w-full h-full object-contain p-1.5" />
              ) : (
                <span className="text-[11px] font-semibold px-1 text-center">Add PAID image</span>
              )}
            </button>
            <input
              ref={paidRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                const r = new FileReader()
                r.onload = () => setForm((p) => ({ ...p, paidImage: String(r.result || '') }))
                r.readAsDataURL(f)
              }}
            />
            <div className="text-[12px] text-muted dark:text-muted-dark leading-relaxed">
              PAID seal image (PNG with transparency works best). Always printed on receipts at the right of the amount.
              {form.paidImage && (
                <button
                  onClick={() => setForm((p) => ({ ...p, paidImage: undefined }))}
                  className="block text-[12px] font-semibold text-danger mt-1"
                >
                  Reset to default PAID image
                </button>
              )}
            </div>
          </div>
          <Button onClick={() => void saveCenter()} disabled={saved}>
            {saved ? <IconCheck className="w-4 h-4" /> : null} {saved ? 'Saved' : 'Save profile'}
          </Button>
        </Card>
      </div>

      {/* WhatsApp messages */}
      <SectionLabel>Messages (WhatsApp)</SectionLabel>
      <div className="px-4 space-y-3">
        <Card className="!rounded-2xl p-4 space-y-3">
          <Field
            label="Fee reminder message"
            hint="Sent when you press Remind from a student page."
          >
            <Textarea
              value={form.reminderMsg ?? defaultCenter().reminderMsg ?? ''}
              onChange={(e) => setForm({ ...form, reminderMsg: e.target.value })}
              rows={4}
              placeholder={defaultCenter().reminderMsg}
            />
          </Field>
          <Field
            label="Receipt message"
            hint="Sent when sharing a receipt on WhatsApp. {link} becomes the Drive link."
          >
            <Textarea
              value={form.receiptMsg ?? defaultCenter().receiptMsg ?? ''}
              onChange={(e) => setForm({ ...form, receiptMsg: e.target.value })}
              rows={3}
              placeholder={defaultCenter().receiptMsg}
            />
          </Field>
          <Field
            label="Absent student message"
            hint="Sent to absent students from the Attendance page. {date}, {batch}, {routine time} and {routine subjects} are filled in automatically - plan the routine in the Routine panel first."
          >
            <Textarea
              value={form.attendanceMsg ?? defaultCenter().attendanceMsg ?? ''}
              onChange={(e) => setForm({ ...form, attendanceMsg: e.target.value })}
              rows={4}
              placeholder={defaultCenter().attendanceMsg}
            />
          </Field>
          <p className="text-[11.5px] text-faint">
            Available tokens:{" "}
            <span className="font-mono">
              {"{student} {period} {center} {link} {date} {batch} {routine time} {routine subjects}"}
            </span>{" "}
            - leave a field empty to keep the default message.
          </p>
          <Button variant="soft" full onClick={() => void saveCenter()} disabled={saved}>
            {saved ? <IconCheck className="w-4 h-4" /> : null} {saved ? 'Saved' : 'Save messages'}
          </Button>
        </Card>
      </div>

      {/* Teachers (received by) */}
      <SectionLabel>Teachers - received by</SectionLabel>
      <div className="px-4 space-y-2">
        {teachers.map((t) => (
          <Card key={t.id} className="!rounded-xl p-3.5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal/10 dark:bg-teal/20 grid place-items-center text-teal dark:text-teal-bright shrink-0">
              <IconUsers className="w-4.5 h-4.5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-bold text-ink dark:text-white truncate">{t.name}</div>
              {t.phone && (
                <div className="text-[12px] text-muted dark:text-muted-dark truncate">{t.phone}</div>
              )}
            </div>
            <button
              onClick={() => void saveTeachers(teachers.filter((x) => x.id !== t.id))}
              className="text-faint hover:text-danger p-2"
              aria-label={`Remove ${t.name}`}
            >
              <IconTrash className="w-4 h-4" />
            </button>
          </Card>
        ))}
        <Card className="!rounded-xl p-3.5 space-y-2">
          <div className="text-[12.5px] font-semibold text-muted dark:text-muted-dark">
            Add a teacher (name + phone)
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input value={tName} onChange={(e) => setTName(e.target.value)} placeholder="Teacher name" />
            <Input
              value={tPhone}
              onChange={(e) => setTPhone(e.target.value)}
              placeholder="+8801…"
              inputMode="tel"
            />
          </div>
          <Button
            variant="soft"
            full
            onClick={() => {
              if (!tName.trim()) return showToast('Enter a teacher name', 'err')
              void saveTeachers([...teachers, { id: newId(), name: tName.trim(), phone: tPhone.trim() || undefined }])
              setTName('')
              setTPhone('')
              showToast('Teacher added', 'ok')
            }}
          >
            <IconPlus className="w-4 h-4" /> Add teacher
          </Button>
          <p className="text-[11.5px] text-faint">
            Pick a teacher when recording a payment - their name goes on the receipt.
          </p>
        </Card>
      </div>

      {/* Security */}
      <SectionLabel>Security</SectionLabel>
      <div className="px-4 space-y-2">
        <button
          onClick={async () => {
            const s = await getKV<Session>(K.SESSION)
            setHasPin(Boolean(s?.pinHash))
            setPinOpen(true)
          }}
          className="w-full text-left"
        >
          <Card className="!rounded-xl p-3.5 flex items-center gap-3 active:scale-[0.99] transition">
            <div className="w-10 h-10 rounded-xl bg-[#e8f0f7] dark:bg-hover-dark grid place-items-center shrink-0">
              <IconLock className="w-5 h-5 text-ink dark:text-accent-dark" />
            </div>
            <div className="flex-1">
              <div className="text-[14px] font-bold text-ink dark:text-white">App PIN lock</div>
              <div className="text-[12px] text-muted dark:text-muted-dark">
                Protect the app if the phone is lost
              </div>
            </div>
          </Card>
        </button>

        {/* Theme */}
        <div className="flex items-center gap-3 rounded-2xl bg-white dark:bg-card-dark border border-line dark:border-line-dark p-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber/10 grid place-items-center shrink-0">
            <IconSun className="w-5 h-5 text-amber" />
          </div>
          <div className="flex-1">
            <div className="text-[14px] font-bold text-ink dark:text-white">Dark mode</div>
            <div className="text-[12px] text-muted dark:text-muted-dark">Comfortable at night</div>
          </div>
          <button
            onClick={async () => {
              const dark = !document.documentElement.classList.contains('dark')
              await setTheme(dark ? 'dark' : 'light')
            }}
            className="relative w-12 h-7 rounded-full transition bg-line dark:bg-ink-soft shrink-0"
            aria-label="Toggle dark mode"
          >
            <span
              className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${
                document.documentElement.classList.contains('dark') ? 'left-[22px]' : 'left-0.5'
              }`}
            >
              <IconMoon className="w-3.5 h-3.5 text-ink absolute inset-0 m-auto" />
            </span>
          </button>
        </div>
      </div>

      {/* Data */}
      <SectionLabel>Data</SectionLabel>
      <div className="px-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => void backup()}>
          <IconDownload className="w-4 h-4" /> Backup
        </Button>
        <Button variant="secondary" onClick={() => setRestoreOpen(true)}>
          <IconUpload className="w-4 h-4" /> Restore
        </Button>
        <Button variant="secondary" onClick={() => exportCSV(false)}>
          <IconDownload className="w-4 h-4" /> {periodLabel(period)} CSV
        </Button>
        <Button variant="secondary" onClick={() => exportCSV(true)}>
          <IconDownload className="w-4 h-4" /> All CSV
        </Button>
        <Button variant="secondary" onClick={() => void exportSheet()}>
          <IconUpload className="w-4 h-4" /> Google Sheet
        </Button>
      </div>

      <SectionLabel>Session</SectionLabel>
      <div className="px-4">
        <Button variant="danger" full size="lg" onClick={() => void logout()}>
          <IconLogout className="w-5 h-5" /> Sign out
        </Button>
        <p className="text-[11.5px] text-faint mt-3 text-center">
          UTSAHO EDUCARE Payment Tracker · data stored in your Google Drive
        </p>
      </div>

      {/* Logs */}
      <SectionLabel>Logs</SectionLabel>
      <div className="px-4 space-y-2">
        <button onClick={() => setLogsOpen(!logsOpen)} className="w-full text-left">
          <Card className="!rounded-xl p-3.5 flex items-center gap-3 active:scale-[0.99] transition">
            <div className="w-10 h-10 rounded-xl bg-amber/10 dark:bg-amber/20 grid place-items-center shrink-0">
              <span className="text-amber text-[16px] font-bold">{logs.length}</span>
            </div>
            <div className="flex-1">
              <div className="text-[14px] font-bold text-ink dark:text-white">Activity logs</div>
              <div className="text-[12px] text-muted dark:text-muted-dark">
                {logsOpen ? 'Tap to collapse' : `${logs.length} entries - tap to expand`}
              </div>
            </div>
          </Card>
        </button>
        {logsOpen && (
          <Card className="!rounded-xl p-3 space-y-1 max-h-64 overflow-y-auto">
            {logs.length === 0 && (
              <div className="text-[12px] text-muted dark:text-muted-dark py-4 text-center">No logs yet</div>
            )}
            {logs.slice().reverse().map((l) => (
              <div key={l.id} className="text-[11px] font-mono leading-relaxed border-b border-line dark:border-line-dark last:border-0 pb-1">
                <span className="text-faint">{new Date(l.time).toLocaleTimeString()}</span>{' '}
                <span className={
                  l.level === 'error' ? 'text-danger font-bold' :
                  l.level === 'warn' ? 'text-amber' :
                  l.level === 'sync' ? 'text-teal' : 'text-muted'
                }>[{l.level}]</span>{' '}
                <span className="text-ink dark:text-white">{l.msg}</span>
                {l.detail && <span className="text-faint"> ({l.detail})</span>}
              </div>
            ))}
          </Card>
        )}
        {logs.length > 0 && logsOpen && (
          <Button variant="secondary" full onClick={() => { clearLogs(); setLogs([]) }}>
            <IconTrash className="w-4 h-4" /> Clear logs
          </Button>
        )}
      </div>

      {/* PIN modal */}
      <Modal open={pinOpen} onClose={() => setPinOpen(false)} title="App PIN lock">
        <div className="space-y-3">
          <Field label={hasPin ? 'Change PIN (4 digits)' : 'Set a 4-digit PIN'}>
            <Input
              value={pin}
              onChange={(e) => setPinVal(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              placeholder="••••"
              className="!text-[20px] tracking-[0.5em] text-center"
            />
          </Field>
          <Field label="Confirm PIN">
            <Input
              value={pinConfirm}
              onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              placeholder="••••"
              className="!text-[20px] tracking-[0.5em] text-center"
            />
          </Field>
          <Button full onClick={() => void confirmPin()}>
            <IconLock className="w-4 h-4" /> Enable lock
          </Button>
          {hasPin && (
            <Button
              variant="secondary"
              full
              onClick={async () => {
                await clearPin()
                setPinOpen(false)
                setPin('')
                setPinConfirm('')
                showToast('PIN lock disabled', 'ok')
              }}
            >
              Disable PIN lock
            </Button>
          )}
        </div>
      </Modal>

      {/* Restore modal */}
      <Modal open={restoreOpen} onClose={() => setRestoreOpen(false)} title="Restore backup">
        <p className="text-[13.5px] text-muted dark:text-muted-dark leading-relaxed">
          Restoring replaces all current students and receipts with the backup. Make sure you're
          synced before continuing.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => void restore(e.target.files?.[0])}
        />
        <Button full className="mt-4" onClick={() => fileRef.current?.click()}>
          <IconUpload className="w-4 h-4" /> Choose backup file
        </Button>
      </Modal>
    </div>
  )
}
