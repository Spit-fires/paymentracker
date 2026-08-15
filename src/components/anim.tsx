import { useEffect, useRef, useState, type ReactNode } from 'react'
import { animate, MotionConfig, type Variants } from 'motion/react'

export function AppMotion({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}

export const EASE = [0.25, 0.1, 0.25, 1] as const

/** Page-level enter/exit for route changes (App.tsx). */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.18, ease: EASE } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.13, ease: EASE } },
}

/** Fade-up for list items; delay caps at 8 items so long lists don't crawl. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: Math.min(i, 8) * 0.04, duration: 0.22, ease: EASE },
  }),
}

export const pressTap = { scale: 0.97 }
export const pressSpring = { type: 'spring', stiffness: 500, damping: 30 } as const

/** Animated money/count number: tweens from the previous value to the new one. */
export function useCountUp(value: number, duration = 0.7): number {
  const [display, setDisplay] = useState(value)
  const prev = useRef(value)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value)
      prev.current = value
      return
    }
    const controls = animate(prev.current, value, {
      duration,
      ease: EASE,
      onUpdate: (v) => {
        setDisplay(v)
        prev.current = v
      },
    })
    return () => controls.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return display
}