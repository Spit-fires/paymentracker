import { useEffect, useRef } from 'react'
import { cx } from './ui'

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

/** Strip anything not produced by the editor toolbar — keeps html-to-image
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

const COLORS = [
  { label: 'Auto', value: 'inherit' },
  { label: 'Black', value: '#1c2936' },
  { label: 'Navy', value: '#12314f' },
  { label: 'Red', value: '#b23b3b' },
  { label: 'Green', value: '#15803d' },
  { label: 'Gold', value: '#b98a2f' },
  { label: 'Teal', value: '#0d9488' },
]

const SIZES = [12, 14, 16, 18, 20, 24]

function exec(cmd: string, value?: string) {
  document.execCommand('styleWithCSS', false, 'true')
  document.execCommand(cmd, false, value)
}

function wrapSelection(tag: string, attrs: Record<string, string>) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return
  const range = sel.getRangeAt(0)
  const span = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) span.setAttribute(k, v)
  span.appendChild(range.cloneContents())
  range.deleteContents()
  range.insertNode(span)
  sel.removeAllRanges()
  const r = document.createRange()
  r.selectNodeContents(span)
  sel.addRange(r)
}

interface Props {
  value?: string
  onChange: (html: string, text: string) => void
  placeholder?: string
}

export function RichEditor({ value, onChange, placeholder }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const last = useRef('')

  // seed the editor from the store; never clobber a focused document
  useEffect(() => {
    const el = ref.current
    if (!el || document.activeElement === el) return
    const v = value || ''
    if (last.current !== v) {
      last.current = v
      el.innerHTML = v
    }
  }, [value])

  const emit = () => {
    const el = ref.current
    if (!el) return
    last.current = el.innerHTML
    onChange(el.innerHTML, el.innerText)
  }

  const run = (cmd: string, value?: string) => {
    elFocus()
    exec(cmd, value)
    emit()
  }

  const setSize = (px: number) => {
    elFocus()
    wrapSelection('span', { style: `font-size:${px}px` })
    emit()
  }

  const setColor = (c: string) => {
    elFocus()
    exec('foreColor', c)
    emit()
  }

  const elFocus = () => ref.current?.focus()

  const btn = (active: boolean, onClick: () => void, label: string, title: string) => (
    <button
      key={title}
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={cx(
        'min-w-8 h-8 px-1.5 rounded-lg text-[12.5px] font-bold grid place-items-center transition active:scale-95 select-none',
        active
          ? 'bg-ink/10 dark:bg-accent-dark/20 text-ink dark:text-accent-dark'
          : 'text-body/70 dark:text-muted-dark hover:bg-black/5 dark:hover:bg-white/10',
      )}
    >
      {label}
    </button>
  )

  return (
    <div className="rounded-xl border border-line dark:border-line-dark overflow-hidden">
      <div className="flex flex-wrap gap-0.5 items-center bg-cream dark:bg-input-dark px-1.5 py-1 border-b border-line dark:border-line-dark">
        {btn(false, () => run('bold'), 'B', 'Bold')}
        {btn(false, () => run('italic'), 'I', 'Italic')}
        {btn(false, () => run('underline'), 'U', 'Underline')}
        {btn(false, () => run('strikeThrough'), 'S', 'Strikethrough')}
        <span className="w-px h-5 bg-line dark:bg-line-dark mx-1" />
        <select
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => setSize(Number(e.target.value))}
          defaultValue=""
          className="h-8 rounded-lg bg-white dark:bg-card-dark border border-line dark:border-line-dark px-1 text-[12px] font-semibold text-body dark:text-text-dark"
          title="Font size"
        >
          <option value="" disabled>
            Size
          </option>
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {s}px
            </option>
          ))}
        </select>
        <span className="w-px h-5 bg-line dark:bg-line-dark mx-1" />
        <select
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => setColor(e.target.value)}
          defaultValue=""
          className="h-8 rounded-lg bg-white dark:bg-card-dark border border-line dark:border-line-dark px-1 text-[12px] font-semibold text-body dark:text-text-dark"
          title="Text color"
        >
          <option value="" disabled>
            Color
          </option>
          {COLORS.map((c) => (
            <option key={c.label} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <span className="w-px h-5 bg-line dark:bg-line-dark mx-1" />
        {btn(false, () => run('justifyLeft'), '⇤', 'Align left')}
        {btn(false, () => run('justifyCenter'), '⇹', 'Align center')}
        {btn(false, () => run('justifyRight'), '⇥', 'Align right')}
        <span className="w-px h-5 bg-line dark:bg-line-dark mx-1" />
        {btn(false, () => run('insertUnorderedList'), '•≡', 'Bullet list')}
        {btn(false, () => run('insertOrderedList'), '1≡', 'Numbered list')}
        {btn(false, () => run('removeFormat'), '⌫', 'Clear formatting')}
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        data-placeholder={placeholder}
        className="rich-editor min-h-[96px] max-h-64 overflow-y-auto px-3 py-2.5 text-[14px] text-body dark:text-text-dark focus:outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-faint empty:before:pointer-events-none"
      />
    </div>
  )
}