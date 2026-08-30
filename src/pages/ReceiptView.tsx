import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toPng as htmlToImageToPng } from 'html-to-image'
import { domToPng } from 'modern-screenshot'
import { useApp } from '../state/AppContext'
import { receiptFileName, payingForDisplay, fillMessage, fmtDateLong, fmtInvoiceNo, invoiceDailySeq } from '../lib/format'
import { Button, PageHeader } from '../components/ui'
import { ReceiptCard } from '../components/ReceiptCard'
import { IconPrint, IconShare, IconDownload, IconWhatsApp } from '../components/Icons'
import { defaultCenter, receiptViewLink, retryEnsurePublic } from '../lib/sync'
import { waLink, openExternal } from '../lib/phone'
import { log } from '../lib/logs'

export function ReceiptView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const isNew = params.get('new') === '1'
  const { payments, students, center, showToast } = useApp()

  const payment = payments.find((p) => p.id === id)
  const student = payment ? students.find((s) => s.id === payment.studentId) : undefined

  const cardRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [holderH, setHolderH] = useState(600)
  const [waBusy, setWaBusy] = useState(false)

  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const calc = () => {
      const avail = Math.min(window.innerWidth - 28, 560)
      const s = Math.min(1, avail / el.offsetWidth)
      setScale(s)
      setHolderH(el.offsetHeight * s + 2)
    }
    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(el)
    window.addEventListener('resize', calc)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', calc)
    }
  }, [id])

  useEffect(() => {
    if (!isNew) return
    const t = window.setTimeout(() => {
      setParams({}, { replace: true })
    }, 4000)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew])

  if (!payment || !student) {
    return (
      <div>
        <PageHeader title="Receipt" back onBack={() => navigate(-1)} />
        <div className="text-center text-muted text-[14px] py-16">Receipt not found</div>
      </div>
    )
  }

  const fileName = receiptFileName(payment.receiptNo, payment.date)
  const dailySeq = payment.dailySeq ?? invoiceDailySeq(payment, payments)

  const messageTemplate = (center.receiptMsg || defaultCenter().receiptMsg || '').trim()
  const msgVars = {
    student: student.name,
    period: payingForDisplay(payment),
    center: center.name || defaultCenter().name,
    date: fmtDateLong(payment.date),
    batch: student.batch || '',
  }
  const fillLink = (link: string) => fillMessage(messageTemplate, { ...msgVars, link }).trim()

  const pngBlob = async (): Promise<Blob> => {
    if (payment.pngBlob) return payment.pngBlob
    const el = cardRef.current
    if (!el) throw new Error('not ready')
    let dataUrl: string
    try {
      dataUrl = await domToPng(el, { scale: 2 })
    } catch {
      dataUrl = await htmlToImageToPng(el, { pixelRatio: 2, cacheBust: true })
    }
    return fetch(dataUrl).then((r) => r.blob())
  }

  /**
   * Resolve a promise to a fallback after ms - a hung Drive fetch or an
   * iOS-PWA navigator.share must never leave the button spinning forever.
   */
  const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
    new Promise((resolve) => {
      const t = window.setTimeout(() => resolve(fallback), ms)
      p.then((v) => {
        window.clearTimeout(t)
        resolve(v)
      }).catch(() => {
        window.clearTimeout(t)
        resolve(fallback)
      })
    })

  const isIOSPWA =
    (navigator as Navigator & { standalone?: boolean }).standalone === true

  /** WhatsApp gets a direct viewable Drive link (wa.me can't attach images;
   *  sending the PNG file also doesn't auto-open for the parent). */
  const onWhatsApp = async () => {
    if (!student?.phone) {
      showToast('Add a phone number to share via WhatsApp', 'info')
      return
    }
    setWaBusy(true)
    try {
      // Bounded Drive calls - a hung fetch falls back instead of spinning.
      let link = await withTimeout(receiptViewLink(payment.id), 6000, null)
      // Freshly created receipt - the PNG may still be uploading to Drive.
      // Give it a couple of short polls (online only) before falling back.
      if (!link && navigator.onLine) {
        for (let i = 0; !link && i < 2; i++) {
          await new Promise((r) => setTimeout(r, 1500))
          link = await withTimeout(receiptViewLink(payment.id), 6000, null)
        }
      }
      if (!link && payment.pngFileId) {
        log('info', `Retrying ensurePublic for receipt #${payment.receiptNo}`)
        link = await withTimeout(retryEnsurePublic(payment.id), 6000, null)
      }
      if (link) {
        const text = fillLink(link)
        log('info', `WhatsApp link-based share for receipt #${payment.receiptNo}`)
        openExternal(waLink(student.phone, text))
        return
      }
      log('warn', `Receipt #${payment.receiptNo} has no Drive link (pngFileId: ${payment.pngFileId || 'none'})`)
      // iOS standalone PWA: navigator.share({files}) can hang without ever
      // resolving - use the same plain wa.me path as the Remind button,
      // which works on every device.
      if (isIOSPWA) {
        openExternal(waLink(student.phone, fillLink('')))
        return
      }
      // PNG not uploaded yet (e.g. offline) - share the image file instead.
      try {
        const blob = await withTimeout(pngBlob(), 10000, null)
        if (!blob) {
          openExternal(waLink(student.phone, fillLink('')))
          return
        }
        const file = new File([blob], fileName, { type: 'image/png' })
        const nav = navigator as Navigator & {
          canShare?: (d: { files: File[] }) => boolean
        }
        if (nav.canShare && nav.canShare({ files: [file] })) {
          // Timeout so a hanging share sheet never locks the button; we do
          // NOT fall through to openExternal on timeout (double-open risk).
          await withTimeout(
            navigator.share({
              files: [file],
              text: fillLink(''),
              title: `Invoice ${fmtInvoiceNo(payment.date, dailySeq)}`,
            }),
            8000,
            undefined,
          )
        } else {
          openExternal(waLink(student.phone, fillLink('')))
        }
      } catch {
        /* user closed the share sheet */
      }
    } catch (e) {
      log('error', `Failed to get receipt link: ${e instanceof Error ? e.message : e}`)
      // Last resort - never leave the user stuck on the button.
      openExternal(waLink(student.phone, fillLink('')))
    } finally {
      setWaBusy(false)
    }
  }

  const onShare = async () => {
    try {
      const blob = await pngBlob()
      const file = new File([blob], fileName, { type: 'image/png' })
      const nav = navigator as Navigator & {
        canShare?: (d: { files: File[] }) => boolean
      }
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `Invoice ${fmtInvoiceNo(payment.date, dailySeq)}` })
      } else if (navigator.share) {
        await navigator.share({
          title: `Invoice ${fmtInvoiceNo(payment.date, dailySeq)}`,
          text: `${student.name} · ${payment.mode} · ${fileName}`,
        })
      } else {
        await onDownload()
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        // fall through to download silently
        await onDownload()
      }
    }
  }

  const onDownload = async () => {
    const blob = await pngBlob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      {isNew && (
        <div className="bg-emerald-600 text-white text-center text-[13.5px] font-semibold py-2.5">
          ✓ Receipt created and saved to Drive
        </div>
      )}

      <div className="no-print">
        <PageHeader
          title={`Invoice ${fmtInvoiceNo(payment.date, dailySeq)}`}
          subtitle={`${student.name} · ${payment.mode}`}
          back
          onBack={() => (isNew ? navigate(`/student/${student.id}`) : navigate(-1))}
        />
      </div>

      {/* Receipt (scaled to fit) */}
      <div className="flex justify-center px-2.5 no-print">
        <div style={{ height: holderH }} className="flex justify-center w-full max-w-[560px]">
          <div style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}>
            <div ref={cardRef}>
              <ReceiptCard
                center={center.name ? center : defaultCenter()}
                student={student}
                payment={payment}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Print-only copy */}
      <div className="print-area" style={{ display: 'none' }}>
        <ReceiptCard center={center.name ? center : defaultCenter()} student={student} payment={payment} />
      </div>

      {/* Actions */}
      <div className="px-4 pb-6 pt-4 grid grid-cols-2 gap-2.5 no-print">
        <Button variant="secondary" size="lg" onClick={() => window.print()}>
          <IconPrint className="w-5 h-5" /> Print
        </Button>
        <Button size="lg" onClick={() => void onDownload()}>
          <IconDownload className="w-5 h-5" /> Save PNG
        </Button>
        <Button
          variant="secondary"
          size="lg"
          className="!text-teal dark:!text-teal-bright"
          onClick={() => void onShare()}
        >
          <IconShare className="w-5 h-5" /> Share
        </Button>
        <Button
          variant="secondary"
          size="lg"
          className="!text-teal dark:!text-teal-bright"
          onClick={() => void onWhatsApp()}
          disabled={waBusy || !student.phone}
          title={!student.phone ? 'Add a phone number to share via WhatsApp' : undefined}
        >
          <IconWhatsApp className="w-5 h-5" /> {waBusy ? 'Sharing…' : 'WhatsApp'}
        </Button>
      </div>

      <div className="pb-8" />
    </div>
  )
}
