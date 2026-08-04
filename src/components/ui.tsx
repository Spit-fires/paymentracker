import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft'
  full?: boolean
}

export function Button({ variant = 'primary', full, className, ...rest }: BtnProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold text-[15px] transition active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none px-4 py-2.5'
  const variants: Record<string, string> = {
    primary:
      'bg-[#12314f] text-white hover:bg-[#0b2136] dark:bg-[#2b5a86] dark:hover:bg-[#1d4570]',
    secondary:
      'bg-white text-[#12314f] border border-[#d8d3c8] hover:bg-[#faf8f2] dark:bg-[#16232f] dark:text-white dark:border-[#2c4054]',
    soft: 'bg-[#e8f0f7] text-[#12314f] hover:bg-[#dae7f1] dark:bg-[#1d3144] dark:text-[#cfe2f4]',
    ghost: 'text-[#3d4c5c] hover:bg-black/5 dark:text-[#b8c6d4] dark:hover:bg-white/10',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  }
  return (
    <button className={cx(base, variants[variant], full && 'w-full', className)} {...rest} />
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        'bg-white dark:bg-[#141f2c] rounded-2xl border border-[#e8e3d9] dark:border-[#253546] shadow-[0_1px_2px_rgba(0,0,0,0.04)]',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <div className="text-[13px] font-semibold text-[#4b5a69] dark:text-[#b8c6d4] mb-1.5">
        {label}
      </div>
      {children}
      {hint && <div className="text-[12px] text-[#8a8578] mt-1">{hint}</div>}
    </label>
  )
}

const inputCls =
  'w-full rounded-xl border border-[#d8d3c8] dark:border-[#2c4054] bg-white dark:bg-[#0f1822] px-3.5 py-2.5 text-[15px] text-[#1c2936] dark:text-white placeholder:text-[#a8a292] focus:outline-none focus:ring-2 focus:ring-[#12314f]/30 dark:focus:ring-[#2b5a86]/40'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputCls, 'min-h-[70px]', props.className)} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputCls, 'appearance-none', props.className)} />
}

export function PageHeader({
  title,
  subtitle,
  right,
  back,
  onBack,
}: {
  title: string
  subtitle?: string
  right?: ReactNode
  back?: boolean
  onBack?: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-4 pt-4 pb-3">
      {back && (
        <button
          onClick={onBack}
          className="w-9 h-9 grid place-items-center rounded-full bg-white dark:bg-[#141f2c] border border-[#e8e3d9] dark:border-[#253546] text-[#3d4c5c] dark:text-[#b8c6d4] active:scale-95 transition"
          aria-label="Go back"
        >
          <span className="sr-only">Back</span>
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="text-[20px] font-bold text-[#12314f] dark:text-white truncate">{title}</h1>
        {subtitle && <p className="text-[13px] text-[#8a8578] dark:text-[#93a7bb] truncate">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

export function Avatar({ src, name, size = 44 }: { src?: string; name: string; size?: number }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join('')
    .toUpperCase()
  return (
    <div
      className="rounded-full grid place-items-center text-white font-semibold shrink-0 overflow-hidden bg-[#12314f]"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {src ? <img src={src} alt={name} className="w-full h-full object-cover" /> : initials}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: ReactNode
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center text-center py-16 px-8">
      <div className="w-16 h-16 rounded-2xl bg-[#e8f0f7] dark:bg-[#1d3144] grid place-items-center text-[#12314f] dark:text-[#cfe2f4] mb-4">
        {icon}
      </div>
      <div className="text-[16px] font-bold text-[#12314f] dark:text-white">{title}</div>
      {subtitle && <div className="text-[13px] text-[#8a8578] dark:text-[#93a7bb] mt-1 max-w-[260px]">{subtitle}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx('animate-spin w-5 h-5', className)} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4Z" />
    </svg>
  )
}

export function Modal({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  title?: string
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#141f2c] w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 pb-8 rise">
        {title && (
          <div className="flex items-center justify-between mb-4">
            <div className="text-[16px] font-bold text-[#12314f] dark:text-white">{title}</div>
            <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-full bg-black/5 dark:bg-white/10 text-[#3d4c5c] dark:text-[#b8c6d4]">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#8a8578] dark:text-[#93a7bb] px-4 pt-1 pb-2">
      {children}
    </div>
  )
}
