import { useEffect, useMemo, useState } from 'react'
import { api, type Event } from './api'
import { Severity } from './bits'
import { date } from './format'

const CHANGE_LABEL: Record<string, string> = {
  new: 'opened', updated: 'more evidence', escalate: 'escalated', unchanged: 'support changed',
  downgrade: 'downgraded', cancel: 'cancelled',
}

type Filter = 'significant' | 'withdrawals' | 'all'

export function Timeline({ onOpen }: { onOpen: (id: string) => void }) {
  const [events, setEvents] = useState<Event[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('significant')

  useEffect(() => {
    api.events().then(setEvents).catch((e) => setError(String(e)))
  }, [])

  const shown = useMemo(() => (events ?? []).filter((e) => {
    if (filter === 'withdrawals') return e.kind !== 'published'
    if (filter === 'significant') return e.kind !== 'published' || e.changes.some((c) => c.change !== 'updated')
    return true
  }), [events, filter])

  return (
    <section className="timeline panel" aria-label="Timeline">
      <div className="section-head">
        <h2>Timeline</h2>
        <div className="segmented" role="tablist" aria-label="Filter events">
          {(['significant', 'withdrawals', 'all'] as Filter[]).map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'on' : ''}
              onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      {!events && !error && <div className="muted">Loading…</div>}
      {events && shown.length === 0 && <div className="muted">No events yet.</div>}
      <ol className="events">
        {shown.map((e) => (
          <li key={e.id} className={`event ${e.kind}`}>
            <div className="event-when mono">{date(e.at)}</div>
            <div className="event-body">
              <div className="event-head">
                <span className={`event-kind ${e.kind}`}>{e.kind}</span>
                {e.advisory ? (
                  <a href={`https://github.com/advisories/${e.advisory}`} target="_blank" rel="noreferrer" className="mono">{e.advisory}</a>
                ) : (
                  <code className="event-target">{e.target}</code>
                )}
                <Severity value={e.severity} />
              </div>
              <div className="event-summary">
                {e.kind === 'correction' ? `${(e.by ?? 'a person').split(':').pop()}: ${e.reason ?? ''}` : e.summary}
              </div>
              {e.rationale && (
                <div className="auditor"><span className="kind kind-auditor">Auditor</span>
                  <b>{String(e.classification ?? '').replace('_', ' ')}</b> {e.rationale}</div>
              )}
              {e.changes.length > 0 && (
                <ul className="event-changes">
                  {e.changes.map((c) => {
                    const [, project, pkg] = c.decision.split(':')
                    return (
                      <li key={c.decision}>
                        <button className={`chip change-${c.change}`} onClick={() => onOpen(c.decision)}>
                          <b>{pkg}</b> <span className="muted">in {project}</span> · {CHANGE_LABEL[c.change] ?? c.change}
                          {c.before?.urgency && c.after?.urgency && c.before.urgency !== c.after.urgency
                            ? ` ${String(c.before.urgency)} → ${String(c.after.urgency)}` : ''}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
