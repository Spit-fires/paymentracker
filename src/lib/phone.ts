/** Normalize a phone to international format (Bangladesh +88). */
export function waPhone(phone: string): string {
  let d = phone.replace(/\D/g, '')
  if (d.startsWith('0')) d = '88' + d
  if (!d.startsWith('88')) d = '880' + d
  return d
}

/** wa.me link, with or without a phone number. */
export function waLink(phone: string | undefined, text: string): string {
  const base = phone ? `https://wa.me/${waPhone(phone)}` : 'https://wa.me'
  return `${base}?text=${encodeURIComponent(text)}`
}

/**
 * Open an external URL in a new tab. Uses a real <a> click instead of
 * window.open - iOS Safari / standalone PWAs block window.open or show
 * "Safari cannot open the page" errors, while anchor navigation works.
 */
export function openExternal(url: string): void {
  const a = document.createElement('a')
  a.href = url
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
