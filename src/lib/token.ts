const KEY = 'pt_token'
const EXP = 'pt_token_exp'

export function setToken(t: string, expiresInSec?: number): void {
  try {
    sessionStorage.setItem(KEY, t)
    if (expiresInSec && expiresInSec > 0) {
      sessionStorage.setItem(EXP, String(Date.now() + expiresInSec * 1000))
    } else {
      sessionStorage.removeItem(EXP)
    }
  } catch {
    /* ignore */
  }
}

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function tokenExpiryMs(): number | null {
  try {
    const v = Number(sessionStorage.getItem(EXP))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

/** True when the stored token is expired or about to expire (< 5 min left). */
export function tokenNeedsRefresh(): boolean {
  const exp = tokenExpiryMs()
  return exp === null || Date.now() > exp - 5 * 60 * 1000
}

export function clearToken(): void {
  try {
    sessionStorage.removeItem(KEY)
    sessionStorage.removeItem(EXP)
  } catch {
    /* ignore */
  }
}
