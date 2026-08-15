import { useState } from 'react'
import { useApp } from '../state/AppContext'
import { postingLedger, postingTotal, readyToPost, totalAllTime } from '../lib/ledger'
import { fmtTaka, fmtDate } from '../lib/format'
import { Card, Button, Modal, Field, Input, Select, EmptyState, cx } from './ui'
import { IconPlus, IconBook } from './Icons'
import type { Posting, ReceivedBy } from '../types'

/** Local-timezone YYYY-MM-DD (toISOString would be UTC and can shift a day in +6). */
const isoDay = (ms: number): string => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

interface Draft {
  amount: string
  date: string
  receivedBy: string // teacher id, '' = None
}

export function PostingPanel() {
  const { payments, postings, teachers, addPosting, updatePosting, deletePosting, showToast } =
    useApp()
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>({ amount: '', date: isoDay(Date.now()), receivedBy: '' })
  const [busy, setBusy] = useState(false)

  const collected = totalAllTime(payments)
  const posted = postingTotal(postings)
  const ready = readyToPost(payments, postings)
  const rows = postingLedger(payments, postings)

  const openNew = () => {
    setEditingId(null)
    setDraft({
      amount: ready > 0 ? String(Math.round(ready)) : '',
      date: isoDay(Date.now()),
      receivedBy: '',
    })
    setOpen(true)
  }

  const openEdit = (p: Posting) => {
    setEditingId(p.id)
    setDraft({
      amount: String(p.amount),
      date: isoDay(p.date),
      receivedBy: teachers.find((t) => t.name === p.receivedBy?.name)?.id || '',
    })
    setOpen(true)
  }

  const save = async () => {
    const amount = Number(draft.amount)
    if (!amount || !isFinite(amount) || amount <= 0) {
      showToast('Enter a valid amount', 'err')
      return
    }
    if (!draft.date) {
      showToast('Pick the handover date', 'err')
      return
    }
    let receivedBy: ReceivedBy | undefined
    if (draft.receivedBy) {
      const t = teachers.find((x) => x.id === draft.receivedBy)
      receivedBy = t ? { name: t.name, phone: t.phone } : undefined
    } else if (editingId) {
      // no teacher picked - keep the original attribution when that teacher
      // was later removed from the list, so the record never loses its name
      const orig = postings.find((x) => x.id === editingId)
      if (orig?.receivedBy) receivedBy = orig.receivedBy
    }
    const date = new Date(draft.date + 'T00:00:00').getTime()
    setBusy(true)
    try {
      if (editingId) {
        await updatePosting(editingId, { amount, receivedBy, date })
        showToast('Posting updated', 'ok')
      } else {
        if (amount > ready) {
          showToast('More than the current in-hand balance - check the amount', 'info')
        }
        await addPosting({ amount, receivedBy, date })
        showToast('Posting recorded', 'ok')
      }
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async () => {
    if (!editingId) return
    if (!window.confirm('Delete this posting? The in-hand balance will increase by this amount.'))
      return
    await deletePosting(editingId)
    setOpen(false)
    showToast('Posting deleted', 'ok')
  }

  return (
    <div className="px-4 mt-3 space-y-3">
      {/* Collected - left side, big; posted total on the right */}
      <Card className="!rounded-xl p-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-faint">Collected (all time)</div>
            <div className="text-[24px] font-bold text-ink dark:text-white tabular-nums leading-tight">
              {fmtTaka(collected)}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[11px] uppercase tracking-wider text-faint">Posted</div>
            <div className="text-[16px] font-bold text-muted dark:text-muted-dark tabular-nums">
              {fmtTaka(posted)}
            </div>
          </div>
        </div>
      </Card>

      <Button full size="lg" onClick={openNew}>
        <IconPlus className="w-5 h-5" /> New posting
      </Button>

      {rows.length === 0 ? (
        <Card className="!rounded-2xl">
          <EmptyState
            icon={<IconBook className="w-7 h-7" />}
            title="No postings yet"
            subtitle="Record cash handovers here - each posting subtracts from the collected amount."
          />
        </Card>
      ) : (
        <Card className="!rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_1fr] gap-x-2 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-faint border-b border-line dark:border-line-dark">
            <div>Date Received</div>
            <div className="text-right w-[80px]">Received Amount</div>
            <div className="text-right w-[72px]">Balance</div>
            <div className="text-right">Received By</div>
          </div>
          <div className="max-h-[46dvh] overflow-y-auto">
            {rows.map(({ posting, ledger }) => (
              <button
                key={posting.id}
                onClick={() => openEdit(posting)}
                className="w-full text-left grid grid-cols-[1fr_auto_auto_1fr] gap-x-2 px-3 py-2.5 border-b border-line/60 dark:border-line-dark/60 last:border-0 hover:bg-cream dark:hover:bg-input-dark transition"
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-ink dark:text-white">
                    {fmtDate(posting.date)}
                  </div>
                </div>
                <div className="text-right w-[80px] text-[12.5px] font-bold text-ink dark:text-white tabular-nums pt-0.5">
                  {fmtTaka(posting.amount)}
                </div>
                <div
                  className={cx(
                    'text-right w-[72px] text-[12.5px] font-bold tabular-nums pt-0.5',
                    ledger < 0 ? 'text-danger' : 'text-teal dark:text-teal-bright',
                  )}
                >
                  {fmtTaka(ledger)}
                </div>
                <div className="text-right min-w-0">
                  <span className="block text-[12.5px] font-semibold text-ink dark:text-white">
                    {posting.receivedBy?.name || 'None'}
                  </span>
                </div>
              </button>
            ))}
          </div>
          <div className="px-3 py-2.5 bg-cream dark:bg-input-dark border-t border-line dark:border-line-dark flex items-center justify-between gap-3">
            <div className="text-[12px] font-semibold text-muted dark:text-muted-dark">
              Ready for Posting
            </div>
            <div
              className={cx(
                'text-[15px] font-bold tabular-nums',
                ready < 0 ? 'text-danger' : 'text-teal dark:text-teal-bright',
              )}
            >
              {fmtTaka(ready)}
            </div>
          </div>
        </Card>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editingId ? 'Edit posting' : 'New posting'}
      >
        <div className="space-y-4">
          <Field label="Amount (৳)" hint="Cash handed over - the Ledger subtracts this automatically.">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              value={draft.amount}
              onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
              placeholder="0"
              autoFocus
            />
          </Field>
          <Field label="Date Received">
            <Input
              type="date"
              value={draft.date}
              onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
            />
          </Field>
          <Field label="Received by" hint="Who took the cash - can be changed later.">
            <Select
              value={draft.receivedBy}
              onChange={(e) => setDraft((d) => ({ ...d, receivedBy: e.target.value }))}
            >
              <option value="">None</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex gap-2 pt-1">
            {editingId && (
              <Button variant="danger" onClick={() => void onDelete()} disabled={busy}>
                Delete
              </Button>
            )}
            <Button full onClick={() => void save()} disabled={busy}>
              {busy ? 'Saving…' : editingId ? 'Save changes' : 'Record posting'}
            </Button>
          </div>
          {!editingId && (
            <div className="text-[12px] text-muted dark:text-muted-dark leading-relaxed">
              In hand now: <span className="font-bold tabular-nums">{fmtTaka(ready)}</span>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}