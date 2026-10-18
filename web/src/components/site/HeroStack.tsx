'use client'

import { useEffect, useState } from 'react'
import { m, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion'
import { Pause, Play } from 'lucide-react'
import { ease } from './motion'

// The real gladys / jsonwebtoken case: four advisories land, the RCE claim is withdrawn,
// Triage's judgment that rested on it is retracted, and the upgrade stays open on the three that hold.

const W = 300
const H = 200
const GAP = 92
const PLATES = ['advisories', 'exposure · judgment', 'decision', 'pull request'] as const

type Point = { x: number; y: number; level: number }
type NodeId = 'a1' | 'a2' | 'a3' | 'a4' | 'exp' | 'jdg' | 'dec' | 'pr'

const NODES: Record<NodeId, Point & { title: string; sub: string }> = {
  a1: { level: 0, x: 78, y: 58, title: 'GHSA-27h2', sub: 'HIGH · RCE claim' },
  a2: { level: 0, x: 222, y: 58, title: 'GHSA-8cf7', sub: 'HIGH' },
  a3: { level: 0, x: 78, y: 142, title: 'GHSA-hjrf', sub: 'MODERATE' },
  a4: { level: 0, x: 222, y: 142, title: 'GHSA-qwph', sub: 'MODERATE' },
  jdg: { level: 1, x: 82, y: 100, title: 'Triage', sub: 'not reachable here' },
  exp: { level: 1, x: 214, y: 100, title: 'jsonwebtoken@8.5.1', sub: 'gladys depends on it' },
  dec: { level: 2, x: 150, y: 100, title: 'upgrade → 9.0.0', sub: 'P1' },
  pr: { level: 3, x: 150, y: 100, title: 'pull request', sub: 'open' },
}

const EDGES: [NodeId, NodeId][] = [
  ['a1', 'exp'], ['a2', 'exp'], ['a3', 'exp'], ['a4', 'exp'], ['a1', 'jdg'], ['jdg', 'dec'], ['exp', 'dec'], ['dec', 'pr'],
]

// Each step is one moment of the retraction; durations are how long it is shown.
const STEPS = [
  { ms: 2800, at: '2022-12-22', text: 'Four advisories land for jsonwebtoken@8.5.1.' },
  { ms: 1700, at: '2023-01-27', text: 'GitHub withdraws GHSA-27h2, the RCE claim.' },
  { ms: 1900, at: 'wave 1', text: "Triage's judgment rested on it, so it is retracted." },
  { ms: 4200, at: 'outcome', text: 'Unchanged: three advisories still hold it at P1.' },
] as const

const RETRACTED_NODES: Partial<Record<NodeId, number>> = { a1: 1, jdg: 2 }
const RETRACTED_EDGES = new Map<string, number>([['a1-exp', 2], ['a1-jdg', 2], ['jdg-dec', 2]])
const CONFIRMED = new Set(['exp-dec', 'dec-pr'])

const z = (level: number) => level * GAP

function edgeGeometry(a: Point, b: Point) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const dz = z(b.level) - z(a.level)
  const flat = Math.hypot(dx, dy)
  const phi = (Math.atan2(dy, dx) * 180) / Math.PI
  const theta = (Math.atan2(dz, flat) * 180) / Math.PI
  // Rounded so the server and the browser print the same style string.
  const r = (n: number) => Math.round(n * 100) / 100
  return {
    width: r(Math.hypot(flat, dz)),
    transform: `translate3d(${a.x}px, ${a.y}px, ${z(a.level)}px) rotateZ(${r(phi)}deg) rotateY(${r(-theta)}deg)`,
  }
}

export function HeroStack() {
  const reduce = useReducedMotion()
  const [step, setStep] = useState(0)
  const [paused, setPaused] = useState(false)
  const shown = reduce ? STEPS.length - 1 : step

  useEffect(() => {
    if (reduce || paused) return
    const t = setTimeout(() => setStep((s) => (s + 1) % STEPS.length), STEPS[step].ms)
    return () => clearTimeout(t)
  }, [step, paused, reduce])

  const px = useMotionValue(0)
  const py = useMotionValue(0)
  const sx = useSpring(px, { stiffness: 120, damping: 18 })
  const sy = useSpring(py, { stiffness: 120, damping: 18 })
  const rotateX = useTransform(sy, (v) => 56 - v * 12)
  const rotateZ = useTransform(sx, (v) => -38 + v * 14)

  function tilt(e: React.PointerEvent<HTMLDivElement>) {
    if (reduce || e.pointerType !== 'mouse') return
    const r = e.currentTarget.getBoundingClientRect()
    px.set((e.clientX - r.left) / r.width - 0.5)
    py.set((e.clientY - r.top) / r.height - 0.5)
  }

  const nodeRetracted = (id: NodeId) => (RETRACTED_NODES[id] ?? Infinity) <= shown
  const edgeRetracted = (key: string) => (RETRACTED_EDGES.get(key) ?? Infinity) <= shown

  return (
    <figure className="relative" aria-label="Retraction of the jsonwebtoken RCE advisory in the gladys project">
      <div
        className="relative mx-auto h-[320px] w-full max-w-[460px] select-none [perspective:1500px] sm:h-[460px]"
        onPointerMove={tilt}
        onPointerLeave={() => { px.set(0); py.set(0) }}
        aria-hidden="true"
      >
        <div className="absolute left-1/2 top-[60%] origin-center scale-[0.7] sm:scale-100">
          <m.div className="transform-3d relative" style={{ width: W, height: H, marginLeft: -W / 2, marginTop: -H / 2, rotateX, rotateZ }}>
            <div className="absolute inset-[-30px] rounded-[40px] bg-ink/10 blur-2xl" style={{ transform: 'translateZ(-40px)' }} />

            {PLATES.map((label, level) => (
              <m.div
                key={label}
                className="transform-3d absolute inset-0 rounded-2xl border border-ink/15 bg-panel/35 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--panel)_60%,transparent)]"
                // Visible in the server HTML (collapsed flat) so the stack paints before hydration; only the rise waits for JS.
                initial={reduce ? false : { z: 0 }}
                animate={{ z: z(level) }}
                transition={{ duration: 0.9, delay: 0.15 + level * 0.12, ease }}
              >
                <span className="absolute left-3 top-2.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
                {(Object.keys(NODES) as NodeId[]).filter((id) => NODES[id].level === level).map((id) => (
                  <Chip key={id} id={id} retracted={nodeRetracted(id)} confirmed={shown === 3 && (id === 'dec' || id === 'pr')} />
                ))}
              </m.div>
            ))}

            {EDGES.map(([from, to]) => {
              const key = `${from}-${to}`
              const geo = edgeGeometry(NODES[from], NODES[to])
              const retracted = edgeRetracted(key)
              const pulse = (retracted && shown === 2) || (CONFIRMED.has(key) && shown === 3)
              return (
                <div key={key} className="absolute left-0 top-0 h-[2px] -mt-px origin-[0_50%]" style={geo}>
                  <m.div
                    className={`h-full w-full origin-left rounded-full ${retracted ? 'bg-retract/80' : 'bg-held/55'}`}
                    initial={reduce ? false : { scaleX: 0 }}
                    animate={{ scaleX: 1, opacity: retracted ? 0.55 : 1 }}
                    transition={{ duration: 0.6, delay: reduce ? 0 : 0.9, ease }}
                  />
                  {pulse && !reduce && (
                    <m.span
                      key={`${key}-${shown}`}
                      className={`absolute -top-[3px] left-0 h-2 w-2 rounded-full ${retracted ? 'bg-retract' : 'bg-held'}`}
                      initial={{ x: 0, opacity: 0 }}
                      animate={{ x: geo.width - 8, opacity: [0, 1, 1, 0] }}
                      transition={{ duration: 0.9, ease: 'easeInOut' }}
                    />
                  )}
                </div>
              )
            })}
          </m.div>
        </div>
      </div>

      <figcaption className="mx-auto mt-2 w-full max-w-[460px] rounded-xl border border-line bg-panel/80 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">gladys · jsonwebtoken</span>
          {!reduce && (
            <button type="button" onClick={() => setPaused((p) => !p)} aria-pressed={paused}
              aria-label={paused ? 'Play the retraction' : 'Pause the retraction'}
              className="-m-2 grid h-11 w-11 place-items-center rounded-md text-muted-foreground transition-colors duration-200 hover:text-ink">
              {paused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
            </button>
          )}
        </div>
        <ol className="mt-1 grid content-start gap-1.5">
          {STEPS.map((s, i) => (
            <m.li key={s.at} className="grid grid-cols-[5.5rem_1fr] gap-2 text-[13px] leading-snug"
              aria-current={i === shown ? 'step' : undefined}
              initial={false} animate={{ opacity: i <= shown ? 1 : 0.32, x: i === shown ? 0 : i < shown ? 0 : -3 }} transition={{ duration: 0.35, ease }}>
              <span className={`font-mono text-[11.5px] leading-[1.45] ${i > shown ? 'text-muted-foreground' : i === 1 || i === 2 ? 'text-retract' : i === 3 ? 'text-held' : 'text-muted-foreground'}`}>{s.at}</span>
              <span className="text-ink">{s.text}</span>
            </m.li>
          ))}
        </ol>
      </figcaption>
    </figure>
  )
}

function Chip({ id, retracted, confirmed }: { id: NodeId; retracted: boolean; confirmed: boolean }) {
  const n = NODES[id]
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: n.x, top: n.y }}>
      <div
        className={`relative min-w-[108px] rounded-lg border px-2.5 py-1.5 transition-[border-color,background-color,opacity] duration-300 ${
          retracted ? 'border-retract/60 bg-panel/70 opacity-75' : confirmed ? 'border-held bg-held/10' : 'border-line bg-panel'
        }`}
      >
        <div className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${retracted ? 'bg-retract' : 'bg-held'}`} />
          <span className="relative whitespace-nowrap font-mono text-[10.5px] font-medium text-ink">
            {n.title}
            <m.span
              className="absolute left-[-2px] right-[-2px] top-1/2 h-[1.5px] origin-left bg-retract"
              initial={false}
              animate={{ scaleX: retracted ? 1 : 0 }}
              transition={{ duration: 0.35, ease }}
            />
          </span>
        </div>
        <div className="mt-0.5 whitespace-nowrap pl-3 font-mono text-[9.5px] text-muted-foreground">
          {id === 'pr' && confirmed ? 'open · rewritten' : id === 'jdg' && retracted ? 'retracted' : n.sub}
        </div>
      </div>
    </div>
  )
}
