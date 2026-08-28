// Modern battle-tested rich text via Lexical (Meta). Headless, performant, mobile-perfect.
// No images/links — just bold/italic/underline/strike, lists, align, clear.
// Fits constraints: fixed toolbar, max-h, no receipt growth.

import { useEffect, useState } from 'react'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html'
import { $getRoot, $getSelection, $isRangeSelection } from 'lexical'
import { $patchStyleText } from '@lexical/selection'
import { ListNode, ListItemNode, INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND, REMOVE_LIST_COMMAND } from '@lexical/list'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { FORMAT_TEXT_COMMAND, UNDO_COMMAND, REDO_COMMAND, type LexicalEditor } from 'lexical'
import { mergeRegister } from '@lexical/utils'
import { cx } from './ui'

const COLORS = [
  { label: 'Auto', value: '' },
  { label: 'Black', value: '#1c2936' },
  { label: 'Navy', value: '#12314f' },
  { label: 'Red', value: '#b23b3b' },
  { label: 'Green', value: '#15803d' },
  { label: 'Gold', value: '#b98a2f' },
  { label: 'Teal', value: '#0d9488' },
]
const SIZES = [12, 14, 16, 18, 20, 24]

// Keep sanitize for receipt capture — Lexical HTML is already clean, but we still strip.
// Must stay exported for ReceiptCard.
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

function onError(error: Error) {
  console.error(error)
}

const theme = {
  paragraph: 'lexical-paragraph',
  text: {
    bold: 'font-bold',
    italic: 'italic',
    underline: 'underline',
    strikethrough: 'line-through',
  },
  list: {
    nested: { listitem: 'ml-6' },
    ol: 'list-decimal ml-6',
    ul: 'list-disc ml-6',
    listitem: 'lexical-listitem',
  },
  heading: {
    h1: 'text-[20px] font-bold',
    h2: 'text-[18px] font-bold',
    h3: 'text-[16px] font-bold',
  },
}

