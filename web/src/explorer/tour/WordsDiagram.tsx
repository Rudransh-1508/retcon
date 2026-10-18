'use client'

import { useState } from 'react'
import { m, useReducedMotion } from 'framer-motion'
import { Check } from 'lucide-react'
import { KIND_ICON } from '../ui/Kind'
import { ease } from '@/components/site/motion'
import { cn } from '@/lib/utils'

// Bottom plate first: each kind of belief rests on the ones below it.
const KINDS = ['Advisory', 'Exposure', 'Judgment', 'Decision', 'Plan'] as const
type Kind = (typeof KINDS)[number]

/** What each kind of belief is, in the glossary's words. Read bottom up, no term is used before it is defined. */
export const DEFINITIONS: Record<Kind, string> = {
  Advisory: 'An outside claim, published in the GitHub Advisory Database, that some versions of a package are vulnerable.',
  Exposure: 'The belief that a project really uses one of those vulnerable versions. It rests on the advisories that name that version.',
  Judgment: 'What Triage, an agent, concluded after reading the project\'s code: is this exposure exploitable here? It rests on the advisory and the exposure it read.',
  Decision: 'The upgrade Retcon holds for one package in one project, with an urgency from P0 (most urgent) to P3. It rests on every exposure the upgrade would fix.',
  Plan: 'What the Planner, an agent, chose to do on GitHub about a decision: open a pull request, or list it in a report. It rests on the decision and the advisories it saw.',
}

const OUTCOMES = ['Cancel', 'Downgrade', 'Unchanged'] as const
type Outcome = (typeof OUTCOMES)[number]

// Fixed example content: one upgrade resting on three advisories, two critical (one a duplicate) and one moderate.
const BELIEFS: Record<Kind, string[]> = {
  Advisory: ['critical', 'duplicate', 'moderate'],
  Exposure: ['exposure'],
  Judgment: ['judgment'],
  Decision: ['decision'],
  Plan: ['plan'],
}

/** Which example beliefs each outcome retracts, what the decision's urgency becomes, and the one-sentence why. */
export const OUTCOME: Record<Outcome, { retracts: string[]; urgency: string; says: string }> = {
  Cancel: {
    retracts: ['critical', 'duplicate', 'moderate', 'exposure', 'judgment', 'decision', 'plan'],
    urgency: 'cancelled',
    says: 'Every advisory behind the upgrade was withdrawn, so nothing supports it: the decision is cancelled and its pull request is closed.',
  },
  Downgrade: {
    retracts: ['critical', 'judgment', 'plan'],
    urgency: 'P2',
    says: 'The critical advisory was withdrawn but a moderate one still holds: the decision stays, at a lower urgency, and the Planner plans again.',
  },
  Unchanged: {
    retracts: ['duplicate'],
    urgency: 'P0',
    says: 'A duplicate was withdrawn while the advisory it copied still holds: one support is gone, and nothing above it changes.',
  },
}

const GAP = 30

