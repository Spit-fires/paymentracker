const KEY = 'pt_token'
const EXP = 'pt_token_exp'

export function setToken(t: string, expiresInSec?: number): void {
  try {
    localStorage.setItem(KEY, t)
    if (expiresInSec && expiresInSec > 0) {
      localStorage.setItem(EXP, String(Date.now() + expiresInSec * 1000))
    } else {
      localStorage.removeItem(EXP)
    }
  } catch {
    /* ignore */
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function tokenExpiryMs(): number | null {
  try {
    const v = Number(localStorage.getItem(EXP))
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
    localStorage.removeItem(KEY)
    localStorage.removeItem(EXP)
  } catch {
    /* ignore */
  }
}
