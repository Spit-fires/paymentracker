import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { useApp } from '../state/AppContext'
import { IconHome, IconUsers, IconGear, IconBook, IconClipboardCheck, IconSync, IconCheck, IconInfo } from './Icons'
import { cx } from './ui'

const tabs = [
  { to: '/dashboard', label: 'Home', Icon: IconHome },
  { to: '/students', label: 'Students', Icon: IconUsers },
  { to: '/attendance', label: 'Attendance', Icon: IconClipboardCheck },
  { to: '/accounting', label: 'Accounting', Icon: IconBook },
  { to: '/settings', label: 'Settings', Icon: IconGear },
]

export function Layout({ children }: { children: ReactNode }) {
  const { online, syncing, toast } = useApp()

  return (
    <div className="app-shell relative flex flex-col">
      <AnimatePresence>
        {toast && (
          <div className="no-print fixed top-3 left-1/2 -translate-x-1/2 z-[60] max-w-[92%] w-max">
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
              className={cx(
                'rounded-full px-4 py-2.5 text-[13.5px] font-semibold shadow-lg text-white flex items-center gap-2',
                toast.kind === 'ok' && 'bg-emerald-600',
                toast.kind === 'err' && 'bg-red-600',
                toast.kind === 'info' && 'bg-ink',
              )}
            >
              {toast.kind === 'ok' && <IconCheck className="w-4 h-4 shrink-0" />}
              {toast.kind === 'err' && (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4M12 16h.01" />
                </svg>
              )}
              {toast.kind === 'info' && <IconInfo className="w-4 h-4 shrink-0" />}
              <span className="truncate">{toast.msg}</span>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {!online && (
        <div className="no-print sticky top-0 z-40 bg-amber-500 text-white text-center text-[12.5px] font-semibold py-1.5 px-3">
          Offline - changes will sync when you're back online
        </div>
      )}

      <div className="flex-1 pb-24">{children}</div>

      <nav className="no-print fixed bottom-0 inset-x-0 z-40">
        <div className="app-shell-safe mx-auto max-w-[480px] bg-white/95 dark:bg-[#0e1823]/95 backdrop-blur border-t border-line dark:border-line-dark grid grid-cols-5 safe-b">
          {tabs.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cx(
                  'flex flex-col items-center gap-0.5 pt-2.5 pb-1.5 text-[11px] font-semibold transition',
                  isActive ? 'text-ink dark:text-accent-dark' : 'text-faint dark:text-[#5f7a92]',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className="relative w-11 h-7 rounded-full grid place-items-center">
                    {isActive && (
                      <motion.span
                        layoutId="nav-pill"
                        className="absolute inset-0 rounded-full bg-ink/10 dark:bg-accent-dark/15"
                        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                      />
                    )}
                    <Icon
                      className={cx('relative w-[22px] h-[22px]', isActive && 'stroke-[2.3]')}
                    />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
        {syncing && (
          <div className="max-w-[480px] mx-auto flex items-center justify-center gap-1.5 bg-ink/95 dark:bg-ink-soft/95 text-white text-[11px] py-1">
            <IconSync className="w-3.5 h-3.5 animate-spin" /> Syncing…
          </div>
        )}
      </nav>
    </div>
  )
}

export function SyncIndicator() {
  const { syncing, lastSyncAt, syncNow } = useApp()
  return (
    <button
      onClick={() => void syncNow()}
      className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted dark:text-muted-dark"
    >
      <IconSync className={cx('w-3.5 h-3.5', syncing && 'animate-spin')} />
      {syncing ? 'Syncing…' : lastSyncAt ? 'Synced' : 'Sync'}
    </button>
  )
}
