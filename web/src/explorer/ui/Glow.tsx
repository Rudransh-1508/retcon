'use client'

import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/*
 * Adapted from the 21st.dev "Spotlight Card" by Hossain Jahed (EaseMize UI Registry, license unlisted).
 * Changes: one shared pointer listener instead of one per card, the glow CSS lives once in globals.css,
 * and the hues, backdrop and shadow come from our design tokens instead of fixed blue/purple/black.
 */

const HUES = {
  held: { base: 165, spread: 30 },
  retract: { base: 335, spread: 25 },
  ink: { base: 200, spread: 60 },
} as const

export type GlowTone = keyof typeof HUES

let listeners = 0
let raf = 0
function sync(e: PointerEvent) {
  if (raf) return
  const { clientX: x, clientY: y } = e
  raf = requestAnimationFrame(() => {
    raf = 0
    const root = document.documentElement.style
    root.setProperty('--x', x.toFixed(1))
    root.setProperty('--y', y.toFixed(1))
    root.setProperty('--xp', (x / window.innerWidth).toFixed(3))
  })
}

/** Mount once near the root: every GlowCard reads the pointer from these shared variables. */
export function usePointerGlow() {
  useEffect(() => {
    if (listeners++ === 0) document.addEventListener('pointermove', sync, { passive: true })
    return () => { if (--listeners === 0) document.removeEventListener('pointermove', sync) }
  }, [])
}

export function GlowCard({ children, className, tone = 'held' }: { children: ReactNode; className?: string; tone?: GlowTone }) {
  const { base, spread } = HUES[tone]
  return (
    <div
      data-glow
      style={{ '--base': base, '--spread': spread } as CSSProperties}
      className={cn('relative grid rounded-2xl p-4 backdrop-blur-[5px]', className)}
    >
      <div data-glow />
      {children}
    </div>
  )
}
