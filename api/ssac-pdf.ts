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
 *   400/405 for bad input. Host is allowlisted - this endpoint can only ever
 *   render ssaac.edu.bd report pages, never arbitrary URLs.
 */

import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

export const maxDuration = 60

const ALLOW_HOST = 'ssaac.edu.bd'
const MIN_PDF_BYTES = 15000

// structural req/res - no @vercel/node dependency needed for a Node function
interface Req {
  method?: string
  query?: Record<string, string | string[] | undefined>
}
interface Res {
  status: (code: number) => Res
  json: (body: unknown) => void
  setHeader: (name: string, value: string) => void
  send: (body: unknown) => void
}

const isDigits = (v: string | string[] | undefined): v is string =>
  typeof v === 'string' && /^\d{1,20}$/.test(v)

export default async function handler(req: Req, res: Res): Promise<void> {
  if (req.method && req.method !== 'GET') {
    res.status(405).json({ status: 'error', reason: 'method not allowed' })
    return
  }
  const examId = req.query?.exam_id
  const sid = req.query?.sid
  if (!isDigits(examId) || !isDigits(sid)) {
    res.status(400).json({ status: 'error', reason: 'exam_id and sid must be numeric' })
    return
  }
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
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    // serverless Linux ships no Bengali glyphs - pull the page's own
    // families from Google Fonts so section names (বকুল…) render, not tofu
    try {
      await page.addStyleTag({
        url: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;700&family=Roboto+Condensed:wght@400;700&display=swap',
      })
      await page.addStyleTag({
        content: `body, td, th, p, div, font { font-family: 'Roboto Condensed', 'Noto Sans Bengali', sans-serif !important; }`,
      })
    } catch {
      /* fonts are best-effort - the PDF still renders without them */
    }
    // marks arrive via JS after load - wait for the publish date to fill in,
    // then read the page state regardless (empty = unpublished, not failure)
    await page
      .waitForFunction(() => /Result Publish Date:\s*\d/.test(document.body.innerText || ''), {
        timeout: 20000,
      })
      .catch(() => null)
    const info = await page.evaluate(() => {
      const text = document.body.innerText || ''
      let name = ''
      const tds = Array.from(document.querySelectorAll('td'))
      for (let i = 0; i < tds.length; i++) {
        if (/Student's Name/i.test(tds[i].textContent || '')) {
          name = (tds[i + 1]?.innerText || '').replace(/\s+/g, ' ').trim()
          break
        }
      }
      const pub = (/Result Publish Date:\s*([^\n]+)/.exec(text)?.[1] || '').trim()
      return { name, hasReport: /Student's Progress Report/.test(text), hasMarks: /\d/.test(pub) }
    })
    if (!info.hasReport) {
      res.status(200).json({ status: 'error', reason: 'report page not found - site format may have changed' })
      return
    }
    if (!info.hasMarks) {
      res.status(200).json({ status: 'empty', siteName: info.name })
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
