import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import { IconHome, IconUsers, IconGear, IconSync } from './Icons'
import { cx } from './ui'

const tabs = [
  { to: '/dashboard', label: 'Dashboard', Icon: IconHome },
  { to: '/students', label: 'Students', Icon: IconUsers },
  { to: '/settings', label: 'Settings', Icon: IconGear },
]

export function Layout({ children }: { children: ReactNode }) {
  const { online, syncing, toast } = useApp()

  return (
    <div className="app-shell relative flex flex-col">
      {toast && (
        <div
          className={cx(
            'fixed top-3 left-1/2 -translate-x-1/2 z-[60] max-w-[92%] rounded-xl px-4 py-2.5 text-[13.5px] font-semibold shadow-lg text-white rise',
            toast.kind === 'ok' && 'bg-emerald-600',
            toast.kind === 'err' && 'bg-red-600',
            toast.kind === 'info' && 'bg-[#12314f]',
          )}
        >
          {toast.msg}
        </div>
      )}

      {!online && (
        <div className="sticky top-0 z-40 bg-amber-500 text-white text-center text-[12.5px] font-semibold py-1.5 px-3">
          Offline — changes will sync when you're back online
        </div>
      )}

      <div className="flex-1 pb-20">{children}</div>

      <nav className="fixed bottom-0 inset-x-0 z-40">
        <div className="app-shell-safe mx-auto max-w-[480px] bg-white/95 dark:bg-[#0e1823]/95 backdrop-blur border-t border-[#e8e3d9] dark:border-[#1d2b3a] grid grid-cols-3 safe-b">
          {tabs.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cx(
                  'flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition',
                  isActive ? 'text-[#12314f] dark:text-[#7fb3e0]' : 'text-[#a29b8d] dark:text-[#5f7a92]',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cx('w-[22px] h-[22px]', isActive && 'stroke-[2.4]')} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
        {syncing && (
          <div className="max-w-[480px] mx-auto flex items-center justify-center gap-1.5 bg-[#12314f]/95 text-white text-[11px] py-1">
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
      className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#8a8578] dark:text-[#93a7bb]"
    >
      <IconSync className={cx('w-3.5 h-3.5', syncing && 'animate-spin')} />
      {syncing ? 'Syncing…' : lastSyncAt ? 'Synced' : 'Sync'}
    </button>
  )
}
