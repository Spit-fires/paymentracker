import { useApp } from '../state/AppContext'
import { IconSync } from './Icons'

/** Slim, tappable banner shown when the saved session can't silently re-auth.
 *  The app stays fully usable offline — only sync is paused. */
export function ReauthBanner() {
  const { clientId, login, reauthError } = useApp()
  if (!clientId) return null
  return (
    <button
      onClick={() => void login(clientId)}
      className="w-full mt-3 flex items-center justify-between gap-3 rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 text-left active:scale-[0.99] transition-transform"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <IconSync className="w-[18px] h-[18px] shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-amber-700 dark:text-amber-300">
            Sync paused — not signed in
          </div>
          <div className="text-[12px] text-muted dark:text-muted-dark truncate">
            Tap to sign back in. Your data is safe on this device.
          </div>
          {reauthError && (
            <div className="text-[11px] text-muted dark:text-muted-dark truncate mt-0.5">
              Google says: {reauthError}
            </div>
          )}
        </div>
      </div>
      <span className="text-[13px] font-semibold text-amber-700 dark:text-amber-300 shrink-0">
        Sign in →
      </span>
    </button>
  )
}
