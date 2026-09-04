import type { Routine } from '../types'

/** 'HH:MM' 24h picker value -> 12h label, e.g. '14:00' -> '2:00 PM' */
export function fmtTime12(v?: string): string {
  if (!v) return ''
  const [h, m] = v.split(':').map(Number)
  if (isNaN(h) || h < 0 || h > 23) return v
  const suffix = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m ?? 0).padStart(2, '0')} ${suffix}`
}

/** Value for the {time} token - one class time, or boys+girls stacked on
 *  separate lines in the same message when the times are split. */
export function routineTimeLabel(r: Routine): string {
  if (!r.timeSplit) return fmtTime12(r.timeStart)
  const boys = fmtTime12(r.timeStart)
  const girls = fmtTime12(r.timeGirlsStart)
  return [boys && `Boys: ${boys}`, girls && `Girls: ${girls}`].filter(Boolean).join('\n')
}

/** Value for the {subjects} token - one subject per line. */
export function routineSubjectsLabel(r: Routine): string {
  return (r.subjectList || []).join('\n')
}

/** Value for the {note} token. */
export function routineNote(r: Routine): string {
  return r.note?.trim() || ''
}

/** True when the record was created/edited with the structured builder. */
export function hasBuilderFields(r: Routine): boolean {
  return !!(r.timeStart || r.timeGirlsStart || r.subjectList?.length || r.note?.trim())
}

/** Human-readable block for the routine list: time / subjects / note lines.
 *  Legacy free-form records (text only) fall back to their original text. */
export function routineBlock(r: Routine): string {
  if (r.text?.trim() && !hasBuilderFields(r)) return r.text
  const lines = [
    routineTimeLabel(r) && `Time: ${routineTimeLabel(r)}`,
    routineSubjectsLabel(r) && `Subjects: ${routineSubjectsLabel(r)}`,
    routineNote(r),
  ].filter(Boolean)
  return lines.join('\n')
}

/** A routine counts as set when it has ANY sendable content - legacy text
 *  records or builder records. Used by next-routine lookups. */
export function routineHasContent(r: Routine): boolean {
  return !!(r.text?.trim() || hasBuilderFields(r))
}
