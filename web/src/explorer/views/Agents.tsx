'use client'

import { useMemo, useState } from 'react'
import { m } from 'framer-motion'
import { api, type AgentItem, type Project } from '../api'
import { useResource } from '../data'
import { date } from '../format'
import { AgentChip } from '../ui/Kind'
import { Segmented } from '../ui/Segmented'
import { Empty, ErrorNote, Skeleton } from '../ui/States'
import { StatusPill } from '../ui/Urgency'
import { Button } from '@/components/ui/button'
import { Orbit, type OrbitAgent } from './Orbit'
import { ease } from '@/components/site/motion'
import { cn } from '@/lib/utils'

const AGENTS = ['Triage', 'Planner', 'Auditor', 'Fixer'] as const
type AgentId = (typeof AGENTS)[number]

const ROLE: Record<AgentId, string> = {
  Triage: 'Finds where a project imports the affected package and calls the API the advisory names, then judges it exploitable here, not reachable here, or unclear, citing file and line.',
  Planner: 'Chooses what to do on GitHub at each decision point: open a pull request, list it in the report, keep, reopen, or move it. Its plan rests on the evidence it saw, so it re-plans when that evidence is withdrawn.',
  Auditor: 'Reads every withdrawal, classifies it as a real retraction, duplicate, alias or scope change, and explains the retraction. The graph decides outcomes; the Auditor only explains them.',
  Fixer: 'Writes the prose of pull requests and comments from the decision, its plan and its why chain, and carries out the GitHub actions. Titles, tables and links stay deterministic.',
}
const RELATED: Record<AgentId, AgentId[]> = { Triage: ['Planner', 'Auditor'], Planner: ['Triage', 'Fixer'], Auditor: ['Triage', 'Planner'], Fixer: ['Planner'] }

const DONE_LABEL: Record<string, string> = {
  open_pr: 'opened a pull request', close: 'closed a cancelled pull request', reopen: 'reopened a pull request',
  move_to_report: 'moved a pull request to the report', 'comment:unchanged': 'explained a support change',
  'comment:downgrade': 'explained a downgrade', 'comment:escalate': 'explained an escalation',
}
const ACTION_LABEL: Record<string, string> = {
  open_pr: 'open a pull request', report: 'list in the report', keep_pr: 'keep the pull request',
  reopen_pr: 'reopen the pull request', move_to_report: 'move to the report',
}

// The Planner's fixed fallback is shown as the Planner: for the reader it is the same job.
const agentOf = (i: AgentItem): AgentId => (i.agent === 'Policy' ? 'Planner' : (i.agent as AgentId))
const holds = (i: AgentItem) => i.status !== 'retracted' && i.status !== 'superseded'
const PAGE = 40

