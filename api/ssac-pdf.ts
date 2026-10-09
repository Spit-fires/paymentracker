/**
 * Vercel serverless: render one SSAC report page in headless Chromium and
 * return it as a full A4-landscape PDF.
 *
 * Why a headless browser and not a plain fetch: the report marks are injected
 * by JavaScript after page load (raw HTML carries an empty shell), so only a
 * real page load ever sees the marks. The teacher's permission to fetch these
 * pages is on file - keep the polite pacing client-side (sequential, gaps).
 *
 * GET /api/ssac-pdf?exam_id=1008&sid=251217110740
 *   200 application/pdf + X-Student-Name (URI-encoded) + X-Status: ok
 *   200 application/json { status: 'empty', siteName } - page loaded, no marks
 *   200 application/json { status: 'error', reason } - site unreachable/changed
 *   200 application/json { status: 'debug', ... } - with ?debug=1: request log
 *     + page state instead of a PDF (diagnosing why marks don't populate)
 *   400/405 for bad input. Host is allowlisted - this endpoint can only ever
 *   render ssaac.edu.bd report pages, never arbitrary URLs.
 */

import chromium from '@sparticuz/chromium'
import puppeteer, { type Page } from 'puppeteer-core'

export const maxDuration = 60

const ALLOW_HOST = 'ssaac.edu.bd'
const MIN_PDF_BYTES = 15000
const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;700&family=Roboto+Condensed:wght@400;700&display=swap'
const FONT_OVERRIDE = `body, td, th, p, div, font { font-family: 'Roboto Condensed', 'Noto Sans Bengali', sans-serif !important; }`

// structural req/res - no @vercel/node dependency needed for a Node function
interface Req {
  method?: string
  query?: Record<string, string | string[] | undefined>
  headers?: Record<string, string | string[] | undefined>
}
interface Res {
  status: (code: number) => Res
  json: (body: unknown) => void
  setHeader: (name: string, value: string) => void
  send: (body: unknown) => void
}

const isDigits = (v: string | string[] | undefined): v is string =>
  typeof v === 'string' && /^\d{1,20}$/.test(v)

const reportUrl = (examId: string, sid: string): string =>
  `https://${ALLOW_HOST}/index_pop.php?cms=printBanPR&exam_id=${examId}&sid=${sid}`

interface ReportInfo {
  name: string
  hasReport: boolean
  hasMarks: boolean
  htmlLen: number
}

/** Load one report URL and read its state. Marks are JS-injected after load,
 *  so this waits for the page's own traffic to settle plus the publish date
 *  to fill in before reading. */
async function loadReport(page: Page, url: string): Promise<ReportInfo> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
  // serverless Linux ships no Bengali glyphs - pull the page's own
  // families from Google Fonts so section names (বকুল…) render, not tofu
  try {
    await page.addStyleTag({ url: FONTS_URL })
    await page.addStyleTag({ content: FONT_OVERRIDE })
  } catch {
    /* fonts are best-effort - the PDF still renders without them */
  }
  await page.waitForNetworkIdle({ timeout: 12000 }).catch(() => null)
  await page
    .waitForFunction(() => /Result Publish Date:\s*\d/.test(document.body.innerText || ''), {
      timeout: 20000,
    })
    .catch(() => null)
  await new Promise<void>((r) => setTimeout(r, 3000))
  return page.evaluate(() => {
    const text = document.body.innerText || ''
    // leaf-cell match: the page is nested tables, so an outer wrapper td
    // also "contains" the label - only the label cell itself is short
    let name = ''
    const tds = Array.from(document.querySelectorAll('td'))
    for (const td of tds) {
      const t = (td.textContent || '').replace(/\s+/g, ' ').trim()
      if (/^Student's Name:?$/.test(t)) {
        const sib = td.nextElementSibling
        if (sib && /^td$/i.test(sib.tagName)) {
          name = (sib.textContent || '').replace(/\s+/g, ' ').trim()
        }
        break
      }
    }
    const pub = (/Result Publish Date:\s*([^\n]+)/.exec(text)?.[1] || '').trim()
    return {
      name,
      hasReport: /Student's Progress Report/.test(text),
      hasMarks: /\d/.test(pub),
      htmlLen: document.documentElement.outerHTML.length,
    }
  })
}

interface ListEntry {
  id: string
  text: string
}

// student_list.php is a public JSON array of every student:
// {"id":"<system id>","text":"<studentID>.<NAME>/<phone>"}. Cached in module
// scope so a 30-student run fetches it once (warm invocations reuse it).
let listCache: { at: number; byStudent: Map<string, string> } | null = null
const LIST_TTL_MS = 10 * 60 * 1000

/** Teachers save the printed student ID, but report URLs need the system id.
 *  Resolve student-ID → system-ID via the school's own list. Exact match on
 *  the text segment before the first dot - no length assumptions (system ids
 *  run 12-14 digits). Returns null when unresolvable. */
async function resolveSystemId(query: string): Promise<string | null> {
  const now = Date.now()
  if (!listCache || now - listCache.at > LIST_TTL_MS) {
    const r = await fetch(`https://${ALLOW_HOST}/student_list.php`, {
      signal: AbortSignal.timeout(25000),
    })
    if (!r.ok) return null
    const arr = (await r.json()) as ListEntry[]
    if (!Array.isArray(arr)) return null
    const byStudent = new Map<string, string>()
    for (const e of arr) {
      if (!e || typeof e.id !== 'string' || typeof e.text !== 'string') continue
      const seg = e.text.split('.')[0].trim()
      if (seg && !byStudent.has(seg)) byStudent.set(seg, e.id)
    }
    listCache = { at: now, byStudent }
  }
  return listCache.byStudent.get(query) || null
}

