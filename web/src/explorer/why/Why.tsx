'use client'

import { createContext, useContext, useState } from 'react'
import { m } from 'framer-motion'
import { ChevronDown, ExternalLink, FlaskConical } from 'lucide-react'
import { api, type Decision, type WhyNode, type WhySupport } from '../api'
import { invalidate, useResource } from '../data'
import { date } from '../format'
import { KindChip, AgentChip } from '../ui/Kind'
import { ErrorNote, Skeleton, Spinner } from '../ui/States'
import { Severity, StatusPill, Urgency } from '../ui/Urgency'
import { SupportStack } from './SupportStack'
import { WhatIf } from './WhatIf'
import { ease } from '@/components/site/motion'
import { cn } from '@/lib/utils'

const Ask = createContext<(id: string) => void>(() => {})
const ASKABLE = ['Advisory', 'Exposure', 'Judgment']

export function Why({ id, preview, onOpen, onChanged }: { id: string; preview?: Decision; onOpen: (id: string) => void; onChanged: () => void }) {
  const { data: tree, error, reload } = useResource(`why:${id}`, () => api.why(id))
  const [whatIf, setWhatIf] = useState<string | null>(null)
  const [ghost, setGhost] = useState<Set<string>>(new Set())

  if (error && !tree) return <ErrorNote>{error}</ErrorNote>
  if (!tree) {
    return (
      // The chain can take a few seconds to read from the graph; the list already knows the headline, so show it now.
      <div className="space-y-6" aria-busy="true">
        {preview ? <Headline node={{ ...preview, kind: 'Decision', retracted_by: [] }} /> : <Skeleton className="h-24" />}
        <Spinner label="Reading the chain of support" />
        <Skeleton className="h-44" /><Skeleton className="h-40" />
      </div>
    )
  }

  const plans = (tree.plans as PlanItem[] | undefined) ?? []
  const judgments = (tree.judgments as WhyNode[] | undefined) ?? []
  const history = (tree.history as HistoryItem[] | undefined) ?? []

  return (
    <Ask.Provider value={setWhatIf}>
      <div className="space-y-6">
        <Headline node={tree} />
        <SupportStack tree={tree} ghost={ghost} />

        {whatIf && (
          <WhatIf key={whatIf} target={whatIf} onClose={() => setWhatIf(null)} onOpen={(d) => { setWhatIf(null); onOpen(d) }} onGhost={setGhost}
            onDone={() => { invalidate('decisions'); invalidate('graph'); invalidate('why:'); reload(); onChanged() }} />
        )}

        {plans.length > 0 && (
          <Section title="Planner">
            {plans.map((p) => <PlanCard key={p.id} plan={p} />)}
          </Section>
        )}
        {history.length > 0 && <Section title="History"><History items={history} /></Section>}
        {judgments.length > 0 && (
          <Section title="Triage judgments">
            {judgments.map((j) => <JudgmentCard key={j.id} node={j} />)}
          </Section>
        )}
        <Section title="Chain of support">
          <NodeCard node={tree} root onOpen={onOpen} depth={0} />
        </Section>
      </div>
    </Ask.Provider>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{title}</h3>
      <div className="grid gap-2">{children}</div>
    </section>
  )
}

// ---- headline -------------------------------------------------------------------------------------------------

function Headline({ node }: { node: WhyNode }) {
  if (node.kind !== 'Decision') {
    return (
      <div>
        <KindChip kind={node.kind} />
        <p className="mt-2 break-words font-display text-xl font-semibold tracking-tight">{String(node.package ?? node.label ?? node.id)}</p>
      </div>
    )
  }
  const held = node.status === 'held'
  const evidence = (node.evidence as string[] | undefined) ?? []
  const target = node.target && node.target !== 'none' ? String(node.target) : null
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <Urgency value={held ? (node.urgency as string) : null} className="h-7 min-w-10 text-sm" />
        <StatusPill held={held} label={held ? 'held' : 'cancelled'} />
      </div>
      <h2 className={cn('mt-3 font-display text-2xl font-semibold leading-tight tracking-tight', !held && 'text-muted-foreground line-through decoration-retract')}>
        Upgrade {String(node.package)}{target ? <> to <span className="font-mono text-[0.9em]">{target}</span></> : null}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        in <b className="font-semibold text-ink">{String(node.project)}</b>.{' '}
        {held
          ? `Justified by ${evidence.length} advisor${evidence.length === 1 ? 'y that still holds' : 'ies that still hold'}.`
          : 'No support is left: every advisory behind it was withdrawn.'}
      </p>
    </div>
  )
}

