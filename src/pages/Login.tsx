import { useState } from 'react'
import { useApp } from '../state/AppContext'
import { CLIENT_ID } from '../config'
import { Button, Input, Field, Spinner } from '../components/ui'
import { IconGoogle } from '../components/Icons'

function Logo({ size = 56 }: { size?: number }) {
  return (
    <div
      className="rounded-2xl grid place-items-center text-white font-bold bg-gradient-to-br from-ink to-ink-soft shadow-lg shadow-ink/30"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      ৳
    </div>
  )
}

export function Login() {
  const { clientId, saveClientId, login } = useApp()
  const effectiveId = clientId || CLIENT_ID
  const [editing, setEditing] = useState(!effectiveId)
  const [cid, setCid] = useState(effectiveId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showHelp, setShowHelp] = useState(false)

  const submit = async () => {
    const id = (editing ? cid : effectiveId).trim()
    if (!id) {
      setError('Paste your Google OAuth Client ID first.')
      setEditing(true)
      return
    }
    setBusy(true)
    setError('')
    try {
      if (editing && id !== clientId) await saveClientId(id)
      await login(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-ink">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm bg-white dark:bg-card-dark rounded-3xl shadow-2xl p-7 rise">
          <div className="flex items-center gap-3 mb-6">
            <Logo />
            <div>
              <div className="text-[18px] font-bold text-ink dark:text-white leading-tight">
                Utsaho Educare
              </div>
              <div className="text-[12.5px] text-muted dark:text-muted-dark">
                Payment Tracker
              </div>
            </div>
          </div>

          <p className="text-[13.5px] text-muted dark:text-muted-dark mb-5 leading-relaxed">
            Sign in with the dedicated Utsaho Educare Google account to manage students, record
            payments and issue receipts.
          </p>

          {editing && (
            <div className="mb-4">
              <Field label="Google OAuth Client ID">
                <Input
                  value={cid}
                  onChange={(e) => setCid(e.target.value)}
                  placeholder="123456789-abc123.apps.googleusercontent.com"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </Field>
              <button
                onClick={() => setShowHelp((v) => !v)}
                className="text-[12px] text-teal font-medium mt-2 underline-offset-2"
              >
                {showHelp ? 'Hide instructions' : 'Where do I find this?'}
              </button>
              {showHelp && (
                <ol className="text-[12px] text-muted dark:text-muted-dark mt-2 space-y-1 list-decimal list-inside">
                  <li>Open Google Cloud Console → create a project for the dedicated account</li>
                  <li>APIs &amp; Services → Credentials → Create Credentials → OAuth Client ID</li>
                  <li>Choose “Web application”</li>
                  <li>
                    Under Authorized JavaScript origins add: your site URL and{' '}
                    <b>http://localhost:5173</b>
                  </li>
                  <li>Also enable the Google Drive API (APIs &amp; Services → Library)</li>
                  <li>Copy the Client ID and paste it here</li>
                </ol>
              )}
              <div className="flex gap-2 mt-3">
                <Button full onClick={submit} disabled={busy}>
                  {busy ? <Spinner className="text-white" /> : <IconGoogle />}
                  Sign in with Google
                </Button>
              </div>
            </div>
          )}

          {!editing && (
            <Button full size="lg" onClick={submit} disabled={busy}>
              {busy ? <Spinner className="text-white" /> : <IconGoogle />}
              Sign in with Google
            </Button>
          )}

          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="w-full text-center text-[12.5px] text-muted mt-4 underline-offset-2 underline"
            >
              Change Google account / Client ID
            </button>
          )}

          {error && (
            <div className="mt-3 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-300 text-[12.5px] font-medium px-3.5 py-2.5">
              {error}
            </div>
          )}
        </div>
      </div>

      <div className="text-center text-white/40 text-[11px] pb-6 px-6">
        Your data lives in your own Google Drive. No servers.
      </div>
    </div>
  )
}
