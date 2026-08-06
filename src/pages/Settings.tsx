import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import { db, setKV, queueOp, K, getKV } from '../lib/db'
import { hashPin } from '../lib/pin'
import { periodNow, periodLabel, fmtDate } from '../lib/format'
import { defaultCenter } from '../lib/sync'
import { Card, Button, Field, Input, PageHeader, Modal, Avatar, SectionLabel } from '../components/ui'
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
} from '../components/Icons'
import type { Center, Session, DriveRefs } from '../types'

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
    showToast,
  } = useApp()

  const [form, setForm] = useState<Center>(center)
  const [saved, setSaved] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [pin, setPinVal] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [hasPin, setHasPin] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [driveRefs, setDriveRefs] = useState<DriveRefs | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getKV<DriveRefs>(K.DRIVE)
      .then((d) => d && setDriveRefs(d))
      .catch(() => undefined)
  }, [syncing])

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
      receiptSeq: (await db.kv.get(K.RECEIPT_SEQ))?.value || 0,
      driveRefs,
      students: students.map(({ photoBlob: _pb, ...rest }) => rest),
      payments: payments.map(({ pngBlob: _pb, ...rest }) => rest),
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
      await db.transaction('rw', db.students, db.payments, db.kv, db.outbox, async () => {
        await db.students.clear()
        await db.payments.clear()
        await db.outbox.clear()
        await db.students.bulkPut(j.students)
        await db.payments.bulkPut(j.payments)
        if (j.center) await setKV(K.CENTER, j.center)
        await setKV(K.RECEIPT_SEQ, j.receiptSeq || 0)
        if (j.driveRefs) await setKV(K.DRIVE, j.driveRefs)
      })
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
        <button onClick={() => void syncNow()} className="w-full text-left">
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
          <Field label="Center name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Tagline">
            <Input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Address / area">
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" />
            </Field>
          </div>
          <Button onClick={() => void saveCenter()} disabled={saved}>
            {saved ? <IconCheck className="w-4 h-4" /> : null} {saved ? 'Saved' : 'Save profile'}
          </Button>
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
      </div>

      <SectionLabel>Session</SectionLabel>
      <div className="px-4">
        <Button variant="danger" full size="lg" onClick={() => void logout()}>
          <IconLogout className="w-5 h-5" /> Sign out
        </Button>
        <p className="text-[11.5px] text-faint mt-3 text-center">
          Utshaho Educare Payment Tracker · data stored in your Google Drive
        </p>
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
