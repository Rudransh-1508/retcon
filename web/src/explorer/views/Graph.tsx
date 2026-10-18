'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { FlaskConical, Link2, Pause, Play, RotateCcw, X } from 'lucide-react'
import { api, type Project } from '../api'
import { useResource } from '../data'
import { date } from '../format'
import { KindChip } from '../ui/Kind'
import { Segmented } from '../ui/Segmented'
import { ErrorNote, Skeleton } from '../ui/States'
import { StatusPill } from '../ui/Urgency'
import { Button } from '@/components/ui/button'
import { ease } from '@/components/site/motion'
import { GraphScene, type Palette, type Picked } from '../graph/scene'
import { LEVELS } from '../graph/layout'
import { useUrlParam } from '../useUrlParam'
import { emit } from '../tour/signals'

const PLATE_NOTE: Record<string, string> = {
  Plan: 'what the Planner chose',
  Decision: 'upgrades Retcon holds',
  Judgment: 'Triage on exploitability',
  Exposure: 'package versions in use',
  Advisory: 'outside claims',
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'))
  } catch {
    return false
  }
}

function palette(): Palette {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => css.getPropertyValue(name).trim()
  return {
    ink: v('--ink'), paper: v('--paper'), panel: v('--panel'), line: v('--line'), muted: v('--muted'),
    held: v('--held'), retract: v('--retract'), u0: v('--u0'), u1: v('--u1'), u2: v('--u2'), u3: v('--u3'),
  }
}