export function Agents({ projects, onOpen }: { projects: Project[]; onOpen: (id: string) => void }) {
  const { data: items, error } = useResource('agents', api.agents)
  const [agent, setAgent] = useState<AgentId | null>(null)
  const [project, setProject] = useState('all')
  const [limit, setLimit] = useState(PAGE)

  const orbit: OrbitAgent[] = useMemo(() => AGENTS.map((id) => {
    const mine = (items ?? []).filter((i) => agentOf(i) === id)
    return { id, role: ROLE[id], items: mine.length, held: mine.filter(holds).length, last: mine.map((i) => i.at ?? '').sort().at(-1) ?? '', related: RELATED[id] }
  }), [items])

  const shown = useMemo(() => (items ?? []).filter((i) =>
    (!agent || agentOf(i) === agent)
    && (project === 'all' || i.project === project || i.decision?.includes(`:${project}:`))), [items, agent, project])

  return (
    <div className="space-y-8">
      <div className="max-w-2xl">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-held">Agents</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Four agents, one memory.</h1>
        <p className="mt-2 text-muted-foreground">They write beliefs into the graph and must name what each one rests on. The memory rules themselves are never left to a model.</p>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      {!items && !error ? <Skeleton className="mx-auto h-[300px] max-w-3xl rounded-3xl" /> : (
        <Orbit agents={orbit} total={items?.length ?? 0} selected={agent} onSelect={(id) => { setAgent(id as AgentId | null); setLimit(PAGE) }} />
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-xl font-semibold tracking-tight">Feed{agent ? <span className="text-muted-foreground"> {'·'} {agent}</span> : null}</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Segmented label="Agent" value={agent ?? 'all'} onValueChange={(v) => { setAgent(v === 'all' ? null : (v as AgentId)); setLimit(PAGE) }}
            options={[{ value: 'all', label: 'All' }, ...AGENTS.map((a) => ({ value: a, label: a }))]} />
          <Segmented label="Project" value={project} onValueChange={(v) => { setProject(v); setLimit(PAGE) }}
            options={[{ value: 'all', label: 'All' }, ...projects.map((p) => ({ value: p.id, label: p.id }))]} />
        </div>
      </div>

      {items && shown.length === 0 && <Empty title="Nothing yet">No agent has recorded anything for this filter.</Empty>}
      <ol className="grid gap-3">
        {shown.slice(0, limit).map((i, n) => <FeedItem key={i.id} item={i} index={n % PAGE} onOpen={onOpen} />)}
      </ol>
      {shown.length > limit && (
        <div className="text-center">
          <Button variant="outline" className="rounded-full" onClick={() => setLimit((l) => l + PAGE)}>Show {Math.min(PAGE, shown.length - limit)} more</Button>
        </div>
      )}
    </div>
  )
}

function FeedItem({ item: i, index, onOpen }: { item: AgentItem; index: number; onOpen: (id: string) => void }) {
  const out = !holds(i)
  return (
    <m.li initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '0px 0px -6% 0px' }}
      transition={{ duration: 0.35, delay: Math.min(index, 5) * 0.03, ease }}
      className={cn('grid gap-x-4 gap-y-1 rounded-2xl border border-line p-4 sm:grid-cols-[6.5rem_1fr]', out ? 'bg-paper' : 'bg-panel')}>
      <time dateTime={i.at ?? undefined} className="font-mono text-xs text-muted-foreground sm:pt-1">{date(i.at)}</time>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
          <AgentChip agent={agentOf(i)} />
          <span className={cn(out && 'line-through decoration-retract')}><Title item={i} /></span>
          {out && <StatusPill held={false} label={i.status} />}
        </div>
        {i.detail && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{i.detail}</p>}
        {(i.decision || i.links.length > 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            {i.decision && (
              <button type="button" onClick={() => onOpen(i.decision!)} className="inline-flex h-7 items-center text-xs font-medium text-held underline-offset-2 hover:underline">Why?</button>
            )}
            {i.links.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" className="font-mono text-xs text-muted-foreground underline-offset-2 hover:text-ink hover:underline">{shortLink(u)}</a>)}
          </div>
        )}
      </div>
    </m.li>
  )
}

function Title({ item }: { item: AgentItem }) {
  const pkg = item.decision?.split(':')[2]
  const proj = item.decision?.split(':')[1] ?? item.project
  switch (item.kind) {
    case 'judgment': {
      const tone = item.title === 'exploitable' ? 'text-u0' : item.title === 'not_reachable' ? 'text-held' : 'text-ink'
      return <span><b className={cn('font-semibold', tone)}>{String(item.title).replace('_', ' ')}</b> <span className="text-muted-foreground">on</span> <code className="font-mono text-xs">{item.advisory}</code> <span className="text-muted-foreground">for {pkg} in {proj}</span></span>
    }
    case 'plan':
      return <span>chose to <b className="font-semibold">{ACTION_LABEL[String(item.title)] ?? item.title}</b> <span className="text-muted-foreground">for {pkg} in {proj} ({item.point})</span></span>
    case 'audit':
      return <span><b className="font-semibold capitalize">{String(item.title ?? '').replace('_', ' ')}</b> <span className="text-muted-foreground">withdrawal of</span> <code className="font-mono text-xs">{item.advisory}</code></span>
    default:
      return <span><b className="font-semibold">{DONE_LABEL[String(item.title)] ?? String(item.title)}</b> <span className="text-muted-foreground">for {pkg} in {proj}</span></span>
  }
}

function shortLink(url: string) {
  const m = url.match(/github\.com\/[^/]+\/retcon-target-([^/]+)\/(pull|issues)\/(\d+)/)
  return m ? `${m[1]} #${m[3]}` : url
}
