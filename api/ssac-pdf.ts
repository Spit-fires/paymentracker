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

// ---- anti-spam gate ----
// Shared key: Vercel env SSAC_API_KEY wins, else the default below. The PWA
// bundle carries the same default, so this is NOT a real secret - it just
// keeps random bots from burning function time. The per-IP rate limit
// underneath is the real backstop. Env changes never lock out the current
// client: the default key is always accepted alongside the env one.
const DEFAULT_API_KEY = 'pt-ssac-9f3c7a2e4b5d'
const API_KEY = process.env.SSAC_API_KEY || DEFAULT_API_KEY
// School-site login - HARDCODED defaults (teacher's call), overwritable
// per-request from the app (Results → School login sends x-ssac-user /
// x-ssac-pass). Anyone with repo access can read these, so a dedicated
// school account beats a personal one. The proxy logs itself into the
// STUDENT portal (edutechsadmin - plain POST, no captcha) because pasted
// browser sessions die fast: the CMS mints a new anonymous PHPSESSID on
// nearly every unauthenticated hit. Verified: one student-portal session
// renders ANY student's report (not just its own). A live teacher paste via
// x-ssac-cookie still wins over everything when provided.
const DEFAULT_USER = '2610600152'
const DEFAULT_PASS = '01716611368'
// academic year selector on the portal login
const ACADEMIC_YR = '20262027'

// module-scope authenticated session, keyed by username (warm invocations
// reuse it; switching accounts never serves another account's session)
let sessCache: { key: string; cookie: string; at: number } | null = null
const SESS_TTL_MS = 20 * 60 * 1000

/** Fresh programmatic login to the student portal - returns a Cookie header
 *  value or null. */
