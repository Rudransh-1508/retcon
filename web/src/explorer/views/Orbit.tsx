'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, m, useReducedMotion } from 'framer-motion'
import { ArrowRight, Link as LinkIcon, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardTitle } from '@/components/ui/card'
import { AGENT_ICON } from '../ui/Kind'
import { ease } from '@/components/site/motion'
import { cn } from '@/lib/utils'
import { date, plural } from '../format'

/*
 * Adapted from the 21st.dev "Radial Orbital Timeline" by Jatin Yadav (MIT).
 * Changes: nodes are the four agents around Retcon's memory; the ring is tilted into the page so depth reads
 * as scale and fade; motion runs in requestAnimationFrame on refs, so it never re-renders React; the detail
 * card sits below the orbit instead of on top of it; the palette comes from our design tokens.
 */

export type OrbitAgent = { id: string; role: string; items: number; held: number; last: string; related: string[] }


export function Orbit({ agents, total, selected, onSelect }: {
  agents: OrbitAgent[]; total: number; selected: string | null; onSelect: (id: string | null) => void
}) {
  const reduce = useReducedMotion()
  const box = useRef<HTMLDivElement>(null)
  const nodes = useRef<(HTMLButtonElement | null)[]>([])
  const angle = useRef(0)
  const target = useRef<number | null>(null)
  const radius = useRef(190)
  const tilt = useRef(0.4) // how far the ring leans into the page; phones need more so the front agent clears the core
  const hovering = useRef(false)
  const visible = useRef(true)
  const [ring, setRing] = useState({ w: 380, h: 130 })

  const count = agents.length
  const place = useCallback(() => {
    for (let i = 0; i < count; i++) {
      const el = nodes.current[i]
      if (!el) continue
      const a = (i / count) * Math.PI * 2 + angle.current
      const depth = (1 + Math.sin(a)) / 2
      el.style.transform = `translate(-50%, -50%) translate(${radius.current * Math.cos(a)}px, ${radius.current * tilt.current * Math.sin(a)}px) scale(${0.74 + 0.36 * depth})`
      el.style.zIndex = String(Math.round(depth * 100))
      el.style.opacity = String(0.6 + 0.4 * depth)
    }
  }, [count])

  // Selecting an agent turns the ring until it faces front.
  useEffect(() => {
    const i = agents.findIndex((a) => a.id === selected)
    if (i < 0) { target.current = null; return }
    const goal = Math.PI / 2 - (i / count) * Math.PI * 2
    if (reduce) { angle.current = goal; place(); return }
    target.current = goal
  }, [agents, count, selected, reduce, place])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => {
      const narrow = el.clientWidth < 480
      radius.current = Math.min(300, el.clientWidth * (narrow ? 0.4 : 0.34))
      tilt.current = narrow ? 0.58 : 0.4
      setRing({ w: radius.current * 2, h: radius.current * 2 * tilt.current })
      place()
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    const io = new IntersectionObserver(([e]) => { visible.current = e.isIntersecting })
    io.observe(el)

    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (visible.current && !document.hidden) {
        if (target.current !== null) {
          let diff = (target.current - angle.current) % (Math.PI * 2)
          if (diff > Math.PI) diff -= Math.PI * 2
          if (diff < -Math.PI) diff += Math.PI * 2
          angle.current += diff * Math.min(1, dt * 6)
          if (Math.abs(diff) < 0.002) target.current = null
          place()
        } else if (!reduce && !hovering.current && selected === null) {
          angle.current += dt * 0.26
          place()
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect() }
  }, [reduce, selected, place])

  const active = agents.find((a) => a.id === selected) ?? null

  return (
    <div className="space-y-4">
      <div ref={box} onPointerEnter={() => { hovering.current = true }} onPointerLeave={() => { hovering.current = false }}
        className="relative mx-auto h-[300px] w-full max-w-4xl overflow-hidden rounded-3xl border border-line bg-panel/50 sm:h-[380px]"
        onClick={(e) => { if (e.target === e.currentTarget) onSelect(null) }}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 [background-image:radial-gradient(var(--line)_1px,transparent_1px)] [background-size:20px_20px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)]" />

        <div aria-hidden="true" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-ink/12"
          style={{ width: ring.w, height: ring.h }} />
        <div aria-hidden="true" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-dashed border-ink/8"
          style={{ width: ring.w * 1.32, height: ring.h * 1.32 }} />

        <div className="pointer-events-none absolute left-1/2 top-1/2 z-[50] -translate-x-1/2 -translate-y-1/2 text-center" aria-hidden="true">
          <div className="relative mx-auto grid size-[72px] place-items-center rounded-full bg-ink max-sm:scale-75 text-on-ink shadow-[0_14px_30px_-12px_color-mix(in_srgb,var(--ink)_70%,transparent)]">
            <span className="absolute inset-0 animate-ping rounded-full border border-held/50 [animation-duration:2.6s]" />
            <span className="absolute -inset-3 rounded-full border border-held/25" />
            <span className="font-display text-sm font-semibold leading-none">memory</span>
          </div>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground max-sm:hidden">{total} entries</p>
        </div>

        {agents.map((a, i) => {
          const Icon = AGENT_ICON[a.id]
          const on = a.id === selected
          const related = active?.related.includes(a.id)
          return (
            <button key={a.id} type="button" ref={(el) => { nodes.current[i] = el }} aria-pressed={on} aria-label={`${a.id}: ${plural(a.items, 'entry', 'entries')}`}
              onClick={(e) => { e.stopPropagation(); onSelect(on ? null : a.id) }}
              className="group absolute left-1/2 top-1/2 flex min-h-11 flex-col items-center gap-1.5 rounded-2xl p-1 will-change-transform">
              <span className={cn('relative grid size-12 place-items-center rounded-full border-2 transition-all duration-300',
                on ? 'scale-125 border-ink bg-ink text-on-ink' : related ? 'border-held bg-panel text-ink' : 'border-ink/25 bg-panel text-ink group-hover:border-ink/60')}>
                {related && <span className="absolute inset-0 animate-ping rounded-full border border-held" />}
                {Icon && <Icon className="size-5" aria-hidden="true" />}
              </span>
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold tracking-wide transition-colors', on ? 'bg-ink text-on-ink' : 'bg-paper/80 text-ink/80')}>{a.id}</span>
            </button>
          )
        })}
      </div>

      <AnimatePresence mode="wait">
        {active ? (
          <m.div key={active.id} initial={{ opacity: 0, y: 12, rotateX: -8 }} animate={{ opacity: 1, y: 0, rotateX: 0 }}
            exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }} transition={{ duration: 0.3, ease }}
            style={{ transformPerspective: 900, transformOrigin: '50% 0%' }} className="mx-auto max-w-3xl">
            <AgentDetail agent={active} agents={agents} onSelect={onSelect} />
          </m.div>
        ) : (
          <m.p key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.1 } }}
            className="mx-auto max-w-3xl text-center text-sm text-muted-foreground">
            Pick an agent to see what it does and to filter the feed below.
          </m.p>
        )}
      </AnimatePresence>
    </div>
  )
}

