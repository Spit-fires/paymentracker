import type { Routine } from '../types'

/** 'HH:MM' 24h picker value -> 12h label, e.g. '14:00' -> '3:00 PM' */
export function fmtTime12(v?: string): string {
  if (!v) return ''
  const [h, m] = v.split(':').map(Number)
  if (isNaN(h) || h < 0 || h > 23) return v
  const suffix = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m ?? 0).padStart(2, '0')} ${suffix}`
}

function rangeLabel(start?: string, end?: string): string {
  if (!start && !end) return ''
  if (start && end) return `${fmtTime12(start)} - ${fmtTime12(end)}`
  return fmtTime12(start || end || '')
}

/** Value for the {time} token - one class time, or boys+girls in the same
 *  message when the times are split. */
export function routineTimeLabel(r: Routine): string {
  if (!r.timeSplit) return rangeLabel(r.timeStart, r.timeEnd)
  const boys = rangeLabel(r.timeStart, r.timeEnd)
  const girls = rangeLabel(r.timeGirlsStart, r.timeGirlsEnd)
  return [boys && `Boys: ${boys}`, girls && `Girls: ${girls}`].filter(Boolean).join(' · ')
}

/** Value for the {subjects} token - comma-joined selected subjects. */
export function routineSubjectsLabel(r: Routine): string {
  return (r.subjectList || []).join(', ')
}

/** Value for the {note} token. */
export function routineNote(r: Routine): string {
  return r.note?.trim() || ''
}

/** Human-readable block for the routine list: time / subjects / note lines.
 *  Legacy free-form records (text only) fall back to their original text. */
export function routineBlock(r: Routine): string {
  if (r.text?.trim() && !hasBuilderFields(r)) return r.text
  const lines = [
    timePart(r),
    subjectsPart(r),
    routineNote(r),
  ].filter(Boolean)
  return lines.join('\n')
}

function timePart(r: Routine): string {
  const t = routineTimeLabel(r)
  return t ? `Time: ${t}` : ''
}

function subjectsPart(r: Routine): string {
  const s = routineSubjectsLabel(r)
  return s ? `Subjects: ${s}` : ''
}

/** True when the record was created/edited with the structured builder. */
export function hasBuilderFields(r: Routine): boolean {
  return !!(r.timeStart || r.timeEnd || r.timeGirlsStart || r.timeGirlsEnd || r.subjectList?.length || r.note?.trim())
}

/** A routine counts as set when it has ANY sendable content - legacy text
 *  records or builder records. Used by next-routine lookups. */
export function routineHasContent(r: Routine): boolean {
  return !!(r.text?.trim() || hasBuilderFields(r))
}
