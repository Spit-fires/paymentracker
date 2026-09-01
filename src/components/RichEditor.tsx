import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type MouseEvent } from 'react'
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
const REMOVE_WITH_CONTENT = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH'])
const ALLOWED_STYLES = new Set(['color', 'font-size', 'font-weight', 'font-style', 'text-decoration-line'])

function cleanStyle(style: string): string {
  const probe = document.createElement('span')
  probe.setAttribute('style', style)

  return Array.from(ALLOWED_STYLES)
    .map((property) => {
      const value = probe.style.getPropertyValue(property).trim()
      return value ? `${property}:${value}` : ''
    })
    .filter(Boolean)
    .join(';')
}

/** Keep receipt markup predictable and safe, including pasted HTML from other apps. */
export function sanitizeHtml(html: string): string {
  if (!html.trim()) return ''

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const visit = (node: Node) => {
      for (const child of Array.from(node.childNodes)) visit(child)

      if (node.nodeType !== Node.ELEMENT_NODE) return
      const element = node as HTMLElement

      if (REMOVE_WITH_CONTENT.has(element.tagName)) {
        element.remove()
        return
      }

      if (!ALLOWED_TAGS.has(element.tagName)) {
        element.replaceWith(...Array.from(element.childNodes))
        return
      }

      const style = element.getAttribute('style')
      const cleanedStyle = style ? cleanStyle(style) : ''
      for (const attribute of Array.from(element.attributes)) element.removeAttribute(attribute.name)
      if (cleanedStyle) element.setAttribute('style', cleanedStyle)
    }

    for (const child of Array.from(doc.body.childNodes)) visit(child)
    return doc.body.innerHTML
  } catch {
    return ''
  }
}

const COLORS = [
  { label: 'Default', value: 'inherit' },
  { label: 'Black', value: '#1c2936' },
  { label: 'Gray', value: '#6b7280' },
  { label: 'Navy', value: '#12314f' },
  { label: 'Blue', value: '#2563eb' },
  { label: 'Sky', value: '#0284c7' },
  { label: 'Teal', value: '#0d9488' },
  { label: 'Green', value: '#15803d' },
  { label: 'Red', value: '#b23b3b' },
  { label: 'Pink', value: '#db2777' },
  { label: 'Purple', value: '#7c3aed' },
  { label: 'Gold', value: '#b98a2f' },
  { label: 'Orange', value: '#ea580c' },
  { label: 'Brown', value: '#8a5a2b' },
]

const SIZES = [12, 14, 16, 18, 20, 24]

function plainTextHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r?\n/g, '<br>')
}

type SavedRange = {
  startContainer: Node
  startOffset: number
  endContainer: Node
  endOffset: number
}

type ActiveFormats = {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  bullet: boolean
  ordered: boolean
}

interface Props {
  value?: string
  onChange: (html: string, text: string) => void
  placeholder?: string
  label?: string
}

const emptyFormats: ActiveFormats = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  bullet: false,
  ordered: false,
}

