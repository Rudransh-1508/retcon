'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { DEEP_LINK_PARAMS, FORCE_PARAM, tourMemory } from './memory'
import { STEPS, type Step, type View } from './script'
import { listen } from './signals'
import { Spotlight } from './Spotlight'
import { TourCard } from './TourCard'
import { targetSelector, useTarget } from './useTarget'

type Status = 'idle' | 'running' | 'done'
type Tour = { status: Status; index: number; step: Step | null; start: () => void }

const TourContext = createContext<Tour>({ status: 'idle', index: 0, step: null, start: () => {} })
export const useTour = () => useContext(TourContext)

/**
 * The tour's state machine (idle, running, done) and its memory. It starts by itself on a first visit once the
 * Decisions list has loaded, never on a deep link, and always with the forced-start parameter. Finishing and
 * skipping both mark it done for this browser.
 */
export function TourProvider({ ready, failed, onView, onOpenWhy, onCloseWhy, children }: {
  /** The Decisions list has loaded, so every step has something real to point at. */
  ready: boolean
  /** The Decisions list failed: the tour stays out of the way of the error. */
  failed: boolean
  onView: (view: View) => void
  /** Open the Why panel on the first Decision, unless it is already open. */
  onOpenWhy: () => void
  onCloseWhy: () => void
  children: React.ReactNode
}) {
  const [status, setStatus] = useState<Status>('idle')
  const [index, setIndex] = useState(0)
  const step = status === 'running' ? STEPS[index] : null
  const view = useRef(onView)
  const openWhy = useRef(onOpenWhy)
  const closeWhy = useRef(onCloseWhy)
  useEffect(() => { view.current = onView; openWhy.current = onOpenWhy; closeWhy.current = onCloseWhy })

  const go = useCallback((i: number) => {
    const next = STEPS[i]
    if (next.view) view.current(next.view)
    if (next.why === 'closed') closeWhy.current()
    if (next.why === 'open') openWhy.current()
    setIndex(i)
  }, [])
  const start = useCallback(() => { setStatus('running'); go(0) }, [go])
  const stop = useCallback(() => { tourMemory.remember(); setStatus('done'); setIndex(0) }, [])
  const next = useCallback(() => { if (index + 1 < STEPS.length) go(index + 1); else stop() }, [index, go, stop])
  const back = useCallback(() => { if (index > 0) go(index - 1) }, [index, go])

  // How this visit arrived, read once: forced by the landing page link, or sent to something specific.
  const [entry] = useState(() => {
    const params = new URLSearchParams(location.search)
    return { forced: params.has(FORCE_PARAM), deep: DEEP_LINK_PARAMS.some((p) => params.has(p)), seen: tourMemory.seen() }
  })
  useEffect(() => {
    if (!entry.forced) return
    const url = new URL(location.href)
    url.searchParams.delete(FORCE_PARAM)
    history.replaceState(null, '', url)
  }, [entry])

  // Decide once, when the Decisions list has answered, whether this visit starts the tour.
  const [decided, setDecided] = useState(false)
  if (!decided && (ready || failed)) {
    setDecided(true)
    if (!failed && (entry.forced || (!entry.deep && !entry.seen))) { setStatus('running'); setIndex(0) }
  }

  // A hands-on step completes when the visitor does what it asks, announced through the signal bus.
  useEffect(() => {
    if (!step || step.done === 'next') return
    const want = step.done
    // Once per step: moving on can make the console emit again (the next step may open or close the Why panel).
    let fired = false
    return listen((signal, detail) => {
      if (fired || signal !== want.signal || (want.detail && want.detail !== detail)) return
      fired = true
      next()
    })
  }, [step, next])

  const value = useMemo(() => ({ status, index, step, start }), [status, index, step, start])
  return (
    <TourContext.Provider value={value}>
      {children}
      {step && <TourLayer key="tour" step={step} index={index} onNext={next} onBack={back} onSkipTour={stop} />}
    </TourContext.Provider>
  )
}

function TourLayer({ step, index, onNext, onBack, onSkipTour }: {
  step: Step; index: number; onNext: () => void; onBack: () => void; onSkipTour: () => void
}) {
  const target = useTarget(step.target)
  useFocusLoop(step.target)
  return (
    <>
      <Spotlight box={target.box} />
      <TourCard key={step.id} step={step} index={index} total={STEPS.length} target={target} onNext={onNext} onBack={onBack} onSkipTour={onSkipTour} />
    </>
  )
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Tab moves between the card and the highlighted control only, as the dim layer does for the pointer. */
function useFocusLoop(target: string | undefined) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const card = document.querySelector<HTMLElement>('[data-tour-layer="card"]')
      if (!card) return
      const spot = target ? [...document.querySelectorAll<HTMLElement>(targetSelector(target))].find((el) => el.getClientRects().length > 0) ?? null : null
      const inside = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.getClientRects().length > 0)
      const order = [...(spot ? (spot.matches(FOCUSABLE) ? [spot, ...inside(spot)] : inside(spot)) : []), ...inside(card)]
      if (order.length === 0) return
      const at = order.indexOf(document.activeElement as HTMLElement)
      e.preventDefault()
      const to = at === -1 ? (e.shiftKey ? order.length - 1 : 0) : (at + (e.shiftKey ? -1 : 1) + order.length) % order.length
      order[to].focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [target])
}
