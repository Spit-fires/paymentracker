import { useEffect, useRef, useState } from 'react'
import Quill from 'quill'
import 'quill/dist/quill.snow.css'

export function sanitizeHtml(html: string): string {
  return html || ''
}

interface Props {
  value?: string
  onChange: (html: string, text: string) => void
  placeholder?: string
}

const COLORS = [
  { label: 'Default', value: '' },
  { label: 'Black', value: '#1c2936' },
  { label: 'Navy', value: '#12314f' },
  { label: 'Red', value: '#b23b3b' },
  { label: 'Green', value: '#15803d' },
  { label: 'Gold', value: '#b98a2f' },
  { label: 'Teal', value: '#0d9488' },
]

export function RichEditor({ value, onChange, placeholder }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const quillRef = useRef<Quill | null>(null)
  const lastHtml = useRef<string>(value || '')
  const [active, setActive] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const editorEl = editorRef.current
    if (!editorEl || quillRef.current) return

    // size as style — must register before Quill instance
    const Size = Quill.import('attributors/style/size') as { whitelist: string[] }
    Size.whitelist = ['12px', '14px', '16px', '18px', '20px', '24px']
    Quill.register(Size as never, true)

    const quill = new Quill(editorEl, {
      theme: 'snow',
      placeholder: placeholder || 'Type something...',
      modules: {
        toolbar: false,
        history: { delay: 500, maxStack: 100, userOnly: true },
      },
      formats: ['bold', 'italic', 'underline', 'strike', 'color', 'size', 'list'],
    })

    if (value) {
      quill.clipboard.dangerouslyPasteHTML(value)
      lastHtml.current = quill.root.innerHTML
    }

    const updateActive = () => {
      const fmt = quill.getFormat()
      setActive({
        bold: !!fmt.bold,
        italic: !!fmt.italic,
        underline: !!fmt.underline,
        strike: !!fmt.strike,
        bullet: fmt.list === 'bullet',
        ordered: fmt.list === 'ordered',
      })
    }

    quill.on('text-change', () => {
      updateActive()
      const html = quill.root.innerHTML
      const isEmpty = html === '<p><br></p>' || !quill.getText().trim()
      const out = isEmpty ? '' : html
      if (out !== lastHtml.current) {
        lastHtml.current = out
        onChange(out, quill.getText())
      }
    })
    quill.on('selection-change', updateActive)

    quillRef.current = quill
    updateActive()

    return () => {
      quillRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const quill = quillRef.current
    if (!quill) return
    const next = value || ''
    if (next !== lastHtml.current && next !== quill.root.innerHTML) {
      if (document.activeElement && quill.root.contains(document.activeElement)) return
      lastHtml.current = next
      if (!next) quill.setText('')
      else quill.clipboard.dangerouslyPasteHTML(next)
    }
  }, [value])

  const fmt = (name: string, val?: unknown) => {
    const q = quillRef.current
    if (!q) return
    q.focus()
    const cur = q.getFormat()[name as keyof ReturnType<Quill['getFormat']>]
    q.format(name, (val ?? !cur) as never)
  }

  const btnCls = (on: boolean) =>
    `min-w-8 h-8 px-1.5 rounded-lg text-[13px] font-bold grid place-items-center border ${on ? 'bg-ink text-white border-ink' : 'bg-white dark:bg-card-dark text-body/70 dark:text-muted-dark border-line dark:border-line-dark'}`

  return (
    <div ref={containerRef} className="rounded-xl border border-line dark:border-line-dark bg-white dark:bg-card-dark overflow-visible">
      {/* Custom toolbar — native controls, never clipped, never auto-close */}
      <div className="flex flex-wrap gap-1.5 items-center p-1.5 bg-cream dark:bg-input-dark border-b border-line dark:border-line-dark rounded-t-xl">
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => fmt('bold')} className={btnCls(!!active.bold)} title="Bold">B</button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => fmt('italic')} className={btnCls(!!active.italic)} title="Italic">I</button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => fmt('underline')} className={btnCls(!!active.underline)} title="Underline">U</button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => fmt('strike')} className={btnCls(!!active.strike)} title="Strike">S</button>

        <span className="w-px h-6 bg-line dark:bg-line-dark mx-1" />

        <select
          defaultValue=""
          onChange={(e) => {
            const v = e.target.value
            fmt('size', v || false)
            e.target.value = ''
          }}
          className="h-8 rounded-lg bg-white dark:bg-card-dark border border-line dark:border-line-dark px-2 text-[13px] font-semibold"
          title="Size"
        >
          <option value="" disabled>Size</option>
          <option value="12px">12</option>
          <option value="14px">14</option>
          <option value="16px">16</option>
          <option value="18px">18</option>
          <option value="20px">20</option>
          <option value="24px">24</option>
        </select>

        <select
          defaultValue=""
          onChange={(e) => {
            const v = e.target.value
            fmt('color', v || false)
            e.target.value = ''
          }}
          className="h-8 rounded-lg bg-white dark:bg-card-dark border border-line dark:border-line-dark px-2 text-[13px] font-semibold"
          title="Color"
        >
          {COLORS.map((c) => (
            <option key={c.label} value={c.value}>{c.label}</option>
          ))}
        </select>

        <span className="w-px h-6 bg-line dark:bg-line-dark mx-1" />

        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => fmt('list', active.bullet ? false : 'bullet')} className={btnCls(!!active.bullet)} title="Bullet">•≡</button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => fmt('list', active.ordered ? false : 'ordered')} className={btnCls(!!active.ordered)} title="Ordered">1≡</button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const q = quillRef.current
            if (!q) return
            q.focus()
            const range = q.getSelection()
            if (range) q.removeFormat(range.index, range.length)
          }}
          className={btnCls(false)}
          title="Clear"
        >
          ⌫
        </button>
      </div>

      <div ref={editorRef} className="[&_.ql-editor]:!min-h-[96px] [&_.ql-editor]:!max-h-64 [&_.ql-editor]:!overflow-y-auto [&_.ql-editor]:!px-3 [&_.ql-editor]:!py-2.5 [&_.ql-editor]:!text-[14px] [&_.ql-editor]:!leading-[1.45] [&_.ql-container]:!border-0" />
    </div>
  )
}
