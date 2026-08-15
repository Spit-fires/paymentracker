import type { SessionUser } from '../types'
import { log } from './logs'

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
            login_hint?: string
            callback: (res: {
              access_token?: string
              id_token?: string
              expires_in?: number
              scope?: string
              error?: string
              error_description?: string
            }) => void
          }) => { requestAccessToken: (opts?: { prompt?: string; login_hint?: string }) => void }
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

export interface TokenResult {
  token: string
  idToken?: string
  /** Access-token lifetime in seconds (Google returns ~3600). */
  expiresIn?: number
}

/** Cached token clients keyed by clientId + login_hint. Reusing the same
 *  client preserves GIS internal state (granted scopes, session cookies)
 *  which is essential for silent sign-in to work across browser restarts
 *  and with multiple Google accounts. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedClient: any = null
let cachedClientKey = ''

function requestToken(
  clientId: string,
  prompt?: string,
  loginHint?: string,
  timeoutMs = 30000,
): Promise<TokenResult> {
  return new Promise((resolve, reject) => {
    waitForGis(timeoutMs)
      .then((g) => {
        const clientKey = `${clientId}|${loginHint || ''}`
        const cb = (res: {
          access_token?: string
          id_token?: string
          expires_in?: number
          scope?: string
          error?: string
          error_description?: string
        }) => {
          if (res.access_token) {
            resolve({ token: res.access_token, idToken: res.id_token, expiresIn: res.expires_in })
          } else {
            reject(new Error(res.error_description || res.error || 'Sign-in failed'))
          }
        }
        if (!cachedClient || cachedClientKey !== clientKey) {
          cachedClient = g.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: SCOPES,
            include_granted_scopes: true,
            login_hint: loginHint,
            callback: cb,
          })
          cachedClientKey = clientKey
        } else {
          cachedClient.callback = cb
        }
        cachedClient.requestAccessToken(
          prompt ? { prompt, login_hint: loginHint } : loginHint ? { login_hint: loginHint } : undefined,
        )
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

/** Interactive sign-in. First-time users see the consent popup; returning
 *  users with valid consent get a token with no popup. */
export async function signIn(
  clientId: string,
  loginHint?: string,
): Promise<{ token: string; expiresIn?: number; user: SessionUser }> {
  log('info', 'Starting interactive sign-in', loginHint ? `hint: ${loginHint}` : undefined)
  const { token, idToken, expiresIn } = await requestToken(clientId, undefined, loginHint)
  const user = userFromIdToken(idToken) || (await fetchUserInfo(token))
  log('info', `Signed in as ${user.email}`)
  return { token, expiresIn, user }
}

/** Reason for the last failed silent re-auth (GIS error string), so the
 *  banner can show exactly why Google refused instead of guessing. */
export let lastSilentError: string | null = null

/** Silent re-auth on app load / before sync. Uses prompt 'none': no popup,
 *  no account picker - returns the token when the grant is valid, errors
 *  otherwise. Uses login_hint to tell Google which account to use, which
 *  is critical for multi-account browsers. */
export async function silentSignIn(
  clientId: string,
  loginHint?: string,
): Promise<TokenResult | null> {
  try {
    log('info', 'Attempting silent sign-in', loginHint ? `hint: ${loginHint}` : undefined)
    const r = await requestToken(clientId, 'none', loginHint, 10000)
    lastSilentError = null
    log('info', 'Silent sign-in succeeded')
    return r
  } catch (e) {
    lastSilentError = e instanceof Error ? e.message : String(e)
    log('warn', `Silent sign-in failed: ${lastSilentError}`)
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
