import type { SessionUser } from '../types'

const SCOPES = 'openid email profile https://www.googleapis.com/auth/drive.file'

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: {
            client_id: string
            scope: string
            include_granted_scopes?: boolean
            callback: (res: {
              access_token?: string
              id_token?: string
              scope?: string
              error?: string
              error_description?: string
            }) => void
          }) => { requestAccessToken: (opts?: { prompt?: string }) => void }
          revoke: (token: string, done?: () => void) => void
        }
      }
    }
  }
}

let gisPromise: Promise<NonNullable<Window['google']>> | null = null

/** Resolve once the GSI script has loaded, polling instead of relying on
 *  an event nobody dispatches. */
export function waitForGis(timeoutMs = 30000): Promise<NonNullable<Window['google']>> {
  if (gisPromise) return gisPromise
  gisPromise = new Promise((resolve, reject) => {
    const start = Date.now()
    const poll = () => {
      if (window.google) return resolve(window.google)
      if (Date.now() - start > timeoutMs) {
        return reject(new Error('Google Identity Services failed to load'))
      }
      setTimeout(poll, 100)
    }
    poll()
  })
  return gisPromise
}

function requestToken(clientId: string, prompt?: string, timeoutMs = 30000): Promise<{ token: string; idToken?: string }> {
  return new Promise((resolve, reject) => {
    waitForGis(timeoutMs)
      .then((g) => {
        const client = g.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPES,
          include_granted_scopes: true,
          callback: (res) => {
            if (res.access_token) resolve({ token: res.access_token, idToken: res.id_token })
            else reject(new Error(res.error_description || res.error || 'Sign-in failed'))
          },
        })
        client.requestAccessToken(prompt ? { prompt } : undefined)
      })
      .catch(reject)
  })
}

function userFromIdToken(idToken?: string): SessionUser | null {
  if (!idToken) return null
  try {
    const payload = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = payload.length % 4 === 0 ? '' : '='.repeat(4 - (payload.length % 4))
    const json = JSON.parse(atob(payload + pad))
    if (json.email) {
      return { name: json.name || json.email, email: json.email, picture: json.picture }
    }
  } catch {
    // fall through to userinfo
  }
  return null
}

/** Fresh, explicit sign-in (may show popup the first time). */
export async function signIn(clientId: string): Promise<{ token: string; user: SessionUser }> {
  const { token, idToken } = await requestToken(clientId, 'consent')
  const user = userFromIdToken(idToken) || (await fetchUserInfo(token))
  return { token, user }
}

/** Silent re-auth on app load; returns the token when not previously granted. */
export async function silentSignIn(clientId: string): Promise<string | null> {
  try {
    const { token } = await requestToken(clientId, undefined, 10000)
    return token
  } catch {
    return null
  }
}

export async function fetchUserInfo(accessToken: string): Promise<SessionUser> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Could not load profile')
  const j = await res.json()
  return { name: j.name || j.email || 'Teacher', email: j.email, picture: j.picture }
}

export async function revoke(accessToken: string): Promise<void> {
  try {
    await waitForGis()
    await new Promise<void>((resolve) => {
      window.google?.accounts.oauth2.revoke(accessToken, () => resolve())
    })
  } catch {
    // ignore
  }
}
