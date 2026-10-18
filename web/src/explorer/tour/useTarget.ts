'use client'

import { useEffect, useState } from 'react'

export type Box = { x: number; y: number; w: number; h: number }
/** `failed`: the part of the page this step points at reported an error, so the step is explained instead. */
export type Target = { box: Box | null; missing: boolean; waiting: boolean; failed: boolean }

const EMPTY: Target = { box: null, missing: false, waiting: false, failed: false }

export const targetSelector = (name: string) => `[data-tour~="${name}"]`

/** A step's target: one marker, or several in priority order (the first one shown wins). */
export type TargetName = string | readonly string[]

/** The first element shown on screen for these markers, in priority order: the header tabs and the phone dock
 *  share markers, and a step can move its highlight from one control to the next. */
export function findTarget(target: TargetName): { el: HTMLElement; rect: DOMRect; name: string } | null {
  for (const name of typeof target === 'string' ? [target] : target) {
    for (const el of document.querySelectorAll<HTMLElement>(targetSelector(name))) {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) return { el, rect, name }
    }
  }
  return null
}

/**
 * Finds the element marked `data-tour="<name>"` and follows its position every frame, so the spotlight keeps up
 * with scrolling, resizing, sheets sliding in and cards tilting. A target that has not appeared after `timeoutMs`
 * is reported missing so the step can turn into plain explanation instead of a dead end.
 */
export function useTarget(target: TargetName | undefined, timeoutMs = 25_000): Target {
  const name = target === undefined ? undefined : typeof target === 'string' ? target : target.join('|')
  const [state, setState] = useState<Target & { name?: string }>(EMPTY)

  useEffect(() => {
    if (!name) return
    const names = name.split('|')
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const started = performance.now()
    let frame = 0
    let scrolled = ''
    let last = ''
    const tick = () => {
      const found = findTarget(names)
      const el = found?.el
      const r = found?.rect
      const box = r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null
      if (el && box && scrolled !== found.name) {
        scrolled = found.name
        // On a phone the card takes the bottom of the screen, so the highlight goes to the top of its scroller.
        const phone = window.innerWidth < 640
        if (phone ? box.y < 64 || box.y + box.h > window.innerHeight * 0.4 : box.y < 72 || box.y + box.h > window.innerHeight - 24) {
          el.scrollIntoView({ block: phone ? 'start' : 'center', behavior: reduce ? 'auto' : 'smooth' })
        }
      }
      const elapsed = performance.now() - started
      const failed = names.some((n) => document.querySelector(`[data-tour-failed~="${n}"]`))
      const next: Target = { box, missing: !box && elapsed > timeoutMs, waiting: !box && elapsed > 1200, failed }
      const key = `${box ? `${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.w)},${Math.round(box.h)}` : `${next.missing}${next.waiting}`}${failed}`
      if (key !== last) { last = key; setState({ ...next, name }) }
      if (!next.missing) frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [name, timeoutMs])

  // Until the search for this name reports, nothing is known about it; never show the previous step's target.
  return name && state.name === name ? state : EMPTY
}
