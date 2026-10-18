'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { animate, m, useReducedMotion } from 'framer-motion'
import { ArrowUpRight, GitPullRequest, Search, X } from 'lucide-react'
import type { Decision, Project } from '../api'
import { GlowCard, type GlowTone } from '../ui/Glow'
import { TiltCard } from '../ui/Tilt'
import { Segmented } from '../ui/Segmented'
import { Empty, ErrorNote, Skeleton } from '../ui/States'
import { StatusPill, Urgency } from '../ui/Urgency'
import { Button } from '@/components/ui/button'
import { ease } from '@/components/site/motion'
import { cn } from '@/lib/utils'
import { plural } from '../format'

type UrgencyFilter = 'all' | 'P0' | 'P1' | 'P2' | 'P3'

const rank = (d: Decision) => (d.status === 'retracted' ? 9 : Number((d.urgency ?? 'P9').slice(1)))
const byUrgency = (a: Decision, b: Decision) => rank(a) - rank(b) || a.package.localeCompare(b.package)

export function Decisions({ projects, decisions, error, selected, onOpen, project, onProject }: {
  projects: Project[]; decisions: Decision[] | null; error: string | null; selected: string | null
  onOpen: (id: string) => void; project: string; onProject: (p: string) => void
}) {
  const [urgency, setUrgency] = useState<UrgencyFilter>('all')
  const [query, setQuery] = useState('')
  const [showCancelled, setShowCancelled] = useState(true)

  const all = useMemo(() => decisions ?? [], [decisions])
  const held = all.filter((d) => d.status === 'held')
  const stats: Stat[] = [
    { label: 'Open decisions', value: held.length, note: `across ${plural(projects.length, 'project')}`, tone: 'held' },
    { label: 'Urgent now', value: held.filter((d) => d.urgency === 'P0' || d.urgency === 'P1').length, note: 'P0 and P1', tone: 'held' },
    { label: 'Real pull requests', value: held.filter((d) => d.mode === 'pr').length, note: 'open on GitHub', tone: 'ink' },
    { label: 'Taken back', value: all.length - held.length, note: 'cancelled by a retraction', tone: 'retract' },
  ]

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all.filter((d) =>
      (project === 'all' || d.project === project)
      && (showCancelled || d.status === 'held')
      && (urgency === 'all' || d.urgency === urgency)
      && (!q || d.package.toLowerCase().includes(q)))
  }, [all, project, urgency, query, showCancelled])

  const groups = useMemo(() => {
    const byProject = new Map<string, Decision[]>()
    for (const d of visible) byProject.set(d.project, [...(byProject.get(d.project) ?? []), d])
    for (const list of byProject.values()) list.sort(byUrgency)
    return projects.filter((p) => byProject.has(p.id)).map((p) => ({ project: p, items: byProject.get(p.id)! }))
  }, [visible, projects])

  const counts = (u: UrgencyFilter) => all.filter((d) => (project === 'all' || d.project === project) && d.status === 'held' && (u === 'all' || d.urgency === u)).length
  const filtered = project !== 'all' || urgency !== 'all' || query !== '' || !showCancelled

  return (
    <div className="space-y-8">
      <div className="max-w-2xl">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-held">Decisions</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">What Retcon holds, and why.</h1>
        <p className="mt-2 text-muted-foreground">Every upgrade rests on advisories that still hold. Open one to see the chain, or ask what would change if a belief were wrong.</p>
      </div>

      {error && <ErrorNote>Could not load data: {error}</ErrorNote>}

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Summary">
        {stats.map((s, i) => (
          <m.li key={s.label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.05 * i, ease }}>
            <StatTile stat={s} loading={decisions === null} />
          </m.li>
        ))}
      </ul>

      <div className="z-20 -mx-4 flex flex-col gap-3 border-b border-line bg-paper/85 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:sticky lg:top-16 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Segmented label="Project" value={project} onValueChange={onProject}
            options={[{ value: 'all', label: 'All' }, ...projects.map((p) => ({ value: p.id, label: p.id }))]} />
          <Segmented label="Urgency" value={urgency} onValueChange={setUrgency}
            options={(['all', 'P0', 'P1', 'P2', 'P3'] as UrgencyFilter[]).map((u) => ({ value: u, label: u === 'all' ? 'Any' : u, count: counts(u) }))} />
        </div>
        <div className="flex items-center gap-3">
          <label className="relative block min-w-0 flex-1 lg:w-60 lg:flex-none">
            <span className="sr-only">Search packages</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search packages"
              className="h-10 w-full rounded-full border border-line bg-panel pl-9 pr-3 text-sm placeholder:text-muted-foreground" />
          </label>
          <label className="flex h-10 shrink-0 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" className="size-4 accent-[var(--held)]" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
            Show cancelled
          </label>
        </div>
      </div>

      {decisions === null && !error && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-36" />)}
        </div>
      )}

      {decisions !== null && groups.length === 0 && (
        <Empty title={filtered ? 'No decisions match these filters' : 'No decisions yet'}>
          {filtered ? 'Widen the urgency or project, or clear the search.' : 'Retcon opens decisions as soon as the worker finds an advisory that affects a project.'}
          {filtered && (
            <span className="mt-4 block">
              <Button variant="outline" onClick={() => { onProject('all'); setUrgency('all'); setQuery(''); setShowCancelled(true) }}><X />Clear filters</Button>
            </span>
          )}
        </Empty>
      )}

      {groups.map(({ project: p, items }) => (
        <section key={p.id} aria-label={p.id}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <a href={`https://github.com/${p.repo}`} target="_blank" rel="noreferrer"
              className="group inline-flex items-center gap-1 font-display text-xl font-semibold tracking-tight">
              {p.id}<ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
            </a>
            <span className="font-mono text-xs text-muted-foreground">snapshot {p.snapshot_sha.slice(0, 7)} {'·'} {p.snapshot_date} {'·'} {plural(items.length, 'decision')}</span>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((d, i) => (
              <li key={d.id} className="[perspective:1100px]"><DecisionCard decision={d} index={i} active={selected === d.id} onOpen={onOpen} /></li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

// ---- summary tiles (21st.dev spotlight card) -----------------------------------------------------------------

type Stat = { label: string; value: number; note: string; tone: GlowTone }

function StatTile({ stat, loading }: { stat: Stat; loading: boolean }) {
  return (
    <GlowCard tone={stat.tone} className="h-full gap-1 p-4 sm:p-5">
      <p className="text-[13px] text-muted-foreground">{stat.label}</p>
      <p className={cn('font-display text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl', stat.tone === 'retract' && stat.value > 0 && 'text-retract')}>
        {loading ? <span className="text-muted-foreground/40">{'–'}</span> : <CountUp value={stat.value} />}
      </p>
      <p className="text-xs text-muted-foreground">{stat.note}</p>
    </GlowCard>
  )
}

function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const reduce = useReducedMotion()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduce) { el.textContent = String(value); return }
    const controls = animate(0, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => { el.textContent = String(Math.round(v)) } })
    return () => controls.stop()
  }, [value, reduce])
  return <span ref={ref}>{value}</span>
}

