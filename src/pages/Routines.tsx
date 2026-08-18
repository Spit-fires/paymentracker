import { useMemo, useState } from 'react'
import { useApp } from '../state/AppContext'
import { dayKey } from '../lib/format'
import { Card, PageHeader, Button, Field, Input, Textarea, EmptyState, cx } from '../components/ui'
import { IconClock, IconTrash, IconEdit, IconCheck } from '../components/Icons'

/** tomorrow's local day key - routines are planned the evening before */
function tomorrowKey(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return dayKey(d)
}

function fmtDay(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

/** merged text for a routine, falling back to the legacy time/subjects fields */
function routineText(r: { text?: string; time?: string; subjects?: string }): string {
  return r.text || [r.time, r.subjects].filter(Boolean).join('\n')
}

export function Routines() {
  const { students, routines, saveRoutine, deleteRoutine, showToast } = useApp()
  const [day, setDay] = useState(tomorrowKey())
  const [batch, setBatch] = useState('')
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const batches = useMemo(
    () => Array.from(new Set(students.map((s) => s.batch))).filter(Boolean).sort(),
    [students],
  )

  // routines already saved for the selected day, newest edit first
  const dayRows = useMemo(
    () =>
      routines
        .filter((r) => r.day === day)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    [routines, day],
  )

  const startEdit = (r: (typeof dayRows)[number]) => {
    setEditing(r.id)
    setBatch(r.batch)
    setText(routineText(r))
  }

  const resetForm = () => {
    setEditing(null)
    setBatch('')
    setText('')
  }

  const save = async () => {
    if (!day) return showToast('Pick a date first', 'err')
    if (!batch) return showToast('Pick a batch first', 'err')
    setSaving(true)
    try {
      await saveRoutine({ day, batch, text })
      showToast(editing ? 'Routine updated' : 'Routine saved', 'ok')
      resetForm()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not save routine', 'err')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    await deleteRoutine(id)
    if (editing === id) resetForm()
    showToast('Routine removed', 'ok')
  }

  return (
    <div className="pb-4">
      <PageHeader title="Routine" subtitle="Plan the class routine for each day" />

      <div className="px-4 space-y-3">
        {/* Planner card */}
        <Card className="!rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            </div>
            <div className="text-[11.5px] text-muted dark:text-muted-dark shrink-0">
              {day === tomorrowKey() ? 'Tomorrow' : fmtDay(day)}
            </div>
          </div>

          <div>
            <div className="text-[12.5px] font-semibold text-body/80 dark:text-muted-dark mb-1.5">
              Batch / Class
            </div>
            {batches.length === 0 ? (
              <div className="text-[12.5px] text-muted dark:text-muted-dark">
                Add students to a batch first, then routines show up here.
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {batches.map((b) => (
                  <button
                    key={b}
                    onClick={() => setBatch(batch === b ? '' : b)}
                    className={cx(
                      'px-3.5 py-2 rounded-full text-[13px] font-bold transition active:scale-[0.97]',
                      batch === b
                        ? 'bg-ink text-white dark:bg-accent-dark dark:text-ink'
                        : 'bg-white dark:bg-card-dark border border-line dark:border-line-dark text-muted dark:text-muted-dark',
                    )}
                  >
                    {b}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Field label="Routine">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'e.g. 3:00 PM - 5:00 PM\nMathematics, English, Science'}
              rows={4}
            />
          </Field>

          <div className="flex gap-2 pt-1">
            <Button full size="lg" onClick={() => void save()} disabled={saving || !batch || !day}>
              {saving ? 'Saving…' : editing ? 'Update routine' : 'Save routine'}
            </Button>
            {editing && (
              <Button variant="secondary" size="lg" onClick={resetForm}>
                Cancel
              </Button>
            )}
          </div>
        </Card>

        {/* Saved routines for the day */}
        {dayRows.length > 0 && (
          <div>
            <div className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-muted dark:text-muted-dark px-1 pt-1 pb-2">
              {fmtDay(day)} · {dayRows.length} routine{dayRows.length > 1 ? 's' : ''}
            </div>
            <div className="space-y-2">
              {dayRows.map((r) => (
                <Card key={r.id} className="!rounded-xl p-3.5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-teal/10 dark:bg-teal/20 grid place-items-center shrink-0">
                    <IconClock className="w-4.5 h-4.5 text-teal dark:text-teal-bright" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-bold text-ink dark:text-white truncate">{r.batch}</div>
                    {routineText(r) && (
                      <div className="text-[12px] text-muted dark:text-muted-dark whitespace-pre-line leading-snug line-clamp-2">
                        {routineText(r)}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => startEdit(r)}
                    aria-label={`Edit routine for ${r.batch}`}
                    className="w-9 h-9 rounded-xl border border-line dark:border-line-dark grid place-items-center text-muted dark:text-muted-dark active:scale-95 transition"
                  >
                    <IconEdit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => void remove(r.id)}
                    aria-label={`Remove routine for ${r.batch}`}
                    className="w-9 h-9 rounded-xl border border-line dark:border-line-dark grid place-items-center text-faint dark:text-[#5f7a92] active:scale-95 transition"
                  >
                    <IconTrash className="w-4 h-4" />
                  </button>
                </Card>
              ))}
            </div>
          </div>
        )}

        {dayRows.length === 0 && (
          <Card className="!rounded-2xl">
            <EmptyState
              icon={<IconCheck className="w-7 h-7" />}
              title="Nothing planned for this day"
              subtitle="Pick a batch and save a routine - {routine} then fills itself into the absent-student WhatsApp message."
            />
          </Card>
        )}
      </div>
    </div>
  )
}