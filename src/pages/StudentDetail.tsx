import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import { studentPeriodPaid, studentPeriodPaidAny } from '../lib/ledger'
import { fmtTaka, periodNow, periodLabel, fmtDate } from '../lib/format'
import { getKV, K } from '../lib/db'
import { getToken } from '../lib/token'
import { Card, Button, Modal, EmptyState, SectionLabel, PageHeader } from '../components/ui'
import { StudentForm, type FormValue } from '../components/StudentForm'
import {
  IconEdit,
  IconTrash,
  IconWhatsApp,
  IconFolder,
  IconReceipt,
  IconArchive,
} from '../components/Icons'
import { defaultCenter } from '../lib/sync'

function waLink(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, '')
  let intl = digits
  if (digits.startsWith('0')) intl = '88' + digits
  if (!intl.startsWith('88')) intl = '880' + digits.replace(/^88/, '')
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`
}

export function StudentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const {
    students,
    payments,
    center,
    updateStudent,
    archiveStudent,
    deleteStudent,
    deletePayment,
    showToast,
  } = useApp()

  const student = students.find((s) => s.id === id)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const period = periodNow()

  // lazy-load photo from Drive when missing
  useEffect(() => {
    if (!student || student.photoBlob || !student.photoFileId) return
    let alive = true
    ;(async () => {
      const drive = await getKV(K.DRIVE)
      if (!drive) return
      const token = getToken()
      if (!token) return
      try {
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files/${student.photoFileId}?alt=media`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (res.ok && alive) {
          const blob = await res.blob()
          await updateStudent(student.id, { photoBlob: blob })
        }
      } catch {
        /* offline */
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student?.id, student?.photoBlob, student?.photoFileId])

  const history = useMemo(
    () =>
      payments
        .filter((p) => p.studentId === id)
        .sort((a, b) => b.date - a.date || b.receiptNo - a.receiptNo),
    [payments, id],
  )

  if (!student) {
    return (
      <div>
        <PageHeader title="Student" back onBack={() => navigate(-1)} />
        <EmptyState
          icon={<IconReceipt className="w-7 h-7" />}
          title="Student not found"
          action={
            <Button variant="secondary" onClick={() => navigate('/students')}>
              Back to students
            </Button>
          }
        />
      </div>
    )
  }

  const paid = studentPeriodPaid(payments, student.id, period)
  const paidAny = studentPeriodPaidAny(payments, student.id, period)
  const due = Math.max(0, student.defaultFee - paid)
  const centerName = center.name || defaultCenter().name

  const onEdit = async (v: FormValue) => {
    setBusy(true)
    try {
      await updateStudent(student.id, {
        name: v.name,
        email: v.email,
        phone: v.phone,
        batch: v.batch,
        defaultFee: v.defaultFee ? Number(v.defaultFee) : 0,
        notes: v.notes,
        ...(v.photo ? { photoBlob: v.photo } : {}),
      })
      setEditOpen(false)
      showToast('Student updated', 'ok')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Update failed', 'err')
    } finally {
      setBusy(false)
    }
  }

  const reminderText = `Assalamu alaikum ${student.name},\n\nThis is a friendly reminder that your ${periodLabel(period)} fee is pending for ${centerName}. Please make the payment at your earliest convenience. Thank you!`

  const deleteAll = async () => {
    setBusy(true)
    try {
      await deleteStudent(student.id)
      showToast(`${student.name} removed`, 'ok')
      navigate('/students')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Delete failed', 'err')
      setBusy(false)
    }
  }

  const onDeletePayment = async (paymentId: string) => {
    await deletePayment(paymentId)
    showToast('Receipt deleted', 'ok')
  }

  return (
    <div>
      <PageHeader
        title="Student"
        subtitle={student.batch || 'No batch'}
        back
        onBack={() => navigate(-1)}
        right={
          <Button variant="soft" onClick={() => setEditOpen(true)} className="!px-3 !py-2">
            <IconEdit className="w-4 h-4" /> Edit
          </Button>
        }
      />

      {/* Profile */}
      <Card className="mx-4 !rounded-2xl p-4">
        <div className="flex items-center gap-4">
          {student.photoBlob ? (
            <img
              src={URL.createObjectURL(student.photoBlob)}
              alt=""
              className="w-16 h-16 rounded-2xl object-cover"
            />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-[#12314f] dark:bg-[#2b5a86] grid place-items-center text-white text-[22px] font-bold">
              {student.name
                .split(' ')
                .slice(0, 2)
                .map((x) => x[0])
                .join('')
                .toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[18px] font-bold text-[#12314f] dark:text-white truncate flex items-center gap-2">
              {student.name}
              {student.archived && (
                <span className="text-[10px] font-semibold text-[#8a8578] border border-[#d8d3c8] rounded px-1">archived</span>
              )}
            </div>
            <div className="text-[13px] text-[#8a8578] dark:text-[#93a7bb] truncate">
              {student.email || 'no email set'}
            </div>
            {student.phone && (
              <div className="text-[13px] text-[#8a8578] dark:text-[#93a7bb]">{student.phone}</div>
            )}
          </div>
        </div>

        {/* Dues status */}
        <div className="mt-4 rounded-xl bg-[#faf8f2] dark:bg-[#0f1822] border border-[#e8e3d9] dark:border-[#253546] p-3.5">
          <div className="flex items-center justify-between">
            <div className="text-[12px] font-semibold text-[#8a8578] dark:text-[#93a7bb]">
              {periodLabel(period)}
            </div>
            <div
              className={`text-[13px] font-bold px-2.5 py-1 rounded-full ${
                due === 0 && (student.defaultFee > 0 || paidAny)
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : 'bg-red-50 text-red-600 dark:bg-red-900/40 dark:text-red-300'
              }`}
            >
              {due === 0 && (student.defaultFee > 0 || paidAny) ? 'Paid' : `Due ${fmtTaka(due)}`}
            </div>
          </div>
          <div className="text-[20px] font-bold text-[#12314f] dark:text-white mt-1 tabular-nums">
            {fmtTaka(paid)}
            {student.defaultFee > 0 && (
              <span className="text-[14px] font-semibold text-[#a29b8d]"> / {fmtTaka(student.defaultFee)}</span>
            )}
          </div>
        </div>

        {student.notes && (
          <div className="mt-3 text-[13px] text-[#5c6b7a] dark:text-[#b8c6d4] bg-[#faf8f2] dark:bg-[#0f1822] rounded-lg px-3 py-2">
            {student.notes}
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2 mt-4">
          <Button onClick={() => navigate(`/payment/${student.id}`)} className="!py-3">
            <IconReceipt className="w-4.5 h-4.5" /> Record payment
          </Button>
          {student.phone ? (
            <Button
              variant="secondary"
              className="!py-3 text-[#0f766e] dark:text-[#34c1b8]"
              onClick={() => window.open(waLink(student.phone!, reminderText), '_blank')}
            >
              <IconWhatsApp className="w-4.5 h-4.5" /> Remind
            </Button>
          ) : (
            <Button variant="secondary" className="!py-3 opacity-50" disabled title="Add a phone number to send WhatsApp reminders">
              <IconWhatsApp className="w-4.5 h-4.5" /> Remind
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#f0ece2] dark:border-[#253546]">
          <button
            onClick={() => void archiveStudent(student.id, !student.archived)}
            className="flex items-center gap-1.5 text-[13px] font-semibold text-[#3d4c5c] dark:text-[#b8c6d4]"
          >
            <IconArchive className="w-4 h-4" /> {student.archived ? 'Unarchive' : 'Archive'}
          </button>
          {student.folderId && (
            <a
              href={`https://drive.google.com/drive/folders/${student.folderId}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-[13px] font-semibold text-[#0f766e] dark:text-[#34c1b8]"
            >
              <IconFolder className="w-4 h-4" /> Open folder
            </a>
          )}
          <button
            onClick={() => setDeleteOpen(true)}
            className="flex items-center gap-1.5 text-[13px] font-semibold text-red-600"
          >
            <IconTrash className="w-4 h-4" /> Delete
          </button>
        </div>
      </Card>

      {/* History */}
      <SectionLabel>Receipt history · {history.length}</SectionLabel>
      <div className="px-4 space-y-2">
        {history.length === 0 && (
          <Card className="!rounded-2xl">
            <EmptyState
              icon={<IconReceipt className="w-7 h-7" />}
              title="No receipts yet"
              subtitle="Record a payment to generate the first receipt."
            />
          </Card>
        )}
        {history.map((p) => (
          <Card key={p.id} className="!rounded-xl p-3.5">
            <div className="flex items-center gap-3">
              <Link to={`/receipt/${p.id}`} className="flex-1 min-w-0 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#e8f0f7] dark:bg-[#1d3144] grid place-items-center text-[#12314f] dark:text-[#cfe2f4] text-[12px] font-bold shrink-0">
                  #{String(p.receiptNo).padStart(4, '0')}
                </div>
                <div className="min-w-0">
                  <div className="text-[14px] font-bold text-[#12314f] dark:text-white tabular-nums">
                    {fmtTaka(p.amount)}
                    <span className="text-[12px] font-semibold text-[#8a8578] ml-2">{p.mode}</span>
                  </div>
                  <div className="text-[12px] text-[#8a8578] dark:text-[#93a7bb] truncate">
                    {periodLabel(p.period)} · {fmtDate(p.date)}
                  </div>
                </div>
              </Link>
              <button
                onClick={() => navigate(`/payment/${student.id}?prefill=${p.id}`)}
                className="text-[12px] font-semibold text-[#0f766e] dark:text-[#34c1b8] whitespace-nowrap"
                title="Record again with same amount"
              >
                Re-record
              </button>
              <button
                onClick={() => void onDeletePayment(p.id)}
                className="text-[#a29b8d] hover:text-red-600 p-1"
                title="Delete receipt"
              >
                <IconTrash className="w-4 h-4" />
              </button>
            </div>
          </Card>
        ))}
      </div>

      {/* Edit modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit student">
        <StudentForm
          initial={student}
          submitLabel={busy ? 'Saving…' : 'Save changes'}
          onSubmit={(v) => void onEdit(v)}
          onCancel={() => setEditOpen(false)}
        />
      </Modal>

      {/* Delete confirm */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete student?">
        <p className="text-[14px] text-[#5c6b7a] dark:text-[#b8c6d4] leading-relaxed">
          This removes <b>{student.name}</b>, all {history.length} receipts, and their Drive folder
          permanently. This cannot be undone.
        </p>
        <div className="flex gap-2 mt-5">
          <Button variant="danger" full onClick={() => void deleteAll()} disabled={busy}>
            <IconTrash className="w-4 h-4" /> Delete permanently
          </Button>
          <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  )
}
