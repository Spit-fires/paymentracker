import { useEffect, useRef } from 'react'
import Quill from 'quill'
import 'quill/dist/quill.snow.css'

const ALLOWED_TAGS = new Set([
  'P',
  'DIV',
  'BR',
  'B',
  'STRONG',
  'I',
  'EM',
  'U',
  'S',
  'STRIKE',
  'UL',
  'OL',
  'LI',
  'SPAN',
  'FONT',
])
const ALLOWED_STYLES = ['color', 'background-color', 'font-size', 'text-align', 'font-weight', 'font-style']

/** Strip anything not produced by the editor toolbar - keeps html-to-image
 *  capture safe and prevents stray page CSS from leaking into the receipt. */
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
              if (p && ALLOWED_STYLES.includes(p) && rest.join(':').trim()) {
                keep.push(`${p}:${rest.join(':').trim()}`)
              }
            }
            if (keep.length) el.setAttribute('style', keep.join(';'))
            else el.removeAttribute('style')
          }
          for (const a of Array.from(el.attributes)) {
            if (a.name !== 'style') el.removeAttribute(a.name)
          }
          walk(el)
        } else if (k.nodeType === Node.COMMENT_NODE) {
          k.parentNode?.removeChild(k)
        } else {
          walk(k)
        }
      }
    }
    walk(doc.body)
    return doc.body.innerHTML
  } catch {
    return ''
  }
}

const COLORS = ['#1c2936', '#12314f', '#b23b3b', '#15803d', '#b98a2f', '#0d9488']

const TOOLBAR = [
  ['undo', 'redo'],
  ['bold', 'italic', 'underline', 'strike'],
  [{ size: ['12px', '14px', '16px', '18px', '20px', '24px'] }],
  [{ color: COLORS }],
  [{ align: ['', 'center', 'right', 'justify'] }],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['clean'],
]

interface Props {
  value?: string
  onChange: (html: string, text: string) => void
  placeholder?: string
}

export function RichEditor({ value, onChange, placeholder }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const quillRef = useRef<Quill | null>(null)
  const cbRef = useRef(onChange)
  cbRef.current = onChange

  useEffect(() => {
    const host = hostRef.current
    if (!host || quillRef.current) return
    const q = new Quill(host, {
      theme: 'snow',
      placeholder,
      modules: {
        toolbar: {
          container: TOOLBAR,
          handlers: {
            undo: () => (q.getModule('history') as { undo: () => void }).undo(),
            redo: () => (q.getModule('history') as { redo: () => void }).redo(),
          },
        },
        clipboard: { matchVisual: false },
      },
    })
    quillRef.current = q
    if (value) q.clipboard.dangerouslyPasteHTML(value, 'silent')
    q.on('text-change', (_delta, _old, source) => {
      if (source === 'silent') return
      cbRef.current(q.root.innerHTML, q.getText())
    })
    return () => {
      q.off('text-change')
      quillRef.current = null
      host.innerHTML = ''
    }
    // mount once - the editor owns its own state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // controlled sync: apply an external value only when it differs and the
  // user isn't editing right now (never clobber an in-progress document)
  useEffect(() => {
    const q = quillRef.current
    if (!q) return
    const v = value || ''
    if (q.root.innerHTML === v) return
    if (q.hasFocus()) return
    q.clipboard.dangerouslyPasteHTML(v, 'silent')
  }, [value])

  return (
    <div className="rounded-xl border border-line dark:border-line-dark overflow-hidden bg-white dark:bg-card-dark">
      <div ref={hostRef} />
    </div>
  )
}