function AgentDetail({ agent, agents, onSelect }: { agent: OrbitAgent; agents: OrbitAgent[]; onSelect: (id: string | null) => void }) {
  const pct = agent.items === 0 ? 0 : Math.round((agent.held / agent.items) * 100)
  const out = agent.items - agent.held
  return (
    <Card className="gap-4 border-line bg-panel py-5 shadow-none">
      <div className="flex items-start justify-between gap-3 px-5">
        <div className="space-y-2">
          <Badge variant="outline" className="border-line font-mono text-[11px] uppercase tracking-wider">{plural(agent.items, 'entry', 'entries')}</Badge>
          <CardTitle className="font-display text-xl font-semibold tracking-tight">{agent.id}</CardTitle>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => onSelect(null)} aria-label="Clear agent filter"><X /></Button>
      </div>
      <CardContent className="space-y-4 px-5">
        <p className="text-sm leading-relaxed text-muted-foreground">{agent.role}</p>
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Still holding</span>
            <span className="font-mono">{pct}%{out > 0 && <span className="text-muted-foreground"> {'·'} {out} retracted or superseded</span>}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-retract/20" role="img" aria-label={`${pct}% of ${agent.id}'s entries still hold`}>
            <m.div className="h-full rounded-full bg-held" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease }} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Last active <span className="font-mono">{date(agent.last) || 'never'}</span></p>
        {agent.related.length > 0 && (
          <div className="border-t border-line pt-3">
            <h4 className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground"><LinkIcon className="size-3" aria-hidden="true" />Works with</h4>
            <div className="flex flex-wrap gap-2">
              {agent.related.map((id) => agents.some((a) => a.id === id) && (
                <Button key={id} variant="outline" size="sm" className="rounded-full border-line" onClick={() => onSelect(id)}>
                  {id}<ArrowRight />
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
