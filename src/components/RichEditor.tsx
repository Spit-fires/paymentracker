import { useEffect, useRef } from 'react'
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

export function RichEditor({ value, onChange, placeholder }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const quillRef = useRef<Quill | null>(null)
  const lastHtml = useRef<string>(value || '')

  useEffect(() => {
    const container = containerRef.current
    if (!container || quillRef.current) return

    const editorEl = document.createElement('div')
    container.appendChild(editorEl)

    const quill = new Quill(editorEl, {
      theme: 'snow',
      placeholder: placeholder || 'Type something...',
      modules: {
        toolbar: [
          ['bold', 'italic', 'underline', 'strike'],
          [{ color: [] }, { size: ['small', false, 'large', 'huge'] }],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['clean'],
        ],
      },
    })

    if (value) {
      quill.clipboard.dangerouslyPasteHTML(value)
      lastHtml.current = quill.root.innerHTML
    }

    quill.on('text-change', () => {
      const html = quill.root.innerHTML
      const isEmpty = html === '<p><br></p>' || !quill.getText().trim()
      const out = isEmpty ? '' : html
      if (out !== lastHtml.current) {
        lastHtml.current = out
        onChange(out, quill.getText())
      }
    })

    quillRef.current = quill

    return () => {
      quillRef.current = null
      container.innerHTML = ''
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

  return (
    <div
      ref={containerRef}
      className="rounded-xl border border-line dark:border-line-dark bg-white dark:bg-card-dark overflow-visible [&_.ql-toolbar]:!bg-cream [&_.ql-toolbar]:dark:!bg-input-dark [&_.ql-toolbar]:!border-line [&_.ql-toolbar]:dark:!border-line-dark [&_.ql-toolbar]:!border-t-0 [&_.ql-toolbar]:!border-x-0 [&_.ql-toolbar]:!rounded-t-xl [&_.ql-container]:!border-0 [&_.ql-container]:!rounded-b-xl [&_.ql-editor]:!min-h-[96px] [&_.ql-editor]:!max-h-64 [&_.ql-editor]:!overflow-y-auto [&_.ql-editor]:!px-3 [&_.ql-editor]:!py-2.5 [&_.ql-editor]:!text-[14px] [&_.ql-editor]:!leading-[1.45] [&_.ql-picker-options]:!z-20"
    />
  )
}
