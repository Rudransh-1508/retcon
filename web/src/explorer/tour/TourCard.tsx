'use client'

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { m, useReducedMotion } from 'framer-motion'
import { ArrowLeft, Check, Copy, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ease } from '@/components/site/motion'
import { cn } from '@/lib/utils'
import type { Step } from './script'
import type { Target } from './useTarget'
import { WordsDiagram } from './WordsDiagram'

const GAP = 14
const MARGIN = 12

/** Where the card goes: beside the target on wide screens, a bottom card on phones, centred with no target. */
function place(target: Target['box'], size: { w: number; h: number }, phone: boolean): CSSProperties {
  if (phone) return { left: MARGIN, right: MARGIN, bottom: `calc(${MARGIN}px + env(safe-area-inset-bottom))` }
  const vw = window.innerWidth, vh = window.innerHeight
  if (!target) return { left: Math.max(MARGIN, (vw - size.w) / 2), top: Math.max(MARGIN, (vh - size.h) / 2) }
  const clampX = (x: number) => Math.min(Math.max(MARGIN, x), vw - size.w - MARGIN)
  const clampY = (y: number) => Math.min(Math.max(MARGIN, y), vh - size.h - MARGIN)
  const centreX = target.x + target.w / 2 - size.w / 2
  if (target.y + target.h + GAP + size.h <= vh - MARGIN) return { left: clampX(centreX), top: target.y + target.h + GAP }
  if (target.y - GAP - size.h >= MARGIN) return { left: clampX(centreX), top: target.y - GAP - size.h }
  if (target.x + target.w + GAP + size.w <= vw - MARGIN) return { left: target.x + target.w + GAP, top: clampY(target.y) }
  if (target.x - GAP - size.w >= MARGIN) return { left: target.x - GAP - size.w, top: clampY(target.y) }
  return { left: clampX(centreX), bottom: MARGIN }
}

export function TourCard({ step, index, total, target, onNext, onBack, onSkipTour }: {
  step: Step; index: number; total: number; target: Target
  onNext: () => void; onBack: () => void; onSkipTour: () => void
}) {
  const reduce = useReducedMotion()
  const card = useRef<HTMLDivElement>(null)
  const keep = useRef<HTMLButtonElement>(null)
  const [confirming, setConfirming] = useState(false)
  const [size, setSize] = useState({ w: 400, h: 240 })
  const [phone, setPhone] = useState(() => window.matchMedia('(max-width: 639px)').matches)
  const [copied, setCopied] = useState(false)
  // A diagram step moves on only once every part of the diagram has been clicked (Skip step always works).
  const [explored, setExplored] = useState(!step.diagram)

  // A step whose target never appeared is explained in place, with a Next button, instead of waiting forever.
  const degraded = !!step.target && (target.missing || target.failed)
  const handsOn = step.done !== 'next' && !degraded
  const ids = { title: `tour-title-${step.id}`, body: `tour-body-${step.id}` }

  // Each step's card takes focus as it mounts, so screen readers read its title and explanation and the keyboard starts in the card.
  useEffect(() => { card.current?.focus({ preventScroll: true }) }, [])
  useEffect(() => { if (confirming) keep.current?.focus() }, [confirming])

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 639px)')
    const on = () => setPhone(mql.matches)
    mql.addEventListener('change', on)
    return () => mql.removeEventListener('change', on)
  }, [])

  useLayoutEffect(() => {
    if (!card.current) return
    // The border box, not contentRect: the card's padding counts when placing it clear of the target.
    const ro = new ResizeObserver(([e]) => { const r = e.target.getBoundingClientRect(); setSize({ w: r.width, h: r.height }) })
    ro.observe(card.current)
    return () => ro.disconnect()
  }, [])

  // Escape offers to leave; a second Escape takes the offer back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      setConfirming((c) => !c)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const copy = async () => {
    try { await navigator.clipboard.writeText(step.code!); setCopied(true) } catch { /* clipboard blocked; the text stays selectable */ }
  }

  return (
    <m.div ref={card} role="dialog" aria-modal="false" aria-labelledby={ids.title} aria-describedby={ids.body} tabIndex={-1}
      data-tour-layer="card"
      className={cn('fixed z-[70] rounded-2xl border border-line bg-paper p-5 text-ink shadow-[0_24px_60px_-20px_rgb(0_0_0/0.55)] outline-none',
        // On a phone the card must leave the highlighted control visible; with no target it can use the screen.
        phone ? cn('overflow-y-auto', step.target ? 'max-h-[60dvh]' : 'max-h-[85dvh]') : step.diagram ? 'w-[min(32rem,calc(100vw-24px))]' : 'w-[min(26rem,calc(100vw-24px))]')}
      style={place(target.box, size, phone)}
      initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={reduce ? { duration: 0 } : { duration: 0.25, ease }}>
      <div className="flex items-center gap-3">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-held">Tour {'·'} {index + 1} of {total}</p>
        <div aria-hidden="true" className="h-1 flex-1 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-held transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${((index + 1) / total) * 100}%` }} />
        </div>
      </div>

      <h2 id={ids.title} className="mt-3 font-display text-xl font-semibold leading-tight tracking-tight">{step.title}</h2>
      <div id={ids.body} className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">
        <p>{step.body}</p>
        {step.action && !degraded && (
          <p className={cn(handsOn ? 'flex items-start gap-2 font-medium text-ink' : '')}>
            {handsOn && <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-held" />}
            {step.action}
          </p>
        )}
      </div>

      {step.diagram && <WordsDiagram mode={step.diagram} onComplete={() => setExplored(true)} />}

      {step.code && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-line bg-panel p-2.5">
          <code className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed">{step.code}</code>
          <Button variant="ghost" size="icon-sm" onClick={copy} aria-label={copied ? 'Copied' : 'Copy the command'}>{copied ? <Check /> : <Copy />}</Button>
        </div>
      )}

      <p role="status" aria-live="polite" className="mt-2 text-xs text-muted-foreground empty:hidden">
        {degraded && target.failed ? 'That part of the page is not available right now, so here is what it would show. Press Next to carry on.'
          : degraded ? 'That part of the page did not appear, so here is what it would show. Press Next to carry on.'
          : step.target && target.waiting ? 'Waiting for this part of the page to load. You can skip this step.' : ''}
      </p>

      {confirming ? (
        <div className="mt-4 rounded-xl border border-line bg-panel p-3">
          <p className="text-sm font-medium">Skip the tour?</p>
          <p className="mt-0.5 text-xs text-muted-foreground">You can replay it any time from the Tour button.</p>
          <div className="mt-3 flex justify-end gap-2">
            <Button ref={keep} variant="outline" size="sm" onClick={() => setConfirming(false)}>Keep going</Button>
            <Button size="sm" onClick={onSkipTour}>Skip tour</Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-2">
          {index > 0 && <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft />Back</Button>}
          <span className="flex-1" />
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setConfirming(true)}><X />Skip tour</Button>
          {(handsOn || !explored) && <Button variant="outline" size="sm" onClick={onNext}>Skip step</Button>}
          {!handsOn && explored && <Button size="sm" onClick={onNext}>{degraded ? 'Next' : step.cta ?? 'Next'}</Button>}
        </div>
      )}
    </m.div>
  )
}