async function loginSession(user: string, pass: string): Promise<string | null> {
  if (!user || !pass) return null
  const body = new URLSearchParams({
    branch_id: '5001',
    account_type: 'student',
    academic_yr: ACADEMIC_YR,
    username: user,
    password: pass,
    login: '',
  })
  const r = await fetch(`https://${ALLOW_HOST}/edutechsadmin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    },
    body: body.toString(),
    redirect: 'manual',
    signal: AbortSignal.timeout(25000),
  })
  try {
    await r.arrayBuffer()
  } catch {
    /* free the socket */
  }
  const setCookies: string[] =
    typeof (r.headers as Headers).getSetCookie === 'function'
      ? (r.headers as Headers).getSetCookie()
      : []
  const sess = setCookies
    .map((c) => c.split(';')[0].trim())
    .filter((c) => /^phpsessid=/i.test(c))
  return sess.length ? sess.join('; ') : null
}

async function sessionCookie(user: string, pass: string): Promise<{ cookie: string | null; fresh: boolean }> {
  const now = Date.now()
  if (sessCache && sessCache.key === user && now - sessCache.at < SESS_TTL_MS) {
    return { cookie: sessCache.cookie, fresh: false }
  }
  const c = await loginSession(user, pass).catch(() => null)
  if (c) {
    sessCache = { key: user, cookie: c, at: now }
    return { cookie: c, fresh: true }
  }
  return { cookie: null, fresh: false }
}

// rolling per-IP bucket: 30 renders/min is plenty for sequential teacher
// runs (3s gaps ≈ 20/min) and starves floods
const RATE_MAX = 30
const RATE_WIN_MS = 60_000
const hits = new Map<string, { n: number; reset: number }>()

function rateOk(ip: string): boolean {
  const now = Date.now()
  if (hits.size > 500) {
    for (const [k, v] of hits) if (now > v.reset) hits.delete(k)
  }
  const e = hits.get(ip)
  if (!e || now > e.reset) {
    hits.set(ip, { n: 1, reset: now + RATE_WIN_MS })
    return true
  }
  e.n++
  return e.n <= RATE_MAX
}

function headerOne(h: Record<string, string | string[] | undefined>, name: string): string | null {
  const v = h[name]
  const s = Array.isArray(v) ? v[0] : v
  return typeof s === 'string' ? s : null
}
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
  // the site's print CSS pins its signature footer `position: fixed`, which
  // repeats on every page and overlaps body content in headless prints, and
  // its `zoom: 80%` is ignored so the 1200px table clips off the right edge.
  // Static footer + deterministic scale fixes both by construction.
  await page
    .evaluate(() => {
      const st = document.createElement('style')
      st.media = 'print'
      st.textContent = [
        '#footer_SIG { position: static !important; bottom: auto !important; width: auto !important; break-inside: avoid; }',
        'body { zoom: 1 !important; }',
      ].join('\n')
      document.head.appendChild(st)
    })
    .catch(() => null)
  await page.waitForNetworkIdle({ timeout: 10000 }).catch(() => null)
  await page
    .waitForFunction(() => /Result Publish Date:\s*\d/.test(document.body.innerText || ''), {
      timeout: 15000,
    })
    .catch(() => null)
  await new Promise<void>((r) => setTimeout(r, 2000))
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
  const headers = req.headers || {}
  // gate 1: shared key - bots scanning URLs don't have it
  const key = headerOne(headers, 'x-pt-key')
  if (key !== API_KEY && key !== DEFAULT_API_KEY) {
    res.status(401).json({ status: 'error', reason: 'unauthorized' })
    return
  }
  // gate 2: per-IP rate limit - blunts anything that gets past gate 1
  const fwd = headerOne(headers, 'x-forwarded-for')
  const ip = (fwd || '').split(',')[0].trim() || 'unknown'
  if (!rateOk(ip)) {
    res.status(429).json({ status: 'error', reason: 'rate limited - slow down' })
    return
  }
  const examId = req.query?.exam_id
  const sid = req.query?.sid
  const debug = req.query?.debug === '1'
  if (!isDigits(examId) || !isDigits(sid)) {
    res.status(400).json({ status: 'error', reason: 'exam_id and sid must be numeric' })
    return
  }
  // school session, cheapest-first: a live teacher paste wins outright;
  // otherwise the proxy logs in with the effective credentials (per-request
  // app overwrite, else the hardcoded defaults). Only ever forwarded to
  // ssaac.edu.bd, never logged.
  const rawCookie = headerOne(headers, 'x-ssac-cookie')
  const validCookie = (c: string | null): c is string =>
    !!c && c.length > 0 && c.length <= 1000 && !/[\r\n]/.test(c)
  const headerCookie = validCookie(rawCookie) ? rawCookie : null
  const validCred = (c: string | null): c is string =>
    !!c && c.length > 0 && c.length <= 100 && !/[\r\n]/.test(c)
  const rawUser = headerOne(headers, 'x-ssac-user')
  const rawPass = headerOne(headers, 'x-ssac-pass')
  const effUser = validCred(rawUser) ? rawUser : DEFAULT_USER
  const effPass = validCred(rawPass) ? rawPass : DEFAULT_PASS
  const credSource: 'app' | 'hardcoded' = rawUser || rawPass ? 'app' : 'hardcoded'
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
    if (headerCookie) {
      // teacher's own live session - makes this load equivalent to their tab
      await page.setExtraHTTPHeaders({ Cookie: headerCookie })
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
    // instead of a PDF, showing whether marks even attempt to load.
    // Third-party widgets (facebook page plugin on the homepage) are aborted
    // outright - they only burn function-budget seconds.
    const seen: Array<{ url: string; method: string; type: string; failed?: string }> = []
    await page.setRequestInterception(true)
    page.on('request', (r) => {
      const u = r.url()
      if (u.includes('facebook.com') || u.includes('staticxx.facebook.com')) {
        r.abort().catch(() => null)
        return
      }
      r.continue().catch(() => null)
      if (seen.length > 60) return
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
    // the default session is always on, so the warmup visit adds nothing -
    // skip it and save the seconds
    // resolve the system id AND establish the session in parallel - the
    // login POST and the list fetch are independent network calls
    const [resolved, sessRes] = await Promise.all([
      resolveSystemId(sid).catch(() => null),
      headerCookie
        ? Promise.resolve({ cookie: headerCookie, fresh: false })
        : sessionCookie(effUser, effPass),
    ])
    const sessionSource = headerCookie
      ? 'header-cookie'
      : sessRes.cookie
        ? sessRes.fresh
          ? `login-fresh-${credSource}`
          : `login-cache-${credSource}`
        : 'none'
    let loadSid = sid
    let resolvedSid: string | null = null
    if (resolved && resolved !== sid) {
      loadSid = resolved
      resolvedSid = resolved
    }
    if (sessRes.cookie && !headerCookie) {
      await page.setExtraHTTPHeaders({ Cookie: sessRes.cookie })
    }
    let info = await loadReport(page, reportUrl(examId, loadSid))
    let relogged = false
    if (!info.hasMarks && !sessRes.fresh && effUser && effPass) {
      // stale cached session or stale pasted cookie - one fresh login with
      // the effective credentials, then one reload. A just-completed login
      // is never retried (same attempt twice proves nothing).
      sessCache = null
      const fresh = await sessionCookie(effUser, effPass)
      if (fresh.cookie && fresh.cookie !== sessRes.cookie) {
        relogged = true
        await page.setExtraHTTPHeaders({ Cookie: fresh.cookie })
        info = await loadReport(page, reportUrl(examId, loadSid))
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
        cookieSent: !!sessRes.cookie,
        sessionSource,
        relogged,
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
          ? 'system id resolved but still no marks - exam unpublished for this student, or school login rejected'
          : !effUser || !effPass
            ? 'no school login available - set it in Results → School login'
            : 'logged in but no marks - exam unpublished for this student, or SSAC ID not in school list',
      })
      return
    }
    // scale 0.8 mirrors the site's own print zoom: the 1200px table becomes
    // 960px and fits landscape A4 (1047px printable) instead of clipping
    const pdf = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      scale: 0.8,
      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
    })
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
