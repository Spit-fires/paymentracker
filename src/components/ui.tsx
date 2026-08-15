import {
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { pressTap, pressSpring } from './anim'

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

/** Stable object URL for a Blob, revoked on change/unmount. */
export function useBlobUrl(blob?: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

interface BtnProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd'
  > {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft'
  full?: boolean
  size?: 'md' | 'lg' | 'sm'
}

export function Button({ variant = 'primary', full, size = 'md', className, ...rest }: BtnProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:opacity-40 disabled:pointer-events-none select-none'
  const sizes: Record<string, string> = {
    sm: 'text-[13.5px] px-3 py-2',
    md: 'text-[15px] px-4 py-2.5 min-h-[44px]',
    lg: 'text-[16px] px-5 py-3.5 min-h-[52px]',
  }
  const variants: Record<string, string> = {
    primary:
      'bg-ink text-white shadow-[0_2px_8px_rgba(18,49,79,0.28)] hover:bg-ink-deep dark:bg-ink-soft dark:hover:bg-[#2b5a86]',
    secondary:
      'bg-white text-ink border border-line hover:bg-cream dark:bg-card-dark dark:text-text-dark dark:border-line-dark dark:hover:bg-input-dark',
    soft: 'bg-[#e8f0f7] text-ink hover:bg-[#dae7f1] dark:bg-hover-dark dark:text-accent-dark',
    ghost: 'text-muted hover:bg-black/5 dark:text-muted-dark dark:hover:bg-white/10',
    danger: 'bg-danger text-white hover:bg-red-700',
  }
  return (
    <motion.button
      whileTap={pressTap}
      transition={pressSpring}
      className={cx(base, sizes[size], variants[variant], full && 'w-full', className)}
      {...rest}
    />
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        'bg-white dark:bg-card-dark rounded-2xl border border-line dark:border-line-dark shadow-[0_1px_3px_rgba(18,49,79,0.06)]',
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
      <div className="text-[13px] font-semibold text-body/80 dark:text-muted-dark mb-1.5">
        {label}
      </div>
      {children}
      {hint && <div className="text-[12px] text-muted mt-1 dark:text-muted-dark/80">{hint}</div>}
    </label>
  )
}

const inputCls =
  'w-full rounded-xl border border-line dark:border-line-dark bg-white dark:bg-input-dark px-3.5 py-2.5 text-[15px] text-body dark:text-text-dark placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-teal/30 dark:focus:ring-teal/40'

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
          className="w-10 h-10 shrink-0 grid place-items-center rounded-full bg-white dark:bg-card-dark border border-line dark:border-line-dark text-body dark:text-text-dark active:scale-95 transition"
          aria-label="Go back"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="text-[19px] font-bold text-ink dark:text-white truncate leading-tight">{title}</h1>
        {subtitle && <p className="text-[13px] text-muted dark:text-muted-dark truncate">{subtitle}</p>}
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
      className="rounded-full grid place-items-center text-white font-semibold shrink-0 overflow-hidden bg-ink"
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
    <div className="flex flex-col items-center text-center py-14 px-8">
      <div className="w-16 h-16 rounded-2xl bg-[#e8f0f7] dark:bg-hover-dark grid place-items-center text-ink dark:text-accent-dark mb-4">
        {icon}
      </div>
      <div className="text-[16px] font-bold text-ink dark:text-white">{title}</div>
      {subtitle && (
        <div className="text-[13px] text-muted dark:text-muted-dark mt-1 max-w-[260px] leading-relaxed">
          {subtitle}
        </div>
      )}
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
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center">
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
          />
          <motion.div
            className="relative bg-white dark:bg-card-dark w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 pb-8 max-h-[88dvh] overflow-y-auto"
            initial={{ opacity: 0, y: 48 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 48 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            <div className="mx-auto w-10 h-1 rounded-full bg-line dark:bg-line-dark mb-4 sm:hidden" />
            {title && (
              <div className="flex items-center justify-between mb-4">
                <div className="text-[16px] font-bold text-ink dark:text-white">{title}</div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 grid place-items-center rounded-full bg-black/5 dark:bg-white/10 text-muted dark:text-muted-dark"
                  aria-label="Close"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-muted dark:text-muted-dark px-4 pt-1 pb-2">
      {children}
    </div>
  )
}