// ---- decision card --------------------------------------------------------------------------------------------

function DecisionCard({ decision: d, index, active, onOpen }: { decision: Decision; index: number; active: boolean; onOpen: (id: string) => void }) {
  const held = d.status === 'held'
  const prNumber = d.pr_url?.split('/').pop()
  return (
    <m.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '0px 0px -6% 0px' }}
      transition={{ duration: 0.45, delay: (index % 6) * 0.04, ease }} className="h-full">
      <TiltCard className={cn('h-full', active && 'border-held ring-2 ring-held/25', !held && 'bg-panel/60')}>
        <button type="button" onClick={() => onOpen(d.id)} className="absolute inset-0 z-0 rounded-xl"
          aria-label={`Why: upgrade ${d.package} in ${d.project}`} />
        <div className="pointer-events-none relative z-10 flex h-full flex-col gap-3 p-4 transform-3d">
          <div className="flex items-center gap-2 translate-z-6">
            <Urgency value={held ? d.urgency : null} />
            {!held && <StatusPill held={false} label="cancelled" />}
            <span className="ml-auto" />
            {d.pr_url ? (
              <a href={d.pr_url} target="_blank" rel="noreferrer" title="Open the real pull request on GitHub"
                className="pointer-events-auto inline-flex h-6 items-center gap-1 rounded-md px-1.5 font-mono text-xs text-held ring-1 ring-held/30 ring-inset transition-colors hover:bg-held/10">
                <GitPullRequest className="size-3" aria-hidden="true" />#{prNumber}
              </a>
            ) : (
              <span className="font-mono text-[11px] text-muted-foreground">{d.mode === 'report' ? 'in report' : d.mode}</span>
            )}
          </div>
          <div className="translate-z-3">
            <p className={cn('break-all font-display text-lg font-semibold leading-tight tracking-tight', !held && 'text-muted-foreground line-through decoration-retract decoration-2')}>{d.package}</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {!held ? 'cancelled' : d.target === 'none' || !d.target ? 'no fixed release yet' : `→ ${d.target}`}
            </p>
          </div>
          <div className="mt-auto flex items-center gap-2 pt-1 text-xs text-muted-foreground">
            {held ? (<><Plates n={d.evidence.length} /><span>{plural(d.evidence.length, 'advisory', 'advisories')} hold it</span></>) : <span>No support left</span>}
          </div>
        </div>
      </TiltCard>
    </m.div>
  )
}

/** One plate per supporting advisory (up to four), stacked: the card's chain of support at a glance. */
function Plates({ n }: { n: number }) {
  const count = Math.max(1, Math.min(4, n))
  return (
    <span aria-hidden="true" className="relative inline-block h-[22px] w-[26px] [perspective:120px]">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="absolute left-1 h-[10px] w-[18px] rounded-[3px] border border-held/60 bg-held/20"
          style={{ bottom: i * 4, transform: 'rotateX(58deg) rotateZ(-30deg)', opacity: 0.55 + (i / count) * 0.45 }} />
      ))}
    </span>
  )
}
