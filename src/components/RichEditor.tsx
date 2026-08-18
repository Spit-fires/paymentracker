import { useEffect } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { Underline } from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { TextAlign } from '@tiptap/extension-text-align'
import { Placeholder } from '@tiptap/extension-placeholder'
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

interface Props {
  value?: string
  onChange: (html: string, text: string) => void
  placeholder?: string
}

type ToolbarState = {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  align: 'left' | 'center' | 'right'
  bullet: boolean
  ordered: boolean
  color: string | undefined
  fontSize: string | undefined
  canUndo: boolean
  canRedo: boolean
}

export function RichEditor({ value, onChange, placeholder }: Props) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color.configure({ types: [TextStyle.name] }),
      TextAlign.configure({ types: ['paragraph', 'heading'] }),
      Placeholder.configure({ placeholder, emptyEditorClass: 'is-editor-empty' }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML(), editor.getText()),
  })

  // controlled sync: apply an external value only when it differs and the
  // user isn't editing right now (never clobber an in-progress document)
  useEffect(() => {
    if (!editor || !value) return
    if (editor.isFocused) return
    if (editor.getHTML() === value) return
    editor.commands.setContent(value, { emitUpdate: false })
  }, [value, editor])

  const toolbar = useEditorState<ToolbarState | null>({
    editor,
    selector: (ctx) => {
      const e = ctx.editor
      if (!e) return null
      return {
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        underline: e.isActive('underline'),
        strike: e.isActive('strike'),
        align: e.isActive({ textAlign: 'center' })
          ? 'center'
          : e.isActive({ textAlign: 'right' })
            ? 'right'
            : 'left',
        bullet: e.isActive('bulletList'),
        ordered: e.isActive('orderedList'),
        color: (e.getAttributes('textStyle').color as string | undefined) || undefined,
        fontSize: (e.getAttributes('textStyle').fontSize as string | undefined) || undefined,
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
      }
    },
  })

  if (!editor) {
    return (
      <div className="rounded-xl border border-line dark:border-line-dark overflow-hidden min-h-[96px]" />
    )
  }

  const chain = () => editor.chain().focus()

  const btn = (
    active: boolean,
    onClick: () => void,
    label: string,
    title: string,
  ) => (
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

  const setSize = (px: number) => {
    chain().setMark('textStyle', { fontSize: `${px}px` }).run()
  }

  const setColor = (c: string) => {
    if (c === 'inherit') chain().unsetColor().run()
    else chain().setColor(c).run()
  }

  const divider = <span key="d" className="w-px h-5 bg-line dark:bg-line-dark mx-1" />

  return (
    <div className="rounded-xl border border-line dark:border-line-dark overflow-hidden">
      <div className="flex flex-wrap gap-0.5 items-center bg-cream dark:bg-input-dark px-1.5 py-1 border-b border-line dark:border-line-dark">
        {btn(toolbar?.bold || false, () => chain().toggleBold().run(), 'B', 'Bold')}
        {btn(toolbar?.italic || false, () => chain().toggleItalic().run(), 'I', 'Italic')}
        {btn(toolbar?.underline || false, () => chain().toggleUnderline().run(), 'U', 'Underline')}
        {btn(toolbar?.strike || false, () => chain().toggleStrike().run(), 'S', 'Strikethrough')}
        {divider}
        <select
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => setSize(Number(e.target.value))}
          value={toolbar?.fontSize ? toolbar.fontSize.replace('px', '') : ''}
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
        {divider}
        <div className="flex items-center gap-1" title="Text color">
          {COLORS.map((c) => (
            <button
              key={c.label}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setColor(c.value)}
              title={c.label}
              aria-label={c.label}
              className={cx(
                'w-6 h-6 rounded-full border grid place-items-center transition active:scale-90',
                c.value === 'inherit'
                  ? 'border-line dark:border-line-dark bg-white dark:bg-card-dark text-faint dark:text-[#5f7a92]'
                  : '',
                toolbar?.color === c.value && 'ring-2 ring-teal/60 ring-offset-1 ring-offset-cream dark:ring-offset-input-dark',
              )}
            >
              {c.value === 'inherit' ? (
                <span className="text-[11px] leading-none font-bold">A</span>
              ) : (
                <span className="w-4 h-4 rounded-full" style={{ background: c.value }} />
              )}
            </button>
          ))}
        </div>
        {divider}
        {btn(toolbar?.align === 'left', () => chain().setTextAlign('left').run(), '⇤', 'Align left')}
        {btn(toolbar?.align === 'center', () => chain().setTextAlign('center').run(), '⇹', 'Align center')}
        {btn(toolbar?.align === 'right', () => chain().setTextAlign('right').run(), '⇥', 'Align right')}
        {divider}
        {btn(toolbar?.bullet || false, () => chain().toggleBulletList().run(), '•≡', 'Bullet list')}
        {btn(toolbar?.ordered || false, () => chain().toggleOrderedList().run(), '1≡', 'Numbered list')}
        {btn(false, () => chain().unsetAllMarks().run(), '⌫', 'Clear formatting')}
        {divider}
        {btn(toolbar?.canUndo || false, () => chain().undo().run(), '↩', 'Undo')}
        {btn(toolbar?.canRedo || false, () => chain().redo().run(), '↪', 'Redo')}
      </div>
      <EditorContent
        editor={editor}
        className="tiptap min-h-[96px] max-h-64 overflow-y-auto px-3 py-2.5 text-[14px] text-body dark:text-text-dark focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[80px] [&_.ProseMirror]:whitespace-pre-wrap"
      />
    </div>
  )
}