// Toolbar — fixed, no layout shift, tap target 32px, mobile-safe
// No alignment — color + size instead. Lexical style patch for perfect control.
function Toolbar() {
  const [editor] = useLexicalComposerContext()
  const [isBold, setIsBold] = useState(false)
  const [isItalic, setIsItalic] = useState(false)
  const [isUnderline, setIsUnderline] = useState(false)
  const [isStrike, setIsStrike] = useState(false)

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          const sel = $getSelection()
          if (sel && $isRangeSelection(sel)) {
            setIsBold(sel.hasFormat('bold'))
            setIsItalic(sel.hasFormat('italic'))
            setIsUnderline(sel.hasFormat('underline'))
            setIsStrike(sel.hasFormat('strikethrough'))
          }
        })
      }),
    )
  }, [editor])

  const btn = (active: boolean, onClick: () => void, label: string, title: string) => (
    <button
      key={title}
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={cx(
        'min-w-8 h-8 px-1.5 rounded-lg text-[12.5px] font-bold grid place-items-center transition active:scale-95 select-none',
        active ? 'bg-ink/10 dark:bg-accent-dark/20 text-ink dark:text-accent-dark' : 'text-body/70 dark:text-muted-dark hover:bg-black/5 dark:hover:bg-white/10',
      )}
    >
      {label}
    </button>
  )

  const setColor = (value: string) => {
    editor.update(() => {
      const sel = $getSelection()
      if ($isRangeSelection(sel)) {
        if (value) $patchStyleText(sel, { color: value })
        else $patchStyleText(sel, { color: null } as unknown as { color: string })
      }
    })
  }
  const setSize = (value: string) => {
    editor.update(() => {
      const sel = $getSelection()
      if ($isRangeSelection(sel)) {
        if (value) $patchStyleText(sel, { 'font-size': `${value}px` })
        else $patchStyleText(sel, { 'font-size': null } as unknown as { 'font-size': string })
      }
    })
  }

  return (
    <div className="flex flex-wrap gap-0.5 items-center bg-cream dark:bg-input-dark px-1.5 py-1 border-b border-line dark:border-line-dark">
      {btn(isBold, () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold'), 'B', 'Bold')}
      {btn(isItalic, () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic'), 'I', 'Italic')}
      {btn(isUnderline, () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline'), 'U', 'Underline')}
      {btn(isStrike, () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough'), 'S', 'Strikethrough')}
      <span className="w-px h-5 bg-line dark:bg-line-dark mx-1" />
      <select
        onMouseDown={(e) => e.preventDefault()}
        onChange={(e) => {
          const v = e.target.value
          if (v) setSize(v)
          e.target.selectedIndex = 0
        }}
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
      <select
        onMouseDown={(e) => e.preventDefault()}
        onChange={(e) => {
          const v = e.target.value
          setColor(v)
          e.target.selectedIndex = 0
        }}
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
      {btn(false, () => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined), '•≡', 'Bullet list')}
      {btn(false, () => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined), '1≡', 'Numbered list')}
      {btn(false, () => editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined), '≡×', 'Remove list')}
      <span className="w-px h-5 bg-line dark:bg-line-dark mx-1" />
      {btn(false, () => editor.dispatchCommand(UNDO_COMMAND, undefined), '↺', 'Undo')}
      {btn(false, () => editor.dispatchCommand(REDO_COMMAND, undefined), '↻', 'Redo')}
      <span className="w-px h-5 bg-line dark:bg-line-dark mx-1" />
      {btn(false, () => {
        editor.update(() => {
          const sel = $getSelection()
          if ($isRangeSelection(sel)) {
            // clear inline styles + formats
            $patchStyleText(sel, { color: null, 'font-size': null } as unknown as Record<string, string | null>)
            sel.format = 0
          }
        })
      }, '⌫', 'Clear')}
    </div>
  )
}

// Sync editor content from `value` (HTML) when it changes externally and editor not focused
function HtmlSync({ value }: { value?: string }) {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    const html = value || ''
    // avoid clobbering focused editor
    const active = document.activeElement
    const rootEl = editor.getRootElement()
    if (rootEl && active && rootEl.contains(active)) return
    editor.update(() => {
      const root = $getRoot()
      root.clear()
      if (!html.trim()) return
      const parser = new DOMParser()
      const dom = parser.parseFromString(html, 'text/html')
      const nodes = $generateNodesFromDOM(editor, dom)
      root.append(...nodes)
    })
  }, [editor, value])
  return null
}

interface Props {
  value?: string
  onChange: (html: string, text: string) => void
  placeholder?: string
}

export function RichEditor({ value, onChange, placeholder }: Props) {
  const initialConfig = {
    namespace: 'pt-rich',
    theme,
    onError,
    nodes: [ListNode, ListItemNode, HeadingNode, QuoteNode],
  }

  const handleChange = (editorState: unknown, editor: LexicalEditor) => {
    editorState as { read: (fn: () => void) => void }
    let html = ''
    let text = ''
    // @ts-expect-error editorState has read
    editorState.read(() => {
      html = $generateHtmlFromNodes(editor)
      text = $getRoot().getTextContent()
    })
    onChange(html, text)
  }

  return (
    <div className="rounded-xl border border-line dark:border-line-dark overflow-hidden">
      <LexicalComposer initialConfig={initialConfig}>
        <Toolbar />
        <div className="relative">
          <RichTextPlugin
            contentEditable={<ContentEditable className="min-h-[96px] max-h-64 overflow-y-auto px-3 py-2.5 text-[14px] leading-[1.45] text-body dark:text-text-dark focus:outline-none" />}
            placeholder={<div className="absolute top-2.5 left-3 text-[14px] text-faint pointer-events-none select-none">{placeholder || 'Type something...'}</div>}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <ListPlugin />
          <OnChangePlugin onChange={handleChange} />
          <HtmlSync value={value} />
        </div>
      </LexicalComposer>
    </div>
  )
}
