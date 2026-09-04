import { useMemo, useState } from 'react'
import { useApp } from '../state/AppContext'
import { dayKey } from '../lib/format'
import { routineBlock, hasBuilderFields } from '../lib/routine'
import type { Routine } from '../types'
import { Card, PageHeader, Button, Field, Input, Textarea, EmptyState, cx } from '../components/ui'
import { IconClock, IconTrash, IconEdit, IconCheck, IconPlus } from '../components/Icons'

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

/** tapping anywhere on a time field opens the native picker - without this
 *  only the clock icon opens it and the rest of the field is just typing */
function openPicker(e: React.MouseEvent<HTMLInputElement>) {
  const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void }
  try {
    el.showPicker?.()
  } catch {
    /* unsupported browser - falls back to focus + typing */
  }
}

export function Routines() {
  const { students, routines, subjects, addSubject, saveRoutine, deleteRoutine, showToast } = useApp()
  const [day, setDay] = useState(tomorrowKey())
  const [batch, setBatch] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // builder fields
  const [timeSplit, setTimeSplit] = useState(false)
  const [timeStart, setTimeStart] = useState('')
  const [timeGirlsStart, setTimeGirlsStart] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [addingSubject, setAddingSubject] = useState(false)
  const [newSubject, setNewSubject] = useState('')

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

  const resetForm = () => {
    setEditing(null)
    setBatch('')
    setTimeSplit(false)
    setTimeStart('')
    setTimeGirlsStart('')
    setPicked([])
    setNote('')
    setAddingSubject(false)
    setNewSubject('')
  }

  const startEdit = (r: Routine) => {
    setEditing(r.id)
    setBatch(r.batch)
    setTimeSplit(!!r.timeSplit)
    setTimeStart(r.timeStart || '')
    setTimeGirlsStart(r.timeGirlsStart || '')
    setPicked(r.subjectList ? [...r.subjectList] : [])
    // legacy free-form routines keep their text alive through the note field
    setNote(r.text?.trim() && !hasBuilderFields(r) ? r.text : r.note || '')
    setAddingSubject(false)
    setNewSubject('')
  }

  const save = async () => {
    if (!day) return showToast('Pick a date first', 'err')
    if (!batch) return showToast('Pick a batch first', 'err')
    setSaving(true)
    try {
      await saveRoutine({
        day,
        batch,
        timeStart: timeStart || undefined,
        timeGirlsStart: timeSplit ? timeGirlsStart || undefined : undefined,
        timeSplit,
        subjectList: picked.length ? [...picked] : undefined,
        note: note || undefined,
      })
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

  const pickSubject = (s: string) => {
    setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]))
  }

  const submitNewSubject = async () => {
    const v = newSubject.trim()
    if (!v) return
    await addSubject(v)
    setPicked((p) => (p.some((x) => x.toLowerCase() === v.toLowerCase()) ? p : [...p, v]))
    setNewSubject('')
    setAddingSubject(false)
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

          {/* Class time */}
          <Field label="Class time">
            {timeSplit ? (
              <div className="space-y-2">
                <div className="grid grid-cols-[auto_1fr] items-center gap-2">
                  <span className="text-[12px] font-bold text-muted dark:text-muted-dark w-10">Boys</span>
                  <Input type="time" value={timeStart} onClick={openPicker} onChange={(e) => setTimeStart(e.target.value)} />
                </div>
                <div className="grid grid-cols-[auto_1fr] items-center gap-2">
                  <span className="text-[12px] font-bold text-muted dark:text-muted-dark w-10">Girls</span>
                  <Input type="time" value={timeGirlsStart} onClick={openPicker} onChange={(e) => setTimeGirlsStart(e.target.value)} />
                </div>
              </div>
            ) : (
              <Input type="time" value={timeStart} onClick={openPicker} onChange={(e) => setTimeStart(e.target.value)} />
            )}
          </Field>

          {/* Boys/girls split toggle */}
          <div className="flex rounded-xl bg-[#eef2f6] dark:bg-input-dark p-1">
            <button
              onClick={() => setTimeSplit(false)}
              className={cx(
                'flex-1 rounded-lg py-2 text-[12.5px] font-bold transition',
                !timeSplit
                  ? 'bg-white dark:bg-card-dark text-ink dark:text-white shadow-sm'
                  : 'text-muted dark:text-muted-dark',
              )}
            >
              Same time for all
            </button>
            <button
              onClick={() => setTimeSplit(true)}
              className={cx(
                'flex-1 rounded-lg py-2 text-[12.5px] font-bold transition',
                timeSplit
                  ? 'bg-white dark:bg-card-dark text-ink dark:text-white shadow-sm'
                  : 'text-muted dark:text-muted-dark',
              )}
            >
              Boys & girls separate
            </button>
          </div>

          {/* Subjects */}
          <Field label="Subjects" hint="Tap to select - new subjects are saved for future routines.">
            {subjects.length === 0 && !addingSubject && !picked.length ? (
              <button
                onClick={() => setAddingSubject(true)}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-teal/40 text-teal text-[13px] font-semibold py-2.5 active:scale-[0.99] transition"
              >
                <IconPlus className="w-3.5 h-3.5" /> Add a subject
              </button>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {[...subjects]
                  .sort((a, b) => a.localeCompare(b))
                  .map((s) => {
                    const on = picked.includes(s)
                    return (
                      <button
                        key={s}
                        onClick={() => pickSubject(s)}
                        className={cx(
                          'px-3 py-1.5 rounded-full text-[12.5px] font-bold transition active:scale-[0.97] flex items-center gap-1',
                          on
                            ? 'bg-teal text-white'
                            : 'bg-white dark:bg-card-dark border border-line dark:border-line-dark text-muted dark:text-muted-dark',
                        )}
                      >
                        {on && <IconCheck className="w-3 h-3" />}
                        {s}
                      </button>
                    )
                  })}
                {picked
                  .filter((s) => !subjects.includes(s))
                  .map((s) => (
                    <button
                      key={s}
                      onClick={() => pickSubject(s)}
                      className="px-3 py-1.5 rounded-full text-[12.5px] font-bold bg-teal text-white flex items-center gap-1"
                    >
                      <IconCheck className="w-3 h-3" />
                      {s}
                    </button>
                  ))}
                {addingSubject ? (
                  <div className="flex items-center gap-1.5 w-full">
                    <Input
                      value={newSubject}
                      onChange={(e) => setNewSubject(e.target.value)}
                      placeholder="Subject name"
                      maxLength={40}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void submitNewSubject()
                      }}
                    />
                    <Button onClick={() => void submitNewSubject()} disabled={!newSubject.trim()}>
                      Add
                    </Button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingSubject(true)}
                    className="px-3 py-1.5 rounded-full text-[12.5px] font-semibold border border-dashed border-teal/40 text-teal flex items-center gap-1"
                  >
                    <IconPlus className="w-3 h-3" /> Add
                  </button>
                )}
              </div>
            )}
          </Field>

          {/* Optional note */}
          <Field label="Note" hint="Optional - anything else the class should know.">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional…" rows={2} />
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
                    {routineBlock(r) && (
                      <div className="text-[12px] text-muted dark:text-muted-dark whitespace-pre-line leading-snug line-clamp-2">
                        {routineBlock(r)}
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
              subtitle="Pick a batch and save a routine - {time}, {subjects} and {note} then fill themselves into the routine WhatsApp message."
            />
          </Card>
        )}
      </div>
    </div>
  )
}
