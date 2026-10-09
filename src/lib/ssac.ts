/** SSAC report fetch: URL building, proxy calls, name checks, filenames.
 *  The actual rendering happens in /api/ssac-pdf (headless Chromium) because
 *  report marks are JS-injected after page load - a plain fetch only ever
 *  sees the empty shell. */

const HOST = 'ssaac.edu.bd'

// shared anti-spam key for our own render proxy - must match api/ssac-pdf.ts
// (DEFAULT_API_KEY). Not a real secret: it ships in this bundle. It just
// keeps random bots from burning our function time; rate limiting backs it.
const PT_API_KEY = 'pt-ssac-9f3c7a2e4b5d'

export function buildResultUrl(examId: string, sid: string): string {
  return `https://${HOST}/index_pop.php?cms=printBanPR&exam_id=${examId}&sid=${sid}`
}

/** Pull an exam_id out of a pasted school result URL - kills typo'd IDs. */
export function extractExamId(url: string): string | null {
  const m = /exam_id=(\d{1,20})/.exec(url)
  return m ? m[1] : null
}

/** Pull a sid out of a pasted school result URL. */
export function extractSid(url: string): string | null {
  const m = /[?&]sid=(\d{1,20})/.exec(url)
  return m ? m[1] : null
}

export type ProxyResult =
  | { status: 'ok'; pdf: Blob; siteName: string; resolvedSid?: string }
  | { status: 'empty'; siteName: string; hint?: string }
  | { status: 'error'; reason: string }

/** Call the render proxy for one student. 90s budget - cold Chromium starts
 *  are slow; the caller paces students sequentially with gaps. Pass the
 *  teacher's school-site session cookie when set - the CMS appears to render
 *  marks only for authenticated sessions. */
export async function fetchResultPdf(
  examId: string,
  sid: string,
  cookie?: string,
  creds?: { user: string; pass: string },
): Promise<ProxyResult> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), 90000)
  try {
    const headers: Record<string, string> = { 'x-pt-key': PT_API_KEY }
    if (cookie) headers['x-ssac-cookie'] = cookie
    // school-login overwrite from app settings - the proxy falls back to its
    // hardcoded defaults for whichever field is blank
    if (creds?.user) headers['x-ssac-user'] = creds.user
    if (creds?.pass) headers['x-ssac-pass'] = creds.pass
    const res = await fetch(
      `/api/ssac-pdf?exam_id=${encodeURIComponent(examId)}&sid=${encodeURIComponent(sid)}`,
      { signal: ctrl.signal, headers },
    )
    const ctype = res.headers.get('content-type') || ''
    if (ctype.includes('application/pdf')) {
      const pdf = await res.blob()
      if (pdf.size < 15000) return { status: 'error', reason: 'PDF too small - render failed' }
      const resolved = res.headers.get('x-resolved-sid') || undefined
      return {
        status: 'ok',
        pdf,
        siteName: decodeURIComponent(res.headers.get('x-student-name') || ''),
        ...(resolved ? { resolvedSid: resolved } : {}),
      }
    }
    const j = (await res.json().catch(() => null)) as {
      status?: string
      siteName?: string
      reason?: string
      hint?: string
    } | null
    if (!j) return { status: 'error', reason: `proxy unavailable (HTTP ${res.status})` }
    if (j.status === 'empty')
      return { status: 'empty', siteName: j.siteName || '', hint: j.hint || undefined }
    return { status: 'error', reason: j.reason || `proxy ${res.status}` }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { status: 'error', reason: 'render timed out after 90s' }
    }
    return { status: 'error', reason: e instanceof Error ? e.message : 'fetch failed' }
  } finally {
    window.clearTimeout(timer)
  }
}

const HONORIFICS = new Set(['mst', 'md', 'mohd', 'mohammad', 'mr', 'ms', 'mrs', 'miss', 'sk', 'sheikh'])

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !HONORIFICS.has(t))
}

/** Loose match between our record and the site's printed name - school
 *  spellings carry MST./MD. prefixes and variants, so exact equality would
 *  false-block constantly. Requires ≥⅔ token overlap both ways. */
export function namesMatch(ours: string, site: string): boolean {
  const a = nameTokens(ours)
  const b = nameTokens(site)
  if (!a.length || !b.length) return false
  const setB = new Set(b)
  const hitA = a.filter((t) => setB.has(t)).length
  const setA = new Set(a)
  const hitB = b.filter((t) => setA.has(t)).length
  return hitA / a.length >= 2 / 3 && hitB / b.length >= 2 / 3
}

/** Deterministic filename - re-runs overwrite the same Drive file, never
 *  duplicate. e.g. Result-2nd-Tutorial-2026-1008.pdf */
export function resultFileName(examLabel: string, examId: string): string {  const clean = examLabel
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
  return `Result-${clean || 'Exam'}-${examId}.pdf`
}

const SESS_KEY = 'pt_ssac_sess'
const SESS_USER_KEY = 'pt_ssac_user'
const SESS_PASS_KEY = 'pt_ssac_pass'

/** Teacher's school-site session cookie. Local-only (never synced, never
 *  logged) - it only ever travels to ssaac.edu.bd via the render proxy. */
export function getSsacSession(): string {
  try {
    return localStorage.getItem(SESS_KEY) || ''
  } catch {
    return ''
  }
}

export function setSsacSession(v: string): void {
  try {
    if (v) localStorage.setItem(SESS_KEY, v)
    else localStorage.removeItem(SESS_KEY)
  } catch {
    /* ignore */
  }
}

/** School-login overwrite from app settings. Device-local only (never
 *  synced, never logged) - sent per request, wins over the hardcoded
 *  defaults field by field. */
export function getSsacCreds(): { user: string; pass: string } {
  try {
    return {
      user: localStorage.getItem(SESS_USER_KEY) || '',
      pass: localStorage.getItem(SESS_PASS_KEY) || '',
    }
  } catch {
    return { user: '', pass: '' }
  }
}

export function setSsacCreds(user: string, pass: string): void {
  try {
    if (user) localStorage.setItem(SESS_USER_KEY, user)
    else localStorage.removeItem(SESS_USER_KEY)
    if (pass) localStorage.setItem(SESS_PASS_KEY, pass)
    else localStorage.removeItem(SESS_PASS_KEY)
  } catch {
    /* ignore */
  }
}
