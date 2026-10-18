'use client'

import { m, useReducedMotion } from 'framer-motion'
import { ease } from '@/components/site/motion'
import type { Box } from './useTarget'

const PAD = 6
const RADIUS = 14

function holePath(b: Box) {
  const x = b.x - PAD, y = b.y - PAD, w = b.w + PAD * 2, h = b.h + PAD * 2, r = Math.min(RADIUS, w / 2, h / 2)
  return `M${x + r},${y} H${x + w - r} A${r},${r} 0 0 1 ${x + w},${y + r} V${y + h - r} A${r},${r} 0 0 1 ${x + w - r},${y + h} H${x + r} A${r},${r} 0 0 1 ${x},${y + h - r} V${y + r} A${r},${r} 0 0 1 ${x + r},${y} Z`
}

/**
 * Dims the page and blocks every click, except inside the hole around the highlighted control, which stays exactly
 * as usable as it is outside the tour. The dim layer is one even-odd path, so the hole is genuinely not there for
 * the pointer.
 */
export function Spotlight({ box }: { box: Box | null }) {
  const reduce = useReducedMotion()
  const transition = reduce ? { duration: 0 } : { duration: 0.35, ease }
  const outer = 'M-10,-10 H100000 V100000 H-10 Z'
  return (
    <svg aria-hidden="true" data-tour-layer="dim" className="pointer-events-none fixed inset-0 z-[60] size-full">
      <m.path fillRule="evenodd" className="pointer-events-auto fill-black/55 dark:fill-black/65"
        initial={false} animate={{ d: box ? `${outer} ${holePath(box)}` : outer }} transition={transition} />
      {box && (
        <m.rect fill="none" stroke="var(--held)" strokeWidth={2} rx={RADIUS} className="drop-shadow-[0_0_12px_var(--held)]"
          initial={false} animate={{ x: box.x - PAD, y: box.y - PAD, width: box.w + PAD * 2, height: box.h + PAD * 2 }} transition={transition} />
      )}
    </svg>
  )
}
