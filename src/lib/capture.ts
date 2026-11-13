import { toBlob as htmlToImageToBlob } from 'html-to-image'
import { domToBlob } from 'modern-screenshot'

/** Capture the node at its untransformed layout size. Phones scale the
 *  on-screen receipt down to fit; capture libraries otherwise measure the
 *  scaled box and clip the right/bottom of the PNG. */
function captureBox(node: HTMLElement) {
  const width = Math.ceil(Math.max(node.offsetWidth, node.scrollWidth))
  const height = Math.ceil(Math.max(node.offsetHeight, node.scrollHeight))
  return {
    width: width > 0 ? width : undefined,
    height: height > 0 ? height : undefined,
  }
}

export async function capturePng(node: HTMLElement, scale = 2): Promise<Blob> {
  const { width, height } = captureBox(node)
  const common = {
    width,
    height,
    backgroundColor: '#ffffff',
    style: { transform: 'none', transformOrigin: 'top left' },
  }

  try {
    return await domToBlob(node, { ...common, scale })
  } catch {
    const blob = await htmlToImageToBlob(node, { ...common, pixelRatio: scale, cacheBust: true })
    if (!blob) throw new Error('Could not export PNG')
    return blob
  }
}

/** Mobile downloads need the anchor to be in the document and the object URL
 *  kept alive briefly after the click. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
