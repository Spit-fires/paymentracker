const BASE = import.meta.env.BASE_URL

export function Logo({
  size = 56,
  rounded = true,
  className = '',
}: {
  size?: number
  rounded?: boolean
  className?: string
}) {
  return (
    <img
      src={`${BASE}icons/pwa-192.png`}
      alt="Utshaho Educare"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`object-cover shadow-lg ${rounded ? 'rounded-2xl' : ''} ${className}`}
    />
  )
}