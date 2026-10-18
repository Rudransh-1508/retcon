import type { GraphData, GraphNode } from '../api'

// Each kind of belief sits on its own plate; a belief rests on the plates below it.
export const LEVELS = ['Advisory', 'Exposure', 'Judgment', 'Decision', 'Plan'] as const
export type Level = (typeof LEVELS)[number]
export const levelOf = (kind: string) => Math.max(0, LEVELS.indexOf(kind as Level))

export type Placed = { x: number; z: number }

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return ((h >>> 0) % 10000) / 10000
}

const GOLDEN = 2.399963229728653 // radians: the sunflower spiral

/**
 * Decisions are the plate you read, so they fill it evenly (the best supported on the rim). Everything that rests on
 * or hangs off a decision (its exposures, judgments, plans) is placed straight above or below it, so support reads
 * as columns. Advisories go where the exposures they affect are, then every plate is spaced out so nothing overlaps.
 * Deterministic: the same graph always has the same shape.
 */
export function layout(data: GraphData, radius: number): Map<string, Placed> {
  const byId = new Map(data.nodes.map((n) => [n.id, n]))
  const placed = new Map<string, Placed>()
  const jitter = (id: string, spread: number): Placed => ({ x: (hash(id) - 0.5) * spread, z: (hash(`${id}#`) - 0.5) * spread })

  const targetsOf = new Map<string, string[]>() // premise -> the beliefs it supports
  const sourcesOf = new Map<string, string[]>() // belief -> its premises
  for (const e of data.edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue
    targetsOf.set(e.source, [...(targetsOf.get(e.source) ?? []), e.target])
    sourcesOf.set(e.target, [...(sourcesOf.get(e.target) ?? []), e.source])
  }
  const kind = (id: string) => byId.get(id)?.kind

  // 1. Decisions on a sunflower spiral. The ones with the most advisories behind them go on the rim, where the
  //    plates below have the most room for them; lightly supported ones fill the middle.
  const support = (n: GraphNode) => (sourcesOf.get(n.id) ?? []).reduce((sum, e) => sum + 1 + (sourcesOf.get(e)?.length ?? 0), 0)
  const decisions = data.nodes.filter((n) => n.kind === 'Decision').sort((a, b) => support(a) - support(b) || a.label.localeCompare(b.label))
  decisions.forEach((d, i) => {
    const r = radius * 0.9 * Math.sqrt((i + 0.5) / Math.max(1, decisions.length))
    placed.set(d.id, { x: r * Math.cos(i * GOLDEN), z: r * Math.sin(i * GOLDEN) })
  })

  // 2. What rests on a decision (or hangs off it) goes on its column.
  const beside = (id: string, around: Placed, spread: number) => {
    const j = jitter(id, spread)
    placed.set(id, { x: around.x + j.x, z: around.z + j.z })
  }
  for (const n of data.nodes) {
    if (n.kind === 'Exposure') {
      const d = (targetsOf.get(n.id) ?? []).find((t) => kind(t) === 'Decision')
      if (d) beside(n.id, placed.get(d)!, 0.9)
    } else if (n.kind === 'Judgment') {
      const d = (targetsOf.get(n.id) ?? []).find((t) => kind(t) === 'Decision')
      if (d) beside(n.id, placed.get(d)!, 0.9)
    } else if (n.kind === 'Plan') {
      const d = (sourcesOf.get(n.id) ?? []).find((s) => kind(s) === 'Decision')
      if (d) beside(n.id, placed.get(d)!, 0.7)
    }
  }

  // 3. Advisories at the average of the beliefs they support; anything still unplaced goes by id.
  const average = (ids: string[]): Placed | null => {
    const known = ids.map((i) => placed.get(i)).filter((p): p is Placed => !!p)
    if (!known.length) return null
    return { x: known.reduce((s, p) => s + p.x, 0) / known.length, z: known.reduce((s, p) => s + p.z, 0) / known.length }
  }
  for (const n of data.nodes) {
    if (n.kind !== 'Advisory') continue
    const at = average(targetsOf.get(n.id) ?? [])
    placed.set(n.id, at ? { x: at.x + jitter(n.id, 0.6).x, z: at.z + jitter(n.id, 0.6).z } : { x: jitter(n.id, radius * 1.6).x, z: jitter(n.id, radius * 1.6).z })
  }
  for (const n of data.nodes) if (!placed.has(n.id)) placed.set(n.id, jitter(n.id, radius * 1.6))

  // 4. Space every plate out: repel neighbours, keep each belief near where it was put.
  for (const level of LEVELS) {
    const ids = data.nodes.filter((n) => n.kind === level).map((n) => n.id)
    if (ids.length < 2 || level === 'Decision') continue
    const anchor = ids.map((id) => ({ ...placed.get(id)! }))
    const pos = anchor.map((p) => ({ ...p }))
    const gap = Math.min(2.6, 0.78 * Math.sqrt((Math.PI * radius * radius) / ids.length))
    for (let it = 0; it < 90; it++) {
      const fx = new Float32Array(ids.length)
      const fz = new Float32Array(ids.length)
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const dx = pos[i].x - pos[j].x
          const dz = pos[i].z - pos[j].z
          const d = Math.hypot(dx, dz) || 0.001
          if (d >= gap) continue
          const push = ((gap - d) / d) * 0.5
          fx[i] += dx * push; fz[i] += dz * push; fx[j] -= dx * push; fz[j] -= dz * push
        }
        fx[i] += (anchor[i].x - pos[i].x) * 0.06
        fz[i] += (anchor[i].z - pos[i].z) * 0.06
      }
      for (let i = 0; i < ids.length; i++) {
        pos[i].x += fx[i]
        pos[i].z += fz[i]
        const r = Math.hypot(pos[i].x, pos[i].z)
        if (r > radius) { pos[i].x *= radius / r; pos[i].z *= radius / r }
      }
    }
    ids.forEach((id, i) => placed.set(id, pos[i]))
  }
  return placed
}
