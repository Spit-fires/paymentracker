// Quill 2.0 — battle-tested, modern snow theme. Simple, robust, mobile-perfect.
// No images/links. Color + size. Fits: rounded-xl border, max-h, toolbar fixed.

import { useEffect, useRef } from 'react'
import Quill from 'quill'
import 'quill/dist/quill.snow.css'

const ALLOWED_TAGS = new Set(['P', 'DIV', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'UL', 'OL', 'LI', 'SPAN', 'H1', 'H2', 'H3'])
const ALLOWED_STYLES = ['color', 'background-color', 'font-size', 'line-height', 'text-align', 'font-weight', 'font-style']
export function sanitizeHtml(html: string): string {
  if (!html.trim()) return ''
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const walk = (n: Node): void => {
      const kids = Array.from(n.childNodes)
      for (const k of kids) {
        if (k.nodeType === Node.ELEMENT_NODE) {
          const el = k as HTMLElement
          if (!ALLOWED_TAGS.has(el.tagName)) {
            el.replaceWith(...Array.from(el.childNodes))
            continue
          }
          const style = el.getAttribute('style')
          if (style) {
            const keep: string[] = []
            for (const decl of style.split(';')) {
              const [prop, ...rest] = decl.split(':')
              const p = prop?.trim().toLowerCase()
              if (p && ALLOWED_STYLES.includes(p) && rest.join(':').trim()) keep.push(`${p}:${rest.join(':').trim()}`)
            }
            if (keep.length) el.setAttribute('style', keep.join(';'))
            else el.removeAttribute('style')
          }
          for (const a of Array.from(el.attributes)) if (a.name !== 'style') el.removeAttribute(a.name)
          walk(el)
        } else if (k.nodeType === Node.COMMENT_NODE) k.parentNode?.removeChild(k)
        else walk(k)
      }
    }
    walk(doc.body)
    return doc.body.innerHTML
  } catch {
    return ''
  }
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

    // create editor element
    const editorEl = document.createElement('div')
    editorEl.style.minHeight = '96px'
    editorEl.style.maxHeight = '256px'
    editorEl.style.overflowY = 'auto'
    container.appendChild(editorEl)

    // register size as style (12px etc.) so dropdown shows correctly, not "Normal Normal"
    const Size = Quill.import('attributors/style/size') as { whitelist: string[] }
    Size.whitelist = ['12px', '14px', '16px', '18px', '20px', '24px']
    Quill.register(Size as unknown as never, true)

    const quill = new Quill(editorEl, {
      theme: 'snow',
      placeholder: placeholder || 'Type something...',
      modules: {
        toolbar: {
          container: [
            ['bold', 'italic', 'underline', 'strike'],
            [{ color: [] }, { size: Size.whitelist }],
            [{ list: 'ordered' }, { list: 'bullet' }],
            ['clean'],
          ],
        },
        history: { delay: 500, maxStack: 100, userOnly: true },
      },
      formats: ['bold', 'italic', 'underline', 'strike', 'color', 'size', 'list'],
    })

    // seed from value
    const initial = sanitizeHtml(value || '')
    if (initial) {
      quill.clipboard.dangerouslyPasteHTML(initial)
      lastHtml.current = quill.root.innerHTML
    }

    // emit on change
    quill.on('text-change', () => {
      const html = quill.root.innerHTML
      // Quill leaves <p><br></p> for empty
      const isEmpty = html === '<p><br></p>' || !quill.getText().trim()
      const outHtml = isEmpty ? '' : html
      if (outHtml !== lastHtml.current) {
        lastHtml.current = outHtml
        onChange(outHtml, quill.getText())
      }
    })

    quillRef.current = quill

    // ensure toolbar doesn't steal focus quirks on mobile
    const toolbar = container.querySelector('.ql-toolbar') as HTMLElement | null
    if (toolbar) {
      toolbar.addEventListener('mousedown', (e) => e.preventDefault())
    }

    return () => {
      // cleanup
      try {
        quill.off('text-change', () => {})
      } catch {}
      quillRef.current = null
      container.innerHTML = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // sync external value changes (e.g. switching student) — overwrite cleanly
  useEffect(() => {
    const quill = quillRef.current
    if (!quill) return
    const next = sanitizeHtml(value || '')
    const current = quill.root.innerHTML
    // avoid loop: only overwrite if external value differs from last emitted
    if (next !== lastHtml.current && next !== current) {
      const sel = quill.getSelection()
      const isFocused = document.activeElement && quill.root.contains(document.activeElement)
      if (isFocused) return
      lastHtml.current = next
      if (!next) {
        quill.setText('')
      } else {
        quill.clipboard.dangerouslyPasteHTML(next)
      }
      // move cursor to end
      if (sel) quill.setSelection(quill.getLength(), 0)
    }
  }, [value])

  // update placeholder if it changes
  useEffect(() => {
    const quill = quillRef.current
    if (quill && placeholder) {
      const el = quill.root as HTMLElement
      el.setAttribute('data-placeholder', placeholder)
    }
  }, [placeholder])

  return (
    <div
      ref={containerRef}
      className="rounded-xl border border-line dark:border-line-dark overflow-hidden bg-white dark:bg-card-dark [&_.ql-toolbar]:!bg-cream [&_.ql-toolbar]:dark:!bg-input-dark [&_.ql-toolbar]:!border-line [&_.ql-toolbar]:dark:!border-line-dark [&_.ql-toolbar]:!border-t-0 [&_.ql-toolbar]:!border-x-0 [&_.ql-container]:!border-0 [&_.ql-editor]:!min-h-[96px] [&_.ql-editor]:!max-h-64 [&_.ql-editor]:!overflow-y-auto [&_.ql-editor]:!px-3 [&_.ql-editor]:!py-2.5 [&_.ql-editor]:!text-[14px] [&_.ql-editor]:!leading-[1.45]"
    />
  )
}
