import { useEffect, useRef, useState } from 'react'
import type { Student } from '../types'
import { Field, Input, Textarea, Button } from './ui'

export interface FormValue {
  name: string
  phone: string
  phone2: string
  batch: string
  defaultFee: string
  realPayment: string
  commission: string
  notes: string
  photo: Blob | null
}

export function initialForm(s?: Student): FormValue {
  return {
    name: s?.name || '',
    phone: s?.phone || '',
    phone2: s?.phone2 || '',
    batch: s?.batch || '',
    defaultFee: s?.defaultFee ? String(s.defaultFee) : '',
    realPayment: s?.realPayment ? String(s.realPayment) : '',
    commission: s?.commission ? String(s.commission) : '',
    notes: s?.notes || '',
    photo: null,
  }
}

export function StudentForm({
  initial,
  submitLabel = 'Save student',
  onSubmit,
  onCancel,
  batches = [],
}: {
  initial?: Student
  submitLabel?: string
  onSubmit: (v: FormValue) => void
  onCancel?: () => void
  batches?: string[]
}) {
  const [f, setF] = useState<FormValue>(initialForm(initial))
  const [newBatch, setNewBatch] = useState('')
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
    const fee = f.defaultFee.trim() ? Number(f.defaultFee) : 0
    if (Number.isNaN(fee) || fee < 0) return setErr('Fee must be a number')
    if (f.realPayment.trim() && (Number.isNaN(Number(f.realPayment)) || Number(f.realPayment) < 0)) {
      return setErr('Real payment must be a number')
    }
    if (f.commission.trim() && (Number.isNaN(Number(f.commission)) || Number(f.commission) < 0)) {
      return setErr('Commission must be a number')
    }
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

      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone (WhatsApp)">
          <Input
            value={f.phone}
            onChange={(e) => set('phone', e.target.value)}
            placeholder="+8801…"
            inputMode="tel"
          />
        </Field>
        <Field label="Alt number (Call)">
          <Input
            value={f.phone2}
            onChange={(e) => set('phone2', e.target.value)}
            placeholder="+8801…"
            inputMode="tel"
          />
        </Field>
      </div>

      {batches.length > 0 ? (
        <div>
          <div className="text-[12.5px] font-semibold text-body/80 dark:text-muted-dark mb-1.5">
            Batch / Class
          </div>
          <div className="flex flex-wrap gap-1.5">
            {batches.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => {
                  setNewBatch('')
                  set('batch', b)
                }}
                className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors ${
                  f.batch === b && !newBatch
                    ? 'bg-ink text-white border-ink'
                    : 'bg-white dark:bg-card-dark text-body/70 dark:text-muted-dark border-line dark:border-line-dark hover:border-ink'
                }`}
              >
                {b}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setNewBatch(f.batch)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border border-dashed transition-colors ${
                newBatch !== ''
                  ? 'bg-ink text-white border-ink'
                  : 'bg-white dark:bg-card-dark text-muted dark:text-muted-dark border-line dark:border-line-dark hover:border-ink hover:text-ink'
              }`}
            >
              + New batch
            </button>
          </div>
          {(newBatch !== '' || !batches.includes(f.batch)) && (
            <Input
              className="mt-2"
              value={newBatch !== '' ? newBatch : f.batch}
              onChange={(e) => {
                setNewBatch(e.target.value)
                set('batch', e.target.value)
              }}
              placeholder="Type a new batch name"
            />
          )}
        </div>
      ) : (
        <Field label="Batch / Class">
          <Input value={f.batch} onChange={(e) => set('batch', e.target.value)} placeholder="Batch 2026" />
        </Field>
      )}

      <div className="w-1/2">
        <Field label="Default fee (৳)">
          <Input
            value={f.defaultFee}
            onChange={(e) => set('defaultFee', e.target.value)}
            inputMode="numeric"
            placeholder="e.g. 1500"
          />
        </Field>
      </div>

      <div className="w-1/2">
        <Field label="Real Payment (৳)">
          <Input
            value={f.realPayment}
            onChange={(e) => set('realPayment', e.target.value)}
            inputMode="numeric"
            placeholder="Same as fee"
          />
          <div className="text-[11.5px] text-muted dark:text-muted-dark mt-1">
            Optional · teacher only · never printed on the receipt.
          </div>
        </Field>
      </div>

      <div className="w-1/2">
        <Field label="Commission (৳)">
          <Input
            value={f.commission}
            onChange={(e) => set('commission', e.target.value)}
            inputMode="numeric"
            placeholder="0"
          />
          <div className="text-[11.5px] text-muted dark:text-muted-dark mt-1">
            Optional · teacher's share · the center's balance = real payment − commission.
          </div>
        </Field>
      </div>

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
