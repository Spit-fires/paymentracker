/** SSAC report fetch: URL building, proxy calls, name checks, filenames.
 *  The actual rendering happens in /api/ssac-pdf (headless Chromium) because
 *  report marks are JS-injected after page load - a plain fetch only ever
 *  sees the empty shell. */

const HOST = 'ssaac.edu.bd'

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
  | { status: 'ok'; pdf: Blob; siteName: string }
  | { status: 'empty'; siteName: string }
  | { status: 'error'; reason: string }

/** Call the render proxy for one student. 90s budget - cold Chromium starts
 *  are slow; the caller paces students sequentially with gaps. */
export async function fetchResultPdf(examId: string, sid: string): Promise<ProxyResult> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), 90000)
  try {
    const res = await fetch(
      `/api/ssac-pdf?exam_id=${encodeURIComponent(examId)}&sid=${encodeURIComponent(sid)}`,
      { signal: ctrl.signal },
    )
    const ctype = res.headers.get('content-type') || ''
    if (ctype.includes('application/pdf')) {
      const pdf = await res.blob()
      if (pdf.size < 15000) return { status: 'error', reason: 'PDF too small - render failed' }
      return {
        status: 'ok',
        pdf,
        siteName: decodeURIComponent(res.headers.get('x-student-name') || ''),
      }
    }
    const j = (await res.json().catch(() => null)) as {
      status?: string
      siteName?: string
      reason?: string
    } | null
    if (!j) return { status: 'error', reason: `proxy unavailable (HTTP ${res.status})` }
    if (j.status === 'empty') return { status: 'empty', siteName: j.siteName || '' }
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
export function resultFileName(examLabel: string, examId: string): string {
  const clean = examLabel
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
  return `Result-${clean || 'Exam'}-${examId}.pdf`
}
