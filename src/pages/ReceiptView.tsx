import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toPng } from 'html-to-image'
import { useApp } from '../state/AppContext'
import { receiptFileName, periodLabel } from '../lib/format'
import { Button, PageHeader } from '../components/ui'
import { ReceiptCard } from '../components/ReceiptCard'
import { IconPrint, IconShare, IconDownload, IconWhatsApp } from '../components/Icons'
import { defaultCenter, receiptViewLink, retryEnsurePublic } from '../lib/sync'
import { waLink } from '../lib/phone'
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

  const pngBlob = async (): Promise<Blob> => {
    if (payment.pngBlob) return payment.pngBlob
    const el = cardRef.current
    if (!el) throw new Error('not ready')
    const dataUrl = await toPng(el, { pixelRatio: 2, cacheBust: true })
    return fetch(dataUrl).then((r) => r.blob())
  }

  /** WhatsApp gets a direct viewable Drive link (wa.me can't attach images;
   *  sending the PNG file also doesn't auto-open for the parent). */
  const onWhatsApp = async () => {
    if (!student?.phone) {
      showToast('Add a phone number to share via WhatsApp', 'info')
      return
    }
    setWaBusy(true)
    try {
      // Try to get the public Drive link first
      let link = await receiptViewLink(payment.id)
      // If not available yet (receipt still uploading), retry once
      if (!link && payment.pngFileId) {
        log('info', `Retrying ensurePublic for receipt #${payment.receiptNo}`)
        link = await retryEnsurePublic(payment.id)
      }
      if (link) {
        const text = `Here is the receipt for ${student.name} (${periodLabel(payment.period)}): ${link}`
        log('info', `WhatsApp link-based share for receipt #${payment.receiptNo}`)
        window.open(waLink(student.phone, text), '_blank')
        return
      }
      // Link not available — receipt may not be synced yet
      log('warn', `Receipt #${payment.receiptNo} has no Drive link (pngFileId: ${payment.pngFileId || 'none'})`)
      showToast('Receipt not yet on Drive — sharing image instead', 'info')
    } catch (e) {
      log('error', `Failed to get receipt link: ${e instanceof Error ? e.message : e}`)
      showToast('Could not get receipt link — sharing image instead', 'info')
    }
    // PNG not uploaded yet (e.g. offline) — share the image file instead
    try {
      const blob = await pngBlob()
      const file = new File([blob], fileName, { type: 'image/png' })
      const nav = navigator as Navigator & {
        canShare?: (d: { files: File[] }) => boolean
      }
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          text: `Here is the receipt for ${student.name} (${periodLabel(payment.period)})`,
          title: `Receipt #${payment.receiptNo}`,
        })
      } else {
        window.open(waLink(student.phone, `Here is the receipt for ${student.name} (${periodLabel(payment.period)}).`), '_blank')
      }
    } catch {
      /* user closed the share sheet */
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
        await navigator.share({ files: [file], title: `Receipt #${payment.receiptNo}` })
      } else if (navigator.share) {
        await navigator.share({
          title: `Receipt #${payment.receiptNo}`,
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

      <PageHeader
        title={`Receipt #${String(payment.receiptNo).padStart(4, '0')}`}
        subtitle={`${student.name} · ${payment.mode}`}
        back
        onBack={() => (isNew ? navigate(`/student/${student.id}`) : navigate(-1))}
      />

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
