import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import { studentPeriodBalance, studentBalanceFee, studentPeriodPaidAny } from '../lib/ledger'
import { fmtTaka, periodNow, periodLabel, fmtDate, fillMessage } from '../lib/format'
import { getKV, K, db } from '../lib/db'
import { getToken } from '../lib/token'
import { Card, Button, Modal, EmptyState, SectionLabel, PageHeader, useBlobUrl } from '../components/ui'
import { StudentForm, type FormValue } from '../components/StudentForm'
import {
  IconEdit,
  IconTrash,
  IconWhatsApp,
  IconFolder,
  IconReceipt,
  IconArchive,
  IconPhone,
} from '../components/Icons'
import { defaultCenter } from '../lib/sync'
import { waLink, waPhone } from '../lib/phone'

export function StudentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const {
    students,
    payments,
    center,
    refreshData,
    updateStudent,
    archiveStudent,
    deleteStudent,
    deletePayment,
    showToast,
  } = useApp()

  const student = students.find((s) => s.id === id)
  const photoUrl = useBlobUrl(student?.photoBlob)
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
          // write straight to IndexedDB — no outbox ops, no re-upload
          await db.students.update(student.id, { photoBlob: blob })
          await refreshData()
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

  const paid = studentPeriodBalance(payments, student.id, period)
  const paidAny = studentPeriodPaidAny(payments, student.id, period)
  const fee = studentBalanceFee(student)
  const due = Math.max(0, fee - paid)
  const centerName = center.name || defaultCenter().name

  const onEdit = async (v: FormValue) => {
    setBusy(true)
    try {
      await updateStudent(student.id, {
        name: v.name,
        phone: v.phone,
        phone2: v.phone2,
        batch: v.batch,
        defaultFee: v.defaultFee ? Number(v.defaultFee) : 0,
        realPayment: v.realPayment.trim() ? Number(v.realPayment) : undefined,
        commission: v.commission.trim() ? Number(v.commission) : undefined,
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

  const reminderText = fillMessage(center.reminderMsg || defaultCenter().reminderMsg || '', {
    student: student.name,
    period: periodLabel(period),
    center: centerName,
  })

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

  const allPaid = due === 0 && (fee > 0 || paidAny)

  return (
    <div>
      <PageHeader
        title="Student"
        subtitle={student.batch || 'No batch'}
        back
        onBack={() => navigate(-1)}
        right={
          <Button variant="soft" onClick={() => setEditOpen(true)} className="!px-3.5">
            <IconEdit className="w-4 h-4" /> Edit
          </Button>
        }
      />

      {/* Profile */}
      <Card className="mx-4 !rounded-2xl p-4">
        <div className="flex items-center gap-4">
          {photoUrl ? (
            <img src={photoUrl} alt="" className="w-16 h-16 rounded-2xl object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-ink dark:bg-ink-soft grid place-items-center text-white text-[22px] font-bold shrink-0">
              {student.name
                .split(' ')
                .slice(0, 2)
                .map((x) => x[0])
                .join('')
                .toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[18px] font-bold text-ink dark:text-white truncate flex items-center gap-2">
              {student.name}
              {student.archived && (
                <span className="text-[10px] font-semibold text-muted border border-line dark:border-line-dark rounded px-1">
                  archived
                </span>
              )}
            </div>
            <div className="text-[13px] text-muted dark:text-muted-dark truncate">
              {[student.phone, student.phone2].filter(Boolean).join(' · ') || 'no phone set'}
            </div>
          </div>
        </div>

        {/* Dues status */}
        <div className="mt-4 rounded-xl bg-[#faf8f2] dark:bg-input-dark border border-line dark:border-line-dark p-3.5">
          <div className="flex items-center justify-between">
            <div className="text-[12px] font-semibold text-muted dark:text-muted-dark">
              {periodLabel(period)}
            </div>
            <div
              className={`text-[13px] font-bold px-2.5 py-1 rounded-full ${
                allPaid
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : 'bg-red-50 text-red-600 dark:bg-red-900/40 dark:text-red-300'
              }`}
            >
              {allPaid ? 'Paid' : `Due ${fmtTaka(due)}`}
            </div>
          </div>
          <div className="text-[20px] font-bold text-ink dark:text-white mt-1 tabular-nums">
            {fmtTaka(paid)}
            {fee > 0 && (
              <span className="text-[14px] font-semibold text-faint"> / {fmtTaka(fee)}</span>
            )}
          </div>
        </div>

        {student.notes && (
          <div className="mt-3 text-[13px] text-muted dark:text-muted-dark bg-[#faf8f2] dark:bg-input-dark rounded-lg px-3 py-2">
            {student.notes}
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2 mt-4">
          <Button size="lg" onClick={() => navigate(`/payment/${student.id}`)}>
            <IconReceipt className="w-5 h-5" /> Record payment
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="!text-teal dark:!text-teal-bright"
            onClick={() => window.open(waLink(student.phone, reminderText), '_blank')}
            disabled={!student.phone}
            title={student.phone ? undefined : 'Add a phone number to send WhatsApp reminders'}
          >
            <IconWhatsApp className="w-4.5 h-4.5" /> Remind
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => window.open(`tel:${waPhone(student.phone2 || student.phone || '')}`, '_self')}
            disabled={!student.phone && !student.phone2}
            title="Call the student's number"
          >
            <IconPhone className="w-4.5 h-4.5" /> Call
          </Button>
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-line dark:border-line-dark">
          <button
            onClick={() => void archiveStudent(student.id, !student.archived)}
            className="flex items-center gap-1.5 text-[13px] font-semibold text-muted dark:text-muted-dark px-1 py-1"
          >
            <IconArchive className="w-4 h-4" /> {student.archived ? 'Unarchive' : 'Archive'}
          </button>
          {student.folderId && (
            <a
              href={`https://drive.google.com/drive/folders/${student.folderId}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-[13px] font-semibold text-teal dark:text-teal-bright px-1 py-1"
            >
              <IconFolder className="w-4 h-4" /> Open folder
            </a>
          )}
          <button
            onClick={() => setDeleteOpen(true)}
            className="flex items-center gap-1.5 text-[13px] font-semibold text-danger px-1 py-1"
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
                <div className="w-9 h-9 rounded-lg bg-[#e8f0f7] dark:bg-hover-dark grid place-items-center text-ink dark:text-accent-dark text-[12px] font-bold shrink-0">
                  #{String(p.receiptNo).padStart(4, '0')}
                </div>
                <div className="min-w-0">
                  <div className="text-[14px] font-bold text-ink dark:text-white tabular-nums">
                    {fmtTaka(p.amount)}
                    <span className="text-[12px] font-semibold text-muted ml-2">{p.mode}</span>
                  </div>
                  <div className="text-[12px] text-muted dark:text-muted-dark truncate">
                    {periodLabel(p.period)} · {fmtDate(p.date)}
                  </div>
                </div>
              </Link>
              <button
                onClick={() => navigate(`/payment/${student.id}?prefill=${p.id}`)}
                className="text-[12px] font-semibold text-teal dark:text-teal-bright whitespace-nowrap px-2 py-1.5"
                title="Edit this receipt (keeps its number and date)"
              >
                Re-record
              </button>
              <button
                onClick={() => void onDeletePayment(p.id)}
                className="text-faint hover:text-danger p-2"
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
          batches={Array.from(new Set(students.map((s) => s.batch))).filter(Boolean).sort()}
          submitLabel={busy ? 'Saving…' : 'Save changes'}
          onSubmit={(v) => void onEdit(v)}
          onCancel={() => setEditOpen(false)}
        />
      </Modal>

      {/* Delete confirm */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete student?">
        <p className="text-[14px] text-muted dark:text-muted-dark leading-relaxed">
          This removes <b className="text-body dark:text-white">{student.name}</b>, all {history.length}{' '}
          receipts, and their Drive folder permanently. This cannot be undone.
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
