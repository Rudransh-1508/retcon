'use client'

import { useMemo } from 'react'
import { m, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion'
import type { WhyNode } from '../api'
import { ease } from '@/components/site/motion'
import { cn } from '@/lib/utils'
import { emit } from '../tour/signals'

const ORDER = ['Plan', 'Decision', 'Judgment', 'Exposure', 'Advisory'] as const
const GAP = 38
const MAX_DOTS = 15

/** Every distinct belief the why-tree touches, grouped by kind. */
export function collectBeliefs(tree: WhyNode): Map<string, WhyNode[]> {
  const seen = new Set<string>()
  const byKind = new Map<string, WhyNode[]>()
  const visit = (n: WhyNode) => {
    if (seen.has(n.id)) return
    seen.add(n.id)
    byKind.set(n.kind, [...(byKind.get(n.kind) ?? []), n])
    for (const s of n.supports ?? []) s.premises.forEach(visit)
  }
  visit(tree)
  for (const j of (tree.judgments as WhyNode[] | undefined) ?? []) visit(j)
  for (const p of (tree.plans as { id: string; status: string }[] | undefined) ?? []) {
    if (!seen.has(p.id)) { seen.add(p.id); byKind.set('Plan', [...(byKind.get('Plan') ?? []), { id: p.id, kind: 'Plan', status: p.status, retracted_by: [] }]) }
  }
  return byKind
}

/**
 * The decision's chain of support as plates: what the decision rests on sits below it. Retracted beliefs are
 * magenta; while a what-if is open, the beliefs it would retract pulse so the damage is visible before it happens.
 */
export function SupportStack({ tree, ghost }: { tree: WhyNode; ghost?: Set<string> }) {
  const reduce = useReducedMotion()
  const beliefs = useMemo(() => collectBeliefs(tree), [tree])
  // Bottom plate first: what everything else rests on.
  const levels = ORDER.filter((k) => beliefs.has(k)).reverse()

  const px = useMotionValue(0)
  const py = useMotionValue(0)
  const sx = useSpring(px, { stiffness: 120, damping: 18 })
  const sy = useSpring(py, { stiffness: 120, damping: 18 })
  const rotateX = useTransform(sy, (v) => 58 - v * 10)
  const rotateZ = useTransform(sx, (v) => -34 + v * 14)

  const height = 150 + levels.length * GAP * 0.55

  return (
    <div
      className="relative mx-auto mt-2 h-[250px] w-full max-w-[340px] select-none [perspective:1100px] sm:h-[270px]"
      onPointerMove={(e) => {
        if (reduce || e.pointerType !== 'mouse') return
        const r = e.currentTarget.getBoundingClientRect()
        px.set((e.clientX - r.left) / r.width - 0.5)
        py.set((e.clientY - r.top) / r.height - 0.5)
      }}
      onPointerEnter={() => emit('chain-hovered')}
      onPointerLeave={() => { px.set(0); py.set(0) }}
      data-tour="support-stack"
      role="img"
      aria-label={`Chain of support: ${[...levels].reverse().map((k) => `${beliefs.get(k)!.length} ${k.toLowerCase()}`).join(', ')}`}
    >
      <div className="absolute left-1/2 top-[66%]" style={{ height }}>
        <m.div className="transform-3d relative -ml-[85px] -mt-[60px] h-[120px] w-[170px]" style={{ rotateX, rotateZ }}>
          {levels.map((kind, i) => {
            const nodes = beliefs.get(kind)!
            const shown = nodes.slice(0, MAX_DOTS)
            const cols = Math.min(5, Math.ceil(Math.sqrt(shown.length * 1.6)))
            return (
              <m.div key={kind} className="transform-3d absolute inset-0 rounded-xl border border-ink/15 bg-panel/45"
                initial={reduce ? false : { z: 0, opacity: 0 }} animate={{ z: i * GAP, opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.1 + i * 0.09, ease }}>
                <span className="absolute left-2 top-1.5 font-mono text-[8px] uppercase tracking-[0.14em] text-muted-foreground">
                  {kind} · {nodes.length}
                </span>
                <div className="absolute inset-x-3 bottom-3 top-6 grid content-center justify-center gap-1.5"
                  style={{ gridTemplateColumns: `repeat(${cols}, 14px)` }}>
                  {shown.map((n) => {
                    const would = ghost?.has(n.id)
                    const out = n.status === 'retracted' || n.status === 'superseded'
                    return (
                      <span key={n.id} title={n.id}
                        className={cn('relative size-3.5 rounded-[4px] transition-colors duration-300',
                          out ? 'bg-retract/70' : would ? 'bg-retract' : 'bg-held')}>
                        {would && !out && <span aria-hidden="true" className="absolute -inset-1 animate-ping rounded-[6px] border border-retract" />}
                      </span>
                    )
                  })}
                  {nodes.length > MAX_DOTS && <span className="col-span-full text-center font-mono text-[9px] text-muted-foreground">+{nodes.length - MAX_DOTS}</span>}
                </div>
              </m.div>
            )
          })}
        </m.div>
      </div>
    </div>
  )
}