export function Graph({ projects, onOpen }: { projects: Project[]; onOpen: (id: string) => void }) {
  const [project, setProject] = useUrlParam('project', 'gladys')
  const active = projects.some((p) => p.id === project) ? project : projects[0]?.id ?? project
  const { data, error } = useResource(`graph:${active}`, () => api.graph(active))
  const { data: events } = useResource('events', api.events)

  const host = useRef<HTMLDivElement>(null)
  const scene = useRef<GraphScene | null>(null)
  const alive = useRef(true)
  const [picked, setPickedState] = useState<Picked | null>(null)
  const setPicked = useCallback((node: Picked | null) => { setPickedState(node); if (node) emit('belief-picked', node.id) }, [])
  // A drag of more than a few pixels on the canvas is an orbit, as far as the tour is concerned.
  const drag = useRef<{ x: number; y: number; sent: boolean } | null>(null)
  const [hover, setHover] = useState<(Picked & { x: number; y: number; width: number }) | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  const [spin, setSpin] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const spinning = useRef(spin)
  const [allLinks, setAllLinks] = useState(false)
  const links = useRef(allLinks)
  const [failure, setFailure] = useState<string | null>(() => (hasWebGL() ? null : 'WebGL is not available in this browser.'))
  const [scheme, setScheme] = useState(0)

  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const on = () => setScheme((n) => n + 1)
    mql.addEventListener('change', on)
    return () => mql.removeEventListener('change', on)
  }, [])

  useEffect(() => {
    if (!data || !host.current || !hasWebGL()) return
    const s = GraphScene.create(host.current, data, palette(), { onPick: setPicked, onHover: setHover, onError: setFailure }, spinning.current)
    if (!s) return
    s.setShowAllLinks(links.current)
    scene.current = s
    if (process.env.NODE_ENV === 'development') (window as unknown as { __retconScene?: GraphScene }).__retconScene = s  // for end-to-end checks
    return () => { s.dispose(); scene.current = null }
  }, [data, scheme, setPicked])

  const retractions = useMemo(() => (events ?? []).filter((e) => e.kind !== 'published' && e.changes.some((c) => c.decision.includes(`:${active}:`))), [events, active])

  const run = useCallback(async (label: string, job: (s: GraphScene) => Promise<void>) => {
    const s = scene.current
    if (!s) return
    setPlaying(label)
    try { await job(s) } catch (e) { setFailure(String(e instanceof Error ? e.message : e)) }
    if (alive.current) setPlaying(null)
  }, [])

  const replay = (eventId: string) => { emit('replay-started', eventId); return play(eventId) }
  const play = (eventId: string) => run('Replaying', async (s) => {
    const ev = await api.event(eventId)
    await s.playWaves(ev.waves, false, () => !alive.current)
  })
  const simulate = (id: string) => run('Simulating', async (s) => {
    const sim = await api.whatIf(id)
    await s.playWaves(sim.waves, true, () => !alive.current)
  })

  const canAsk = picked && picked.status === 'held' && ['Advisory', 'Exposure', 'Judgment'].includes(picked.kind)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-held">Graph</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">The memory, layer by layer.</h1>
          <p className="mt-2 text-muted-foreground">Each plate is one kind of belief and rests on the plates below it. Replay a withdrawal to watch the retraction travel up.</p>
        </div>
        <Segmented label="Project" value={active} onValueChange={(p) => { setProject(p); setPicked(null) }} options={projects.map((p) => ({ value: p.id, label: p.id }))} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="replay" className="text-sm text-muted-foreground">Replay a retraction</label>
        <select id="replay" data-tour="replay" disabled={!!playing || retractions.length === 0} value="" onChange={(e) => e.target.value && void replay(e.target.value)}
          className="h-10 min-w-0 max-w-full rounded-full border border-line bg-panel px-4 text-sm disabled:opacity-50">
          <option value="">{retractions.length ? 'Choose an event…' : 'No retractions yet'}</option>
          {retractions.map((e) => (
            <option key={e.id} value={e.id}>{date(e.at)} {e.kind === 'correction' ? 'correction' : 'withdrawn'} {e.advisory ?? e.target} ({e.changes.length})</option>
          ))}
        </select>
        {playing && <span role="status" className="inline-flex items-center gap-2 text-sm text-retract"><span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-retract" />{playing}</span>}
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" aria-pressed={allLinks} title="Show the links that skip a plate"
            onClick={() => { const next = !allLinks; setAllLinks(next); links.current = next; scene.current?.setShowAllLinks(next) }}>
            <Link2 />{allLinks ? 'Hide long links' : 'All links'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { scene.current?.resetView(); setPicked(null) }}><RotateCcw />Reset view</Button>
          <Button variant="ghost" size="sm" aria-pressed={spin} onClick={() => { const next = !spin; setSpin(next); spinning.current = next; scene.current?.setAutoRotate(next) }}>
            {spin ? <Pause /> : <Play />}{spin ? 'Pause' : 'Rotate'}
          </Button>
        </div>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      {failure && (
        <div data-tour-failed="graph-canvas replay">
          <ErrorNote>The 3D view could not start: {failure} The Decisions and Agents views show the same data as lists.</ErrorNote>
        </div>
      )}

      <div className="relative overflow-hidden rounded-3xl border border-line bg-panel/40" data-tour="graph-canvas"
        onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, sent: false } }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d || d.sent || !e.buttons || Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) return
          d.sent = true
          emit('graph-orbited')
        }}
        onPointerUp={() => { drag.current = null }}>
        <div ref={host} className="h-[68dvh] min-h-[440px] w-full cursor-grab active:cursor-grabbing" role="img"
          aria-label={`3D graph of ${active}: ${data ? `${data.nodes.length} beliefs on ${LEVELS.length} plates` : 'loading'}. Drag to orbit, scroll to zoom.`} />
        {!data && !error && <Skeleton className="absolute inset-0 rounded-none" />}

        <ul className="pointer-events-none absolute left-3 top-3 hidden gap-1 text-[11px] sm:grid" aria-label="Plates">
          {[...LEVELS].reverse().map((k) => (
            <li key={k} className="flex items-baseline gap-2 rounded-md bg-paper/75 px-2 py-1 backdrop-blur-sm">
              <span className="font-mono font-medium uppercase tracking-wider">{k}</span>
              <span className="text-muted-foreground">{PLATE_NOTE[k]}</span>
            </li>
          ))}
        </ul>
        <p className="pointer-events-none absolute bottom-3 right-3 hidden rounded-md bg-paper/75 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur-sm sm:block">
          Drag to orbit {'·'} scroll to zoom {'·'} click a belief
        </p>
        <p className="pointer-events-none absolute bottom-3 left-3 right-3 rounded-md bg-paper/75 px-2 py-1 text-center text-[11px] text-muted-foreground backdrop-blur-sm sm:hidden">
          Drag to orbit {'·'} pinch to zoom {'·'} tap a belief
        </p>

        <AnimatePresence>
          {hover && !picked && (
            <m.div key="tip" role="tooltip" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
              className="pointer-events-none absolute z-10 max-w-60 -translate-y-full rounded-lg border border-line bg-paper px-2.5 py-1.5 text-xs shadow-lg"
              style={{ left: Math.max(8, Math.min(hover.x + 12, hover.width - 200)), top: hover.y - 10 }}>
              <div className="flex items-center gap-1.5"><KindChip kind={hover.kind} /><span className="font-medium">{hover.label}</span></div>
              <div className="mt-1 font-mono text-[10px] text-muted-foreground">{hover.status}{hover.extra ? ` · ${hover.extra}` : ''}</div>
            </m.div>
          )}
          {picked && (
            <m.div key={picked.id} initial={{ opacity: 0, y: 14, rotateX: -10 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.28, ease }} style={{ transformPerspective: 800 }}
              className="absolute inset-x-3 bottom-12 z-10 rounded-2xl border border-line bg-paper/95 p-3.5 shadow-xl backdrop-blur-md sm:inset-x-auto sm:bottom-4 sm:left-4 sm:w-[360px]">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><KindChip kind={picked.kind} /><StatusPill held={picked.status === 'held'} label={picked.status} /></div>
                  <p className="mt-2 break-all font-mono text-xs">{picked.id}</p>
                </div>
                <Button variant="ghost" size="icon-sm" aria-label="Deselect" onClick={() => { scene.current?.select(null); setPicked(null) }}><X /></Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" className="rounded-full" onClick={() => onOpen(picked.id)}>Why?</Button>
                {canAsk && (
                  <Button size="sm" variant="outline" className="rounded-full border-retract/40 text-retract hover:bg-retract/10 hover:text-retract" disabled={!!playing} onClick={() => void simulate(picked.id)}>
                    <FlaskConical />What if wrong?
                  </Button>
                )}
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
