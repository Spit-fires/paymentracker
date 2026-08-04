const KEY = 'pt_token'

export function setToken(t: string): void {
  try {
    sessionStorage.setItem(KEY, t)
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

export function clearToken(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