export function WordsDiagram({ mode, onComplete }: { mode: 'beliefs' | 'outcomes'; onComplete: () => void }) {
  const reduce = useReducedMotion()
  const [selected, setSelected] = useState<string | null>(null)
  const [seen, setSeen] = useState<Set<string>>(new Set())
  const options: readonly string[] = mode === 'beliefs' ? KINDS : OUTCOMES
  const outcome = mode === 'outcomes' && selected ? OUTCOME[selected as Outcome] : null
  const nextUp = mode === 'beliefs' ? KINDS.find((k) => !seen.has(k)) : undefined

  const pick = (option: string) => {
    setSelected(option)
    const next = new Set(seen).add(option)
    setSeen(next)
    if (next.size === options.length && seen.size < options.length) onComplete()
  }

  // A plate changes when the outcome retracts a belief on it, or (the Decision plate) changes its urgency.
  const changes = (kind: Kind) => !!outcome && (BELIEFS[kind].some((b) => outcome.retracts.includes(b)) || (kind === 'Decision' && outcome.urgency !== 'P0'))
  const changed = KINDS.filter(changes)

  const transition = reduce ? { duration: 0 } : { duration: 0.35, ease }
  const said = selected ? (mode === 'beliefs' ? DEFINITIONS[selected as Kind] : OUTCOME[selected as Outcome].says) : null
  const unit = mode === 'beliefs' ? 'plates' : 'outcomes'

  return (
    <div className="mt-4" data-tour-diagram={mode}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        {/* The plates are a picture of the chain; the buttons beside them are how it is used, by pointer or keyboard. */}
        <div aria-hidden="true" className="relative h-[200px] [perspective:900px]">
          <div className="absolute left-1/2 top-[70%] -ml-[70px] -mt-[48px] h-[96px] w-[140px] transform-3d" style={{ transform: 'rotateX(58deg) rotateZ(-34deg)' }}>
            {KINDS.map((kind, i) => {
              const on = mode === 'beliefs' && selected === kind
              const read = mode === 'outcomes' || seen.has(kind)
              return (
                <m.div key={kind} onClick={mode === 'beliefs' ? () => pick(kind) : undefined}
                  className={cn('absolute inset-0 rounded-xl border transform-3d', mode === 'beliefs' && 'cursor-pointer',
                    on ? 'border-held bg-held/20' : changes(kind) ? 'border-retract/70 bg-retract/10' : 'border-ink/15 bg-panel/50')}
                  initial={false} animate={{ z: i * GAP + (on ? 10 : 0) }} transition={transition}>
                  <span className="absolute left-2 top-1 font-mono text-[8px] uppercase tracking-[0.14em] text-muted-foreground">{kind}</span>
                  <div className="absolute inset-x-2 bottom-2 top-4 flex flex-wrap content-center items-center justify-center gap-1.5">
                    {BELIEFS[kind].map((b) => {
                      const gone = outcome?.retracts.includes(b)
                      return <span key={b} className={cn('size-3 rounded-[3px] transition-colors duration-300 motion-reduce:transition-none', gone ? 'bg-retract' : read ? 'bg-held' : 'bg-ink/20')} />
                    })}
                    {kind === 'Decision' && mode === 'outcomes' && (
                      <span className={cn('font-mono text-[8px] font-semibold', outcome?.urgency === 'cancelled' ? 'text-retract line-through' : 'text-ink')}>
                        {outcome?.urgency === 'P2' ? 'P0 → P2' : outcome?.urgency === 'cancelled' ? 'cancelled' : 'P0'}
                      </span>
                    )}
                  </div>
                </m.div>
              )
            })}
          </div>
        </div>

        <ul aria-label={mode === 'beliefs' ? 'Kinds of belief, from the bottom up' : 'Outcomes'} className="grid gap-1.5">
          {(mode === 'beliefs' ? [...KINDS].reverse() : OUTCOMES).map((option) => {
            const Icon = mode === 'beliefs' ? KIND_ICON[option] : null
            const on = selected === option
            return (
              <li key={option}>
                <button type="button" aria-pressed={on} onClick={() => pick(option)}
                  className={cn('relative flex h-9 w-full min-w-32 items-center gap-2 rounded-lg border px-2.5 text-left text-sm font-medium transition-colors duration-200 motion-reduce:transition-none',
                    on ? (mode === 'outcomes' && option !== 'Unchanged' ? 'border-retract bg-retract/10' : 'border-held bg-held/10') : 'border-line bg-panel hover:border-ink/30',
                    nextUp === option && !on && 'ring-2 ring-held/40')}>
                  {Icon && <Icon className="size-4 text-muted-foreground" aria-hidden="true" />}
                  <span className="flex-1">{option}</span>
                  {seen.has(option) && <><Check className="size-3.5 text-held" aria-hidden="true" /><span className="sr-only">, {mode === 'beliefs' ? 'read' : 'seen'}</span></>}
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <div role="status" aria-live="polite" className="mt-3 min-h-[4.5rem] rounded-xl border border-line bg-panel p-3 text-sm leading-relaxed">
        {selected ? (
          <>
            <p><b className="font-semibold">{selected}.</b> <span className="text-muted-foreground">{said}</span></p>
            {outcome && <p className="mt-1 text-xs"><span className="text-muted-foreground">Plates that change:</span> {changed.join(', ')}</p>}
          </>
        ) : (
          <p className="text-muted-foreground">{mode === 'beliefs' ? 'Start with Advisory, the bottom plate.' : 'Each outcome recolours the beliefs it retracts in magenta.'}</p>
        )}
        <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">{seen.size} of {options.length} {unit} {mode === 'beliefs' ? 'read' : 'seen'}</p>
      </div>
    </div>
  )
}