export function RichEditor({ value, onChange, placeholder, label }: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const lastHtml = useRef('')
  const savedRange = useRef<SavedRange | null>(null)
  const [active, setActive] = useState<ActiveFormats>(emptyFormats)
  const [isEmpty, setIsEmpty] = useState(!(value || '').trim())
  const [openMenu, setOpenMenu] = useState<'size' | 'color' | null>(null)

  const captureSelection = useCallback(() => {
    const editor = editorRef.current
    const selection = window.getSelection()
    if (!editor || !selection?.rangeCount) return

    const range = selection.getRangeAt(0)
    if (!editor.contains(range.commonAncestorContainer)) return

    savedRange.current = {
      startContainer: range.startContainer,
      startOffset: range.startOffset,
      endContainer: range.endContainer,
      endOffset: range.endOffset,
    }
  }, [])

  const refreshActiveFormats = useCallback(() => {
    const editor = editorRef.current
    const selection = window.getSelection()
    if (!editor || !selection?.rangeCount || !editor.contains(selection.getRangeAt(0).commonAncestorContainer)) return

    setActive({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strike: document.queryCommandState('strikeThrough'),
      bullet: document.queryCommandState('insertUnorderedList'),
      ordered: document.queryCommandState('insertOrderedList'),
    })
  }, [])

  const rememberSelection = useCallback(() => {
    captureSelection()
    refreshActiveFormats()
  }, [captureSelection, refreshActiveFormats])

  const restoreSelection = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return false

    editor.focus({ preventScroll: true })
    const saved = savedRange.current
    const selection = window.getSelection()
    if (!selection) return false

    if (saved && editor.contains(saved.startContainer) && editor.contains(saved.endContainer)) {
      const range = document.createRange()
      range.setStart(saved.startContainer, saved.startOffset)
      range.setEnd(saved.endContainer, saved.endOffset)
      selection.removeAllRanges()
      selection.addRange(range)
      return true
    }

    const range = document.createRange()
    range.selectNodeContents(editor)
    range.collapse(false)
    selection.removeAllRanges()
    selection.addRange(range)
    return true
  }, [])

  const emit = useCallback(
    (normalise = false) => {
      const editor = editorRef.current
      if (!editor) return

      const html = normalise ? sanitizeHtml(editor.innerHTML) : editor.innerHTML
      if (normalise && html !== editor.innerHTML) editor.innerHTML = html
      const text = editor.innerText.replace(/\u00a0/g, ' ').trim()
      const output = text ? html : ''

      lastHtml.current = output
      setIsEmpty(!text)
      onChange(output, text)
    },
    [onChange],
  )

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || document.activeElement === editor) return

    const incoming = sanitizeHtml(value || '')
    if (lastHtml.current !== incoming) {
      lastHtml.current = incoming
      editor.innerHTML = incoming
      setIsEmpty(!editor.innerText.trim())
    }
  }, [value])

  useEffect(() => {
    if (!openMenu) return

    const closeMenu = (event: PointerEvent) => {
      if (!toolbarRef.current?.contains(event.target as Node)) setOpenMenu(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null)
    }

    document.addEventListener('pointerdown', closeMenu)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeMenu)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [openMenu])

  const runCommand = (command: string, commandValue?: string) => {
    if (!restoreSelection()) return
    document.execCommand(command, false, commandValue)
    rememberSelection()
    emit()
  }

  const applyInlineStyle = (property: 'color' | 'fontSize', value: string) => {
    if (!restoreSelection()) return
    const selection = window.getSelection()
    if (!selection?.rangeCount || selection.isCollapsed) return

    const range = selection.getRangeAt(0)
    const span = document.createElement('span')
    span.style[property] = value
    const fragment = range.extractContents()
    const cssProperty = property === 'fontSize' ? 'font-size' : 'color'
    for (const element of Array.from(fragment.querySelectorAll<HTMLElement>('*'))) {
      element.style.removeProperty(cssProperty)
      if (property === 'color') element.removeAttribute('color')
      if (property === 'fontSize') element.removeAttribute('size')
      if (!element.getAttribute('style')) element.removeAttribute('style')
    }
    span.append(fragment)
    range.insertNode(span)

    const nextRange = document.createRange()
    nextRange.selectNodeContents(span)
    selection.removeAllRanges()
    selection.addRange(nextRange)
    rememberSelection()
    emit()
  }

  const applySize = (size: number) => applyInlineStyle('fontSize', `${size}px`)

  const insertPlainText = (text: string) => {
    if (!text) return

    restoreSelection()
    document.execCommand('insertHTML', false, plainTextHtml(text))
    rememberSelection()
    emit()
  }

  const pastePlainText = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault()
    insertPlainText(event.clipboardData.getData('text/plain'))
  }

  const dropPlainText = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    insertPlainText(event.dataTransfer.getData('text/plain'))
  }

  const rememberToolbarSelection = () => {
    rememberSelection()
  }

  const preventButtonFocus = (event: MouseEvent<HTMLButtonElement>) => {
    rememberSelection()
    event.preventDefault()
  }

  const button = (label: string, title: string, pressed: boolean, onClick: () => void, className?: string) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={pressed}
      onPointerDown={rememberToolbarSelection}
      onMouseDown={preventButtonFocus}
      onClick={onClick}
      className={cx(
        'h-10 min-w-10 px-1.5 rounded-md grid place-items-center text-[12.5px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/50',
        pressed
          ? 'bg-ink text-white dark:bg-ink-soft'
          : 'text-body dark:text-text-dark hover:bg-ink/10 dark:hover:bg-white/10',
        className,
      )}
    >
      {label}
    </button>
  )

  const menuButton = (menu: 'size' | 'color', title: string, children: string) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-haspopup="listbox"
      aria-expanded={openMenu === menu}
      onPointerDown={rememberToolbarSelection}
      onMouseDown={preventButtonFocus}
      onClick={() => setOpenMenu((current) => (current === menu ? null : menu))}
      className={cx(
        'h-10 min-w-10 rounded-md border border-line bg-white px-2 text-[12px] font-semibold text-body transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 dark:border-line-dark dark:bg-card-dark dark:text-text-dark',
        openMenu === menu && 'border-ink bg-ink/10 dark:border-ink-soft dark:bg-ink-soft/20',
      )}
    >
      {children}
    </button>
  )

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white dark:border-line-dark dark:bg-card-dark">
      <div
        ref={toolbarRef}
        className="flex flex-wrap items-center gap-1 border-b border-line bg-cream px-2 py-2 dark:border-line-dark dark:bg-input-dark"
        aria-label="Text formatting"
      >
        <div className="flex items-center">
          {button('B', 'Bold', active.bold, () => runCommand('bold'))}
          {button('I', 'Italic', active.italic, () => runCommand('italic'), 'italic')}
          {button('U', 'Underline', active.underline, () => runCommand('underline'), 'underline')}
          {button('S', 'Strikethrough', active.strike, () => runCommand('strikeThrough'), 'line-through')}
        </div>
        <span className="h-5 w-px bg-line dark:bg-line-dark" aria-hidden="true" />
        <div className="relative">
          {menuButton('size', 'Font size', 'Size')}
          {openMenu === 'size' && (
            <div
              role="listbox"
              aria-label="Font size"
              className="absolute left-0 top-[calc(100%+6px)] z-10 grid min-w-28 grid-cols-2 gap-1 rounded-lg border border-line bg-white p-1.5 shadow-[0_4px_8px_rgba(18,49,79,0.12)] dark:border-line-dark dark:bg-card-dark"
            >
              {SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  role="option"
                  aria-selected="false"
                  onPointerDown={rememberToolbarSelection}
                  onMouseDown={preventButtonFocus}
                  onClick={() => {
                    applySize(size)
                    setOpenMenu(null)
                  }}
                  className="h-9 rounded-md px-2 text-[12px] font-semibold text-body hover:bg-ink/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 dark:text-text-dark dark:hover:bg-white/10"
                >
                  {size}px
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="relative">
          {menuButton('color', 'Text color', 'Color')}
          {openMenu === 'color' && (
            <div
              role="listbox"
              aria-label="Text color"
              className="absolute left-0 top-[calc(100%+6px)] z-10 grid min-w-36 grid-cols-2 gap-1 rounded-lg border border-line bg-white p-1.5 shadow-[0_4px_8px_rgba(18,49,79,0.12)] dark:border-line-dark dark:bg-card-dark"
            >
              {COLORS.map((color) => (
                <button
                  key={color.label}
                  type="button"
                  role="option"
                  aria-selected="false"
                  onPointerDown={rememberToolbarSelection}
                  onMouseDown={preventButtonFocus}
                  onClick={() => {
                    applyInlineStyle('color', color.value)
                    setOpenMenu(null)
                  }}
                  className="flex h-9 items-center gap-2 rounded-md px-2 text-left text-[12px] font-semibold text-body hover:bg-ink/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 dark:text-text-dark dark:hover:bg-white/10"
                >
                  <span
                    className="h-3 w-3 rounded-full border border-black/15 dark:border-white/20"
                    style={{ backgroundColor: color.value === 'inherit' ? 'currentColor' : color.value }}
                    aria-hidden="true"
                  />
                  {color.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="h-5 w-px bg-line dark:bg-line-dark" aria-hidden="true" />
        <div className="flex items-center">
          {button('UL', 'Bullet list', active.bullet, () => runCommand('insertUnorderedList'), 'text-[10px]')}
          {button('OL', 'Numbered list', active.ordered, () => runCommand('insertOrderedList'), 'text-[10px]')}
          {button('Tx', 'Clear inline formatting', false, () => runCommand('removeFormat'), 'text-[10px]')}
        </div>
        <span className="h-5 w-px bg-line dark:bg-line-dark" aria-hidden="true" />
        <div className="flex items-center">
          {button('Undo', 'Undo', false, () => runCommand('undo'), 'text-[10px]')}
          {button('Redo', 'Redo', false, () => runCommand('redo'), 'text-[10px]')}
        </div>
      </div>
      <div className="relative">
        {isEmpty && placeholder && (
          <div className="pointer-events-none absolute inset-x-3 top-2.5 text-[14px] leading-normal text-faint dark:text-muted-dark">
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={label || placeholder || 'Rich text editor'}
          spellCheck
          onFocus={rememberSelection}
          onKeyUp={rememberSelection}
          onPointerUp={rememberSelection}
          onSelect={rememberSelection}
          onInput={() => emit()}
          onBlur={() => emit(true)}
          onPaste={pastePlainText}
          onDrop={dropPlainText}
          className="min-h-28 max-h-64 overflow-y-auto px-3 py-2.5 text-[14px] leading-[1.5] text-body outline-none empty:before:content-none dark:text-text-dark [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-1.5 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6"
        />
      </div>
    </div>
  )
}
