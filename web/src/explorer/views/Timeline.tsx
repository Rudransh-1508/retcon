'use client'

import { useMemo, useState } from 'react'
import { m } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { api, type Event } from '../api'
import { useResource } from '../data'
import { date, month } from '../format'
import { AgentChip } from '../ui/Kind'
import { Segmented } from '../ui/Segmented'
import { Empty, ErrorNote, Skeleton } from '../ui/States'
import { Severity } from '../ui/Urgency'
import { ease } from '@/components/site/motion'
import { cn } from '@/lib/utils'

type Filter = 'significant' | 'withdrawals' | 'all'

const CHANGE_LABEL: Record<string, string> = {
  new: 'opened', updated: 'more evidence', escalate: 'escalated', unchanged: 'support changed', downgrade: 'downgraded', cancel: 'cancelled',
}
const CHANGE_TONE: Record<string, string> = {
  cancel: 'border-retract/45 text-retract hover:bg-retract/10',
  downgrade: 'border-u1/45 text-u1 hover:bg-u1/10',
  escalate: 'border-u0/45 text-u0 hover:bg-u0/10',
  new: 'border-held/45 text-held hover:bg-held/10',
}

export function Timeline({ onOpen }: { onOpen: (id: string) => void }) {
  const { data: events, error } = useResource('events', api.events)
  const [filter, setFilter] = useState<Filter>('significant')

  const months = useMemo(() => {
    const shown = (events ?? []).filter((e) => {
      if (filter === 'withdrawals') return e.kind !== 'published'
      if (filter === 'significant') return e.kind !== 'published' || e.changes.some((c) => c.change !== 'updated')
      return true
    })
    const groups = new Map<string, Event[]>()
    for (const e of shown) groups.set(month(e.at), [...(groups.get(month(e.at)) ?? []), e])
    return [...groups]
  }, [events, filter])

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-held">Timeline</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Every withdrawal and correction.</h1>
          <p className="mt-2 text-muted-foreground">Each event lists the decisions it changed, with the Auditor{'’'}s explanation when an advisory was withdrawn.</p>
        </div>
        <Segmented label="Filter events" value={filter} onValueChange={setFilter}
          options={[{ value: 'significant', label: 'Significant' }, { value: 'withdrawals', label: 'Withdrawals' }, { value: 'all', label: 'All' }]} />
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      {!events && !error && <div className="space-y-3" aria-busy="true">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>}
      {events && months.length === 0 && <Empty title="No events yet">Withdrawals and corrections appear here as the worker reads the advisory feed.</Empty>}

      <div className="space-y-10">
        {months.map(([name, list]) => (
          <section key={name} aria-label={name}>
            <h2 className="sticky top-16 z-10 -mx-4 bg-paper/90 px-4 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground backdrop-blur-md sm:-mx-6 sm:px-6">{name}</h2>
            <ol className="relative ml-1.5 mt-2 border-l border-line [perspective:1200px]">
              {list.map((e, i) => <EventRow key={e.id} event={e} index={i} onOpen={onOpen} />)}
            </ol>
          </section>
        ))}
      </div>
    </div>
  )
}

function EventRow({ event: e, index, onOpen }: { event: Event; index: number; onOpen: (id: string) => void }) {
  const withdrawn = e.kind === 'withdrawn'
  const correction = e.kind === 'correction'
  return (
    <m.li initial={{ opacity: 0, y: 18, rotateX: 10 }} whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
      viewport={{ once: true, margin: '0px 0px -8% 0px' }} transition={{ duration: 0.5, delay: Math.min(index, 4) * 0.04, ease }}
      style={{ transformOrigin: '50% 0%' }} className="relative pb-5 pl-6 sm:pl-8">
      <span aria-hidden="true" className={cn('absolute -left-[6px] top-4 size-3 rounded-full ring-4 ring-paper', withdrawn ? 'bg-retract' : correction ? 'bg-ink' : 'bg-held')}>
        {withdrawn && <m.span className="absolute inset-0 rounded-full border border-retract" initial={{ scale: 1, opacity: 0.8 }}
          whileInView={{ scale: 3.2, opacity: 0 }} viewport={{ once: true }} transition={{ duration: 1.2, delay: 0.3, ease: 'easeOut' }} />}
      </span>
      <article className={cn('rounded-2xl border bg-panel p-4 transition-shadow duration-200 hover:shadow-[0_16px_30px_-24px_color-mix(in_srgb,var(--ink)_60%,transparent)]',
        withdrawn ? 'border-retract/35' : 'border-line')}>
        <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ring-1 ring-inset',
            withdrawn ? 'bg-retract/10 text-retract ring-retract/30' : correction ? 'bg-ink/8 text-ink ring-line' : 'bg-held/10 text-held ring-held/30')}>{e.kind}</span>
          {e.advisory ? (
            <a href={`https://github.com/advisories/${e.advisory}`} target="_blank" rel="noreferrer" className="font-mono text-xs font-medium underline-offset-2 hover:underline">{e.advisory}</a>
          ) : <code className="break-all font-mono text-xs">{e.target}</code>}
          <Severity value={e.severity} />
          <time dateTime={e.at} className="ml-auto font-mono text-xs text-muted-foreground">{date(e.at)}</time>
        </header>
        <p className="mt-2 text-sm leading-snug">
          {correction ? `${(e.by ?? 'a person').split(':').pop()}: ${e.reason ?? ''}` : e.summary}
        </p>
        {e.rationale && (
          <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-xl bg-ink/5 px-3 py-2 text-[13px] leading-snug">
            <AgentChip agent="Auditor" />
            <b className="font-medium capitalize">{String(e.classification ?? '').replace('_', ' ')}</b>
            <span className="text-muted-foreground">{e.rationale}</span>
          </div>
        )}
        {e.changes.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {e.changes.map((c) => {
              const [, project, pkg] = c.decision.split(':')
              const was = c.before?.urgency ? String(c.before.urgency) : null
              const now = c.after?.urgency ? String(c.after.urgency) : null
              return (
                <li key={c.decision}>
                  <button type="button" onClick={() => onOpen(c.decision)}
                    className={cn('inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors', CHANGE_TONE[c.change] ?? 'border-line text-muted-foreground hover:bg-ink/5')}>
                    <b className="font-semibold text-ink">{pkg}</b>
                    <span className="text-muted-foreground">in {project}</span>
                    <span aria-hidden="true">{'·'}</span>
                    {CHANGE_LABEL[c.change] ?? c.change}
                    {was && now && was !== now && <span className="inline-flex items-center gap-1 font-mono">{was}<ArrowRight className="size-3" aria-hidden="true" />{now}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </article>
    </m.li>
  )
}
