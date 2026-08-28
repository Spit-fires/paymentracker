import { useRef } from 'react'
import { CKEditor } from '@ckeditor/ckeditor5-react'
import { ClassicEditor, Essentials, Paragraph, Bold, Italic, Underline, Strikethrough, Font, List } from 'ckeditor5'
import 'ckeditor5/ckeditor5.css'

export function sanitizeHtml(html: string): string {
  return html || ''
}

interface Props {
  value?: string
  onChange: (html: string, text: string) => void
  placeholder?: string
}

export function RichEditor({ value, onChange, placeholder }: Props) {
  const last = useRef(value || '')

  return (
    <div className="rounded-xl border border-line dark:border-line-dark overflow-hidden bg-white dark:bg-card-dark [&_.ck-toolbar]:!bg-cream [&_.ck-toolbar]:dark:!bg-input-dark [&_.ck-toolbar]:!border-line [&_.ck-editor__editable]:!min-h-[96px] [&_.ck-editor__editable]:!max-h-64 [&_.ck-editor__editable]:!px-3 [&_.ck-editor__editable]:!py-2.5 [&_.ck-content]:!text-[14px] [&_.ck-content]:!leading-[1.45]">
      <CKEditor
        editor={ClassicEditor}
        config={{
          licenseKey: 'GPL',
          plugins: [Essentials, Paragraph, Bold, Italic, Underline, Strikethrough, Font, List],
          toolbar: ['bold', 'italic', 'underline', 'strikethrough', '|', 'fontSize', 'fontColor', '|', 'bulletedList', 'numberedList', '|', 'undo', 'redo'],
          placeholder: placeholder || 'Type something...',
        }}
        data={value || ''}
        onChange={(_event, editor) => {
          const html = editor.getData()
          const out = html === '<p>&nbsp;</p>' || html === '<p><br></p>' || html === '<p><br data-cke-filler="true"></p>' ? '' : html
          const plain = (() => {
            const div = document.createElement('div')
            div.innerHTML = out
            return div.innerText
          })()
          if (out !== last.current) {
            last.current = out
            onChange(out, plain)
          }
        }}
        onReady={(editor) => {
          // Ensure proper min-height
          const editable = editor.ui.view.editable.element
          if (editable) {
            editable.style.minHeight = '96px'
            editable.style.maxHeight = '256px'
          }
        }}
      />
    </div>
  )
}
