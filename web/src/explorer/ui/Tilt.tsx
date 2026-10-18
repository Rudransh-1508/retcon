'use client'

import type { ReactNode } from 'react'
import { m, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion'
import { cn } from '@/lib/utils'

/**
 * A card that leans toward the pointer and lights up where it points. Children that should float above
 * the surface take `translate-z-*` utilities (the card preserves 3D). Touch and reduced motion get a flat card.
 */
export function TiltCard({ children, className, max = 7 }: { children: ReactNode; className?: string; max?: number }) {
  const reduce = useReducedMotion()
  const px = useMotionValue(0.5)
  const py = useMotionValue(0.5)
  const sx = useSpring(px, { stiffness: 220, damping: 22, mass: 0.4 })
  const sy = useSpring(py, { stiffness: 220, damping: 22, mass: 0.4 })
  const rotateY = useTransform(sx, [0, 1], [-max, max])
  const rotateX = useTransform(sy, [0, 1], [max, -max])
  const spotX = useTransform(sx, (v) => `${v * 100}%`)
  const spotY = useTransform(sy, (v) => `${v * 100}%`)
  const spot = useMotionTemplate`radial-gradient(220px circle at ${spotX} ${spotY}, color-mix(in srgb, var(--held) 14%, transparent), transparent 70%)`

  return (
    <m.div
      className={cn('group/tilt relative transform-3d rounded-xl border border-line bg-panel/90 transition-[border-color,box-shadow] duration-200 hover:border-ink/25 hover:shadow-[0_18px_32px_-22px_color-mix(in_srgb,var(--ink)_60%,transparent)]', className)}
      style={reduce ? undefined : { rotateX, rotateY, transformPerspective: 900 }}
      onPointerMove={(e) => {
        if (reduce || e.pointerType !== 'mouse') return
        const r = e.currentTarget.getBoundingClientRect()
        px.set((e.clientX - r.left) / r.width)
        py.set((e.clientY - r.top) / r.height)
      }}
      onPointerLeave={() => { px.set(0.5); py.set(0.5) }}
    >
      {!reduce && (
        <m.span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-200 group-hover/tilt:opacity-100" style={{ background: spot }} />
      )}
      {children}
    </m.div>
  )
}
