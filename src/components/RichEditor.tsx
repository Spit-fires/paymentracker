import { useState } from 'react'
import { Button, Modal } from './ui'

export function sanitizeHtml(html: string): string {
  return html || ''
}

interface Props {
  value?: string
  onChange: (html: string, text: string) => void
  placeholder?: string
}

const EXAMPLES = [
  { tag: '<b>bold</b>', desc: 'Bold' },
  { tag: '<i>italic</i>', desc: 'Italic' },
  { tag: '<u>underline</u>', desc: 'Underline' },
  { tag: '<s>strike</s>', desc: 'Strikethrough' },
  { tag: '<span style="color:#b23b3b">red</span>', desc: 'Color — #b23b3b red, #15803d green, #12314f navy' },
  { tag: '<span style="font-size:18px">big</span>', desc: 'Size — 12px, 14px, 16px, 18px, 20px, 24px' },
  { tag: '<ul><li>bullet</li><li>item 2</li></ul>', desc: 'Bullet list' },
  { tag: '<ol><li>numbered</li><li>item 2</li></ol>', desc: 'Numbered list' },
  { tag: '<p>paragraph</p>', desc: 'Paragraph — use <p> or <div> for blocks' },
]

export function RichEditor({ value, onChange, placeholder }: Props) {
  const [helpOpen, setHelpOpen] = useState(false)

  const handleChange = (v: string) => {
    const div = document.createElement('div')
    div.innerHTML = v
    const text = div.innerText || div.textContent || ''
    onChange(v, text)
  }

  const insertExample = (tag: string) => {
    const next = (value || '') + (value ? '\n' : '') + tag
    handleChange(next)
    setHelpOpen(false)
  }

  return (
    <div className="rounded-xl border border-line dark:border-line-dark overflow-hidden bg-white dark:bg-card-dark">
      <div className="flex items-center justify-between px-2.5 py-1.5 bg-cream dark:bg-input-dark border-b border-line dark:border-line-dark">
        <div className="text-[12.5px] font-semibold text-body/70 dark:text-muted-dark">XML tags — type directly</div>
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="text-[12px] font-bold px-2.5 py-1 rounded-full bg-ink text-white dark:bg-ink-soft hover:bg-ink-deep dark:hover:bg-[#2b5a86] transition"
        >
          ? Help
        </button>
      </div>

      <textarea
        value={value || ''}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder || 'Type with tags e.g. <b>bold</b> <span style="color:#b23b3b">red</span>'}
        className="w-full min-h-[96px] max-h-64 overflow-y-auto px-3 py-2.5 text-[14px] leading-[1.45] font-mono bg-white dark:bg-card-dark text-body dark:text-text-dark placeholder:text-faint focus:outline-none resize-y"
        spellCheck={false}
      />

      {value ? (
        <div className="border-t border-line dark:border-line-dark bg-[#faf8f2] dark:bg-input-dark px-3 py-2">
          <div className="text-[11px] font-bold tracking-[0.08em] text-muted dark:text-muted-dark mb-1">Preview</div>
          <div className="text-[13px] leading-[1.45] text-body dark:text-text-dark [&_ul]:list-disc [&_ul]:ml-5 [&_ol]:list-decimal [&_ol]:ml-5 [&_li]:my-1" dangerouslySetInnerHTML={{ __html: value }} />
        </div>
      ) : null}

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="How to use XML tags">
        <div className="space-y-3">
          <p className="text-[13px] leading-relaxed text-muted dark:text-muted-dark">
            Type tags directly in the box. They are saved as HTML and shown on receipts. No toolbar — just type.
          </p>
          <div className="space-y-2">
            {EXAMPLES.map((ex) => (
              <div key={ex.tag} className="flex items-start gap-2 rounded-xl border border-line dark:border-line-dark bg-[#faf8f2] dark:bg-input-dark px-3 py-2.5">
                <code className="flex-1 text-[12.5px] font-mono text-ink dark:text-white break-all">{ex.tag}</code>
                <span className="text-[12px] text-muted dark:text-muted-dark shrink-0">{ex.desc}</span>
                <Button size="sm" variant="secondary" className="!px-2 !py-1 !text-[11px] !min-h-0 shrink-0" onClick={() => insertExample(ex.tag)}>
                  Insert
                </Button>
              </div>
            ))}
          </div>
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2.5 text-[12px] leading-relaxed text-amber-900 dark:text-amber-200">
            <b>Tip:</b> Nest tags: <code className="font-mono">&lt;b&gt;&lt;span style="color:#b23b3b"&gt;bold red&lt;/span&gt;&lt;/b&gt;</code>
            <br />
            Keep it simple — only these tags are kept: <code className="font-mono">b strong i em u s strike ul ol li span p div br h1 h2 h3</code> and styles <code className="font-mono">color font-size</code>.
          </div>
          <div className="flex justify-end pt-1">
            <Button variant="secondary" onClick={() => setHelpOpen(false)}>Close</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