// ---- planner --------------------------------------------------------------------------------------------------

type PlanItem = { id: string; action: string; rationale: string; point: string; status: string; at: string; by: string; actions: string[] }

const PLAN_LABEL: Record<string, string> = {
  open_pr: 'open a pull request', report: 'list in the report', keep_pr: 'keep the pull request',
  reopen_pr: 'reopen the pull request', move_to_report: 'move to the report',
}

function PlanCard({ plan }: { plan: PlanItem }) {
  const out = plan.status !== 'held'
  return (
    <div className={cn('rounded-xl border bg-panel p-3.5', out ? 'border-line bg-paper' : 'border-line')}>
      <div className="flex flex-wrap items-center gap-2">
        <AgentChip agent={plan.by || 'Planner'} />
        <span className={cn('text-sm font-medium', out && 'line-through decoration-retract')}>{PLAN_LABEL[plan.action] ?? plan.action}</span>
        <span className="font-mono text-[11px] text-muted-foreground">{date(plan.at)} · {plan.point}</span>
        {out && <StatusPill held={false} label={plan.status} />}
      </div>
      {plan.rationale && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{plan.rationale}</p>}
      {plan.actions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {plan.actions.map((u) => (
            <a key={u} href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-held underline-offset-2 hover:underline">
              {shortLink(u)} <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function shortLink(url: string) {
  const m = url.match(/retcon-target-([^/]+)\/(?:pull|issues)\/(\d+)/)
  return m ? `${m[1]} #${m[2]}` : url
}

// ---- history --------------------------------------------------------------------------------------------------

type HistoryItem = {
  event: string; kind: string; advisory: string; at: string; change: string
  before: string | null; after: string | null; evidence_before: number; evidence_after: number
}

const CHANGE_LABEL: Record<string, string> = {
  new: 'opened', updated: 'more evidence', escalate: 'escalated', unchanged: 'support changed',
  downgrade: 'downgraded', cancel: 'cancelled',
}

function History({ items }: { items: HistoryItem[] }) {
  return (
    <ol aria-label="History" className="relative ml-1 grid gap-0 border-l border-line">
      {items.map((h, i) => (
        <m.li key={h.event} className="relative pb-4 pl-5 last:pb-0"
          initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25, delay: i * 0.04, ease }}>
          <span aria-hidden="true" className={cn('absolute -left-[5px] top-1.5 size-2.5 rounded-full ring-2 ring-paper', h.change === 'cancel' ? 'bg-retract' : 'bg-held')} />
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
            <span className="font-mono text-xs text-muted-foreground">{date(h.at)}</span>
            <span className={cn('font-medium', h.change === 'cancel' && 'text-retract')}>{CHANGE_LABEL[h.change] ?? h.change}</span>
            <span className="text-muted-foreground">{h.kind}</span>
            <a href={`https://github.com/advisories/${h.advisory}`} target="_blank" rel="noreferrer" className="font-mono text-xs underline-offset-2 hover:underline">{h.advisory}</a>
            <span className="ml-auto inline-flex items-center gap-1.5">
              {h.before && h.before !== h.after && <><Urgency value={h.before} /><span className="text-muted-foreground" aria-hidden="true">{'→'}</span></>}
              <Urgency value={h.after} />
              <span className="font-mono text-xs text-muted-foreground">{h.evidence_after} adv.</span>
            </span>
          </div>
        </m.li>
      ))}
    </ol>
  )
}

// ---- chain of support -----------------------------------------------------------------------------------------

const FOLD_AT = 5

function NodeCard({ node, root, onOpen, depth }: { node: WhyNode; root?: boolean; onOpen: (id: string) => void; depth: number }) {
  const retracted = node.status === 'retracted'
  const supports = node.supports ?? []
  const [all, setAll] = useState(false)
  const visible = all ? supports : supports.slice(0, FOLD_AT)
  return (
    <m.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: Math.min(depth, 5) * 0.05, ease }}
      className={cn('rounded-xl border bg-panel p-3', retracted ? 'border-retract/35' : 'border-line', root && 'shadow-sm')}>
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1.5">
        <KindChip kind={node.kind} className="mt-0.5" />
        <div className={cn('min-w-0 flex-1 text-sm', retracted && 'text-muted-foreground')}><NodeTitle node={node} onOpen={onOpen} /></div>
        <StatusPill held={!retracted} />
        {!retracted && ASKABLE.includes(node.kind) && <AskButton id={node.id} />}
      </div>
      {retracted && node.retracted_by.length > 0 && (
        <div className="mt-2 rounded-lg bg-retract/8 px-2.5 py-2 text-[13px] text-retract">
          Retracted {date(node.retracted_by[0].at)}
          {node.kind === 'Advisory' ? ': withdrawn by its publisher' : ': its support was retracted'}
          {node.kind === 'Advisory' && node.retracted_by[0].rationale && (
            <div className="mt-1.5 flex flex-wrap items-baseline gap-1.5 text-ink/85">
              <AgentChip agent="Auditor" />
              <b className="font-medium">{String(node.retracted_by[0].classification ?? '').replace('_', ' ')}</b>
              <span>{node.retracted_by[0].rationale}</span>
            </div>
          )}
        </div>
      )}
      {supports.length > 0 && (
        <ul className="mt-2.5 grid gap-2">
          {visible.map((s) => <SupportRow key={s.id} support={s} onOpen={onOpen} depth={depth + 1} />)}
          {supports.length > FOLD_AT && (
            <li>
              <button type="button" onClick={() => setAll((v) => !v)} className="inline-flex h-8 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-ink">
                <ChevronDown className={cn('size-3.5 transition-transform', all && 'rotate-180')} aria-hidden="true" />
                {all ? 'Show fewer' : `Show ${supports.length - FOLD_AT} more`}
              </button>
            </li>
          )}
        </ul>
      )}
    </m.div>
  )
}

function SupportRow({ support, onOpen, depth }: { support: WhySupport; onOpen: (id: string) => void; depth: number }) {
  const retracted = support.status === 'retracted'
  const label = support.kind === 'affects' ? 'affected by' : support.kind === 'resolves' ? 'because of' : support.kind
  return (
    <li className={cn('border-l-2 pl-3', retracted ? 'border-retract/45' : 'border-held/45')}>
      <div className="mb-1.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
        <span className="font-medium text-ink/80">{label}</span>
        {support.kind === 'affects' && support.fix ? (
          <span>{support.fix === 'none' ? 'no fixed release yet' : <>fixed in <code className="font-mono">{String(support.fix)}</code></>}</span>
        ) : null}
        {support.by && <span>{'·'} recorded by {support.by}</span>}
      </div>
      <div className="grid gap-2">{support.premises.map((p) => <NodeCard key={p.id} node={p} onOpen={onOpen} depth={depth + 1} />)}</div>
    </li>
  )
}

function AskButton({ id }: { id: string }) {
  const ask = useContext(Ask)
  return (
    <button type="button" onClick={() => ask(id)} title="Simulate retracting this belief"
      className="inline-flex h-7 items-center gap-1 rounded-full border border-retract/40 px-2.5 text-xs font-medium text-retract transition-colors hover:bg-retract/10">
      <FlaskConical className="size-3" aria-hidden="true" />What if wrong?
    </button>
  )
}

const VERDICT_LABEL: Record<string, string> = { exploitable: 'exploitable here', not_reachable: 'not reachable here', unknown: 'unclear' }

function Verdict({ value }: { value: string }) {
  const tone = value === 'exploitable' ? 'text-u0 bg-u0/12 ring-u0/35' : value === 'not_reachable' ? 'text-held bg-held/10 ring-held/30' : 'text-muted-foreground bg-ink/6 ring-line'
  return <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset', tone)}>{VERDICT_LABEL[value] ?? value}</span>
}

function JudgmentCard({ node }: { node: WhyNode }) {
  const retracted = node.status === 'retracted'
  let evidence: { file: string; line: number }[] = []
  try { evidence = JSON.parse(String(node.evidence ?? '[]')) } catch { evidence = [] }
  return (
    <div className={cn('rounded-xl border bg-panel p-3.5', retracted ? 'border-retract/35' : 'border-line')}>
      <div className="flex flex-wrap items-center gap-2">
        <AgentChip agent="Triage" />
        <Verdict value={String(node.verdict)} />
        <span className="text-xs text-muted-foreground">on</span>
        <a href={`https://github.com/advisories/${String(node.advisory)}`} target="_blank" rel="noreferrer" className="font-mono text-xs underline-offset-2 hover:underline">{String(node.advisory)}</a>
        <span className="ml-auto"><StatusPill held={!retracted} /></span>
      </div>
      {typeof node.rationale === 'string' && node.rationale && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{node.rationale}</p>}
      {evidence.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {evidence.map((e) => (
            <a key={`${e.file}:${e.line}`} className="font-mono text-xs text-held underline-offset-2 hover:underline" target="_blank" rel="noreferrer"
              href={`https://github.com/${String(node.repo)}/blob/main/${e.file}#L${e.line}`}>{e.file}:{e.line}</a>
          ))}
        </div>
      )}
      {retracted && (
        <p className="mt-2 rounded-lg bg-retract/8 px-2.5 py-1.5 text-[13px] text-retract">
          Retracted {date(node.retracted_by[0]?.at)}: {node.corrected ? `corrected by a person (${String(node.corrected_reason ?? '')})` : 'the advisory it judged was withdrawn'}
        </p>
      )}
      {!retracted && <div className="mt-2"><AskButton id={node.id} /></div>}
    </div>
  )
}

function NodeTitle({ node, onOpen }: { node: WhyNode; onOpen: (id: string) => void }) {
  switch (node.kind) {
    case 'Advisory':
      return (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <a href={String(node.url)} target="_blank" rel="noreferrer" className="font-mono text-xs font-medium underline-offset-2 hover:underline">{node.id}</a>
          <Severity value={node.severity as string} />
          <span className="basis-full text-[13px] leading-snug text-muted-foreground">{String(node.summary ?? '')}</span>
        </span>
      )
    case 'Exposure':
      return (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <code className="font-mono text-[13px] font-medium">{String(node.package)}@{String(node.version)}</code>
          <span className="text-muted-foreground">in {String(node.project)}{node.dev ? ' (dev only)' : ''}</span>
          {Array.isArray(node.paths) && node.paths.length > 0 && (
            <span className="basis-full font-mono text-xs text-muted-foreground">{node.direct ? 'direct dependency' : `via ${String(node.paths[0])}`}</span>
          )}
        </span>
      )
    case 'Decision':
      return (
        <span className="flex flex-wrap items-center gap-x-2">
          <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => onOpen(node.id)}>{String(node.package)}</button>
          <span className="text-muted-foreground">in {String(node.project)}</span>
        </span>
      )
    case 'Judgment':
      return (
        <span className="flex flex-wrap items-center gap-2">
          <Verdict value={String(node.verdict)} />
          <span className="basis-full text-[13px] leading-snug text-muted-foreground">{String(node.rationale ?? '')}</span>
        </span>
      )
    default:
      return <span className="font-mono text-xs">{node.id}</span>
  }
}
