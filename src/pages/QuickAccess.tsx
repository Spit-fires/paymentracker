import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import { newId, fmtDate } from '../lib/format'
import { openExternal } from '../lib/phone'
import type { QuickCard } from '../types'
import { Card, PageHeader, EmptyState, Button, Modal, Input, Field, Spinner, cx } from '../components/ui'
import { RichEditor } from '../components/RichEditor'
import { IconPlus, IconLink, IconNote, IconEdit } from '../components/Icons'

/** typed URL without a protocol gets https:// prepended */
function normalizeUrl(raw: string): string {
  const v = raw.trim()
  if (!v) return ''
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`
}

export function QuickAccess() {
  const { quickCards, saveQuickCard, deleteQuickCard, showToast } = useApp()
  const navigate = useNavigate()

  const sorted = useMemo(
    () => [...quickCards].sort((a, b) => b.createdAt - a.createdAt),
    [quickCards],
  )

  // add/edit form
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<QuickCard | undefined>()
  const [kind, setKind] = useState<'note' | 'link'>('note')
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  // note editor
  const [noteCard, setNoteCard] = useState<QuickCard | undefined>()
  const [noteHtml, setNoteHtml] = useState('')
  const [noteBusy, setNoteBusy] = useState(false)

  const openCard = (c: QuickCard) => {
    if (c.kind === 'link') {
      if (c.url) openExternal(c.url)
      else showToast('This card has no link', 'err')
      return
    }
    setNoteHtml(c.noteHtml || '')
    setNoteCard(c)
  }

  const openAdd = () => {
    setEditing(undefined)
    setKind('note')
    setTitle('')
    setDesc('')
    setUrl('')
    setConfirmDel(false)
    setFormOpen(true)
  }

  const openEdit = (c: QuickCard) => {
    setEditing(c)
    setKind(c.kind)
    setTitle(c.title)
    setDesc(c.desc || '')
    setUrl(c.url || '')
    setConfirmDel(false)
    setFormOpen(true)
  }

  const submitForm = async () => {
    if (!title.trim()) return showToast('Enter a title', 'err')
    if (kind === 'link' && !normalizeUrl(url)) return showToast('Enter a link (e.g. https://…)', 'err')
    setBusy(true)
    try {
      await saveQuickCard({
        id: editing?.id || newId(),
        kind,
        title: title.trim(),
        desc: desc.trim() || undefined,
        // switching a card's kind keeps its hidden note text so flipping back restores it
        url: kind === 'link' ? normalizeUrl(url) : undefined,
        noteHtml: editing?.noteHtml,
        createdAt: editing?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      })
      showToast(editing ? 'Card updated' : 'Card added', 'ok')
      setFormOpen(false)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not save card', 'err')
    } finally {
      setBusy(false)
    }
  }

  const saveNote = async () => {
    if (!noteCard) return
    setNoteBusy(true)
    try {
      await saveQuickCard({ ...noteCard, noteHtml })
      showToast('Note saved', 'ok')
      setNoteCard(undefined)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not save note', 'err')
    } finally {
      setNoteBusy(false)
    }
  }

  const removeCard = async () => {
    if (!editing) return
    if (!confirmDel) return setConfirmDel(true)
    await deleteQuickCard(editing.id)
    showToast('Card deleted', 'ok')
    setFormOpen(false)
  }

  return (
    <div className="pb-4">
      <PageHeader
        title="Quick Access"
        subtitle="Notes and links you use often"
        back
        onBack={() => navigate(-1)}
        right={
          <button
            onClick={openAdd}
            className="w-10 h-10 shrink-0 grid place-items-center rounded-full bg-ink text-white dark:bg-ink-soft active:scale-95 transition"
            aria-label="Add card"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        }
      />

      {sorted.length === 0 ? (
        <Card className="mx-4 !rounded-2xl">
          <EmptyState
            icon={<IconNote className="w-7 h-7" />}
            title="No cards yet"
            subtitle="Add a link shortcut or a rich-text note - they sync across your devices."
            action={
              <Button onClick={openAdd}>
                <IconPlus className="w-4 h-4" /> Add a card
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="px-4 space-y-2">
          {sorted.map((c) => (
            <Card key={c.id} className="!rounded-xl p-3.5 flex items-center gap-3">
              <div
                className={cx(
                  'w-10 h-10 rounded-xl grid place-items-center shrink-0',
                  c.kind === 'link'
                    ? 'bg-[#e8f0f7] dark:bg-hover-dark text-ink dark:text-accent-dark'
                    : 'bg-teal/10 dark:bg-teal/20 text-teal',
                )}
              >
                {c.kind === 'link' ? <IconLink className="w-5 h-5" /> : <IconNote className="w-5 h-5" />}
              </div>
              <button className="flex-1 min-w-0 text-left" onClick={() => openCard(c)}>
                <div className="text-[14.5px] font-bold text-ink dark:text-white truncate">{c.title}</div>
                <div className="text-[12px] text-muted dark:text-muted-dark truncate">
                  {c.desc?.trim() || (c.kind === 'link' ? c.url : 'Rich text note')}
                </div>
                <div className="text-[10.5px] text-faint mt-0.5">Added {fmtDate(c.createdAt)}</div>
              </button>
              <button
                onClick={() => openEdit(c)}
                className="w-9 h-9 grid place-items-center rounded-lg text-faint hover:text-teal active:scale-90 transition shrink-0"
                aria-label="Edit card"
              >
                <IconEdit className="w-4.5 h-4.5" />
              </button>
            </Card>
          ))}
        </div>
      )}

      {/* Add / edit card */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Edit card' : 'New card'}>
        <div className="space-y-3">
          <div className="flex rounded-xl bg-[#eef2f6] dark:bg-input-dark p-1">
            {(['note', 'link'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={cx(
                  'flex-1 rounded-lg py-2.5 text-[13.5px] font-bold transition flex items-center justify-center gap-1.5',
                  kind === k
                    ? 'bg-white dark:bg-card-dark text-ink dark:text-white shadow-sm'
                    : 'text-muted dark:text-muted-dark',
                )}
              >
                {k === 'note' ? <IconNote className="w-4 h-4" /> : <IconLink className="w-4 h-4" />}
                {k === 'note' ? 'Note' : 'Link'}
              </button>
            ))}
          </div>

          <Field label="Title *">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. SSAC portal, Routine plan…"
              maxLength={60}
            />
          </Field>
          <Field label="Short description" hint="Shown under the title on the card.">
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optional - one line about it" maxLength={120} />
          </Field>
          {kind === 'link' && (
            <Field label="Link URL" hint="Opens in the browser when tapped.">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" inputMode="url" />
            </Field>
          )}
          {kind === 'note' && (
            <p className="text-[12px] text-muted dark:text-muted-dark">
              Notes are written after saving - tap the card to open the rich-text editor.
            </p>
          )}

          <Button full onClick={() => void submitForm()} disabled={busy}>
            {busy ? <Spinner className="text-white" /> : null} {editing ? 'Save changes' : 'Add card'}
          </Button>
          {editing && (
            <button
              onClick={() => void removeCard()}
              className={cx(
                'w-full text-[13px] font-semibold py-2 rounded-xl transition',
                confirmDel ? 'bg-danger/10 text-danger' : 'text-muted dark:text-muted-dark',
              )}
            >
              {confirmDel ? 'Tap again to delete' : 'Delete card'}
            </button>
          )}
        </div>
      </Modal>

      {/* Note editor */}
      <Modal open={!!noteCard} onClose={() => setNoteCard(undefined)} title={noteCard?.title}>
        <RichEditor value={noteHtml} onChange={(html) => setNoteHtml(html)} placeholder="Write your note…" />
        <Button full className="mt-3" onClick={() => void saveNote()} disabled={noteBusy}>
          {noteBusy ? <Spinner className="text-white" /> : null} {noteBusy ? 'Saving…' : 'Save note'}
        </Button>
      </Modal>
    </div>
  )
}