export default async function handler(req: Req, res: Res): Promise<void> {
  if (req.method && req.method !== 'GET') {
    res.status(405).json({ status: 'error', reason: 'method not allowed' })
    return
  }
  const examId = req.query?.exam_id
  const sid = req.query?.sid
  const debug = req.query?.debug === '1'
  if (!isDigits(examId) || !isDigits(sid)) {
    res.status(400).json({ status: 'error', reason: 'exam_id and sid must be numeric' })
    return
  }
  // optional school-site session cookie (teacher pastes it in the app) - the
  // CMS appears to render marks only for authenticated sessions; anonymous
  // loads get the empty shell. Only ever forwarded to ssaac.edu.bd, never
  // logged. Header form avoids the value landing in server access logs.
  const rawCookie = req.headers?.['x-ssac-cookie']
  const cookie = Array.isArray(rawCookie) ? rawCookie[0] : rawCookie
  const useCookie =
    typeof cookie === 'string' && cookie.length > 0 && cookie.length <= 1000 && !/[\r\n]/.test(cookie)
      ? cookie
      : null
  const url = `https://${ALLOW_HOST}/index_pop.php?cms=printBanPR&exam_id=${examId}&sid=${sid}`

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null
  try {
    browser = await puppeteer.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    })
    const page = await browser.newPage()
    // wide viewport so the 1200px report table lays out like a desktop print
    await page.setViewport({ width: 1400, height: 1000 })
    if (useCookie) {
      // teacher's own school-site session - makes this load equivalent to
      // their logged-in browser tab
      await page.setExtraHTTPHeaders({ Cookie: useCookie })
    }
    // look like a real desktop browser - headless tells (webdriver flag,
    // HeadlessChrome UA) make some servers skip their dynamic content
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false })
      Object.defineProperty(window, 'chrome', { value: { runtime: {} } })
    })
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    )
    // record the page's own network traffic - with ?debug=1 this is returned
    // instead of a PDF, showing whether marks even attempt to load
    const seen: Array<{ url: string; method: string; type: string; failed?: string }> = []
    page.on('request', (r) => {
      if (seen.length > 60) return
      const u = r.url()
      if (!u.includes('ssaac.edu.bd')) return
      if (/\.(css|png|jpg|jpeg|gif|ico|woff2?|js)(\?|$)/i.test(u)) return
      seen.push({ url: u.slice(0, 220), method: r.method(), type: r.resourceType() })
    })
    page.on('requestfailed', (r) => {
      if (seen.length > 60) return
      seen.push({
        url: r.url().slice(0, 220),
        method: r.method(),
        type: r.resourceType(),
        failed: r.failure()?.errorText || 'failed',
      })
    })
    // visit the homepage first - picks up any session/init cookies the report
    // page's dynamic loading may depend on
    try {
      await page.goto(`https://${ALLOW_HOST}/`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    } catch {
      /* homepage optional - the report URL is what matters */
    }
    let info = await loadReport(page, url)
    let resolvedSid: string | null = null
    if (!info.hasMarks) {
      // stored values are printed student IDs, not URL sids - resolve the
      // system id via the school's own student list, then retry once
      try {
        const resolved = await resolveSystemId(sid)
        if (resolved && resolved !== sid) {
          resolvedSid = resolved
          info = await loadReport(page, reportUrl(examId, resolved))
        }
      } catch {
        /* lookup failed - fall through to the empty response below */
      }
    }
    if (debug) {
      let cookieNames: string[] = []
      try {
        cookieNames = (await page.cookies()).map((c) => c.name)
      } catch {
        /* ignore */
      }
      res.status(200).json({
        status: 'debug',
        siteName: info.name,
        hasReport: info.hasReport,
        hasMarks: info.hasMarks,
        htmlLen: info.htmlLen,
        cookieSent: !!useCookie,
        cookiesSeen: cookieNames,
        resolvedSid,
        requests: seen,
      })
      return
    }
    if (!info.hasReport) {
      res.status(200).json({ status: 'error', reason: 'report page not found - site format may have changed' })
      return
    }
    if (!info.hasMarks) {
      res.status(200).json({
        status: 'empty',
        siteName: info.name,
        hint: resolvedSid
          ? 'system id resolved but still no marks - unpublished or session expired'
          : useCookie
            ? 'session cookie was sent but no marks - check the SSAC ID is in the school list'
            : 'no school session cookie was sent - marks may require login',
      })
      return
    }
    const pdf = await page.pdf({ format: 'A4', landscape: true, printBackground: true })
    if (pdf.length < MIN_PDF_BYTES) {
      res.status(200).json({ status: 'error', reason: 'rendered PDF suspiciously small - site may have changed' })
      return
    }
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('X-Status', 'ok')
    res.setHeader('X-Student-Name', encodeURIComponent(info.name))
    if (resolvedSid) res.setHeader('X-Resolved-Sid', resolvedSid)
    res.send(Buffer.from(pdf))
  } catch (e) {
    res.status(200).json({ status: 'error', reason: e instanceof Error ? e.message : 'render failed' })
  } finally {
    try {
      await browser?.close()
    } catch {
      /* ignore */
    }
  }
}
