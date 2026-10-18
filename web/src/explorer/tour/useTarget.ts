'use client'

import { useEffect, useState } from 'react'

export type Box = { x: number; y: number; w: number; h: number }
export type Target = { box: Box | null; missing: boolean; waiting: boolean }

const EMPTY: Target = { box: null, missing: false, waiting: false }

export const targetSelector = (name: string) => `[data-tour~="${name}"]`

/**
 * Finds the element marked `data-tour="<name>"` and follows its position every frame, so the spotlight keeps up
 * with scrolling, resizing, sheets sliding in and cards tilting. A target that has not appeared after `timeoutMs`
 * is reported missing so the step can turn into plain explanation instead of a dead end.
 */
export function useTarget(name: string | undefined, timeoutMs = 25_000): Target {
  const [state, setState] = useState<Target & { name?: string }>(EMPTY)

  useEffect(() => {
    if (!name) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const started = performance.now()
    let frame = 0
    let scrolled = false
    let last = ''
    const tick = () => {
      const el = document.querySelector<HTMLElement>(targetSelector(name))
      const r = el?.getBoundingClientRect()
      const box = r && r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null
      if (el && box && !scrolled) {
        scrolled = true
        if (box.y < 72 || box.y + box.h > window.innerHeight - 24) el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
      }
      const elapsed = performance.now() - started
      const next: Target = { box, missing: !box && elapsed > timeoutMs, waiting: !box && elapsed > 1200 }
      const key = box ? `${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.w)},${Math.round(box.h)}` : `${next.missing}${next.waiting}`
      if (key !== last) { last = key; setState({ ...next, name }) }
      if (!next.missing) frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [name, timeoutMs])

  // Until the search for this name reports, nothing is known about it; never show the previous step's target.
  return name && state.name === name ? state : EMPTY
}
