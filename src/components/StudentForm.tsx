import { useEffect, useRef, useState } from 'react'
import type { Student } from '../types'
import { Field, Input, Textarea, Button } from './ui'

export interface FormValue {
  name: string
  email: string
  phone: string
  batch: string
  defaultFee: string
  notes: string
  photo: Blob | null
}

export function initialForm(s?: Student): FormValue {
  return {
    name: s?.name || '',
    email: s?.email || '',
    phone: s?.phone || '',
    batch: s?.batch || '',
    defaultFee: s?.defaultFee ? String(s.defaultFee) : '',
    notes: s?.notes || '',
    photo: null,
  }
}

export function StudentForm({
  initial,
  submitLabel = 'Save student',
  onSubmit,
  onCancel,
}: {
  initial?: Student
  submitLabel?: string
  onSubmit: (v: FormValue) => void
  onCancel?: () => void
}) {
  const [f, setF] = useState<FormValue>(initialForm(initial))
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const previewUrl = useRef<string | null>(null)
  const [preview, setPreview] = useState<string | null>(
    initial?.photoBlob ? (previewUrl.current = URL.createObjectURL(initial.photoBlob), previewUrl.current) : null,
  )

  useEffect(() => {
    return () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    }
  }, [])

  const set = <K extends keyof FormValue>(k: K, v: FormValue[K]) => setF((p) => ({ ...p, [k]: v }))

  const pickPhoto = (file?: File | null) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    const blob = file
    set('photo', blob)
    previewUrl.current = URL.createObjectURL(blob)
    setPreview(previewUrl.current)
  }

  const submit = () => {
    if (!f.name.trim()) return setErr('Student name is required')
    if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim()))
      return setErr('Enter a valid email, or leave it blank')
    const fee = f.defaultFee.trim() ? Number(f.defaultFee) : 0
    if (Number.isNaN(fee) || fee < 0) return setErr('Fee must be a number')
    setErr('')
    onSubmit(f)
  }

  return (
    <div className="space-y-4">
      {/* Photo */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-20 h-20 rounded-2xl overflow-hidden bg-[#e8f0f7] dark:bg-hover-dark grid place-items-center text-ink dark:text-accent-dark border-2 border-dashed border-[#c9d6e0] dark:border-line-dark"
        >
          {preview ? (
            <img src={preview} alt="Student" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[11px] font-semibold px-1 text-center">Add photo</span>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => pickPhoto(e.target.files?.[0])}
        />
        <div className="text-[12px] text-muted dark:text-muted-dark leading-relaxed">
          Optional photo. It's stored privately in the student's Drive folder.
        </div>
      </div>

      <Field label="Student name *">
        <Input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Rafi Ahmed" />
      </Field>

      <Field label="Google email (for sharing)" hint="Student gets view-only access to their receipts">
        <Input
          value={f.email}
          onChange={(e) => set('email', e.target.value)}
          placeholder="student@gmail.com"
          autoCapitalize="off"
          autoCorrect="off"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone (WhatsApp)">
          <Input
            value={f.phone}
            onChange={(e) => set('phone', e.target.value)}
            placeholder="+8801…"
            inputMode="tel"
          />
        </Field>
        <Field label="Batch / Class">
          <Input value={f.batch} onChange={(e) => set('batch', e.target.value)} placeholder="Batch 2026" />
        </Field>
      </div>

      <Field label="Default monthly fee (৳)" hint="Used to pre-fill payment amounts">
        <Input
          value={f.defaultFee}
          onChange={(e) => set('defaultFee', e.target.value)}
          inputMode="numeric"
          placeholder="e.g. 1500"
        />
      </Field>

      <Field label="Notes">
        <Textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Guardian, reminders, anything…" />
      </Field>

      {err && <div className="text-[12.5px] text-red-600 font-medium">{err}</div>}

      <div className="flex gap-2 pt-1">
        <Button full size="lg" onClick={submit}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button variant="secondary" size="lg" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}
