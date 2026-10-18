import { useEffect, useMemo, useState } from 'react'
import { api, type AgentItem, type Project } from './api'
import { date } from './format'

const AGENTS = ['all', 'Triage', 'Planner', 'Auditor', 'Fixer'] as const
type AgentFilter = (typeof AGENTS)[number]

const ROLE: Record<string, string> = {
  Triage: 'judges exploitability from the project code',
  Planner: 'decides what to do on GitHub',
  Policy: 'fallback when the Planner is unavailable',
  Auditor: 'explains why advisories were withdrawn',
  Fixer: 'writes and carries out the GitHub actions',
}

const DONE_LABEL: Record<string, string> = {
  open_pr: 'opened a pull request', close: 'closed a cancelled pull request', reopen: 'reopened a pull request',
  move_to_report: 'moved a pull request to the report', 'comment:unchanged': 'explained a support change',
  'comment:downgrade': 'explained a downgrade', 'comment:escalate': 'explained an escalation',
}

const ACTION_LABEL: Record<string, string> = {
  open_pr: 'open a pull request', report: 'list in the report', keep_pr: 'keep the pull request',
  reopen_pr: 'reopen the pull request', move_to_report: 'move to the report',
}

export function Agents({ projects, onOpen }: { projects: Project[]; onOpen: (id: string) => void }) {
  const [items, setItems] = useState<AgentItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [agent, setAgent] = useState<AgentFilter>('all')
  const [project, setProject] = useState<string>('all')

  useEffect(() => {
    api.agents().then(setItems).catch((e) => setError(String(e)))
  }, [])

  const shown = useMemo(() => (items ?? []).filter((i) =>
    (agent === 'all' || i.agent === agent || (agent === 'Planner' && i.agent === 'Policy'))
    && (project === 'all' || i.project === project || i.decision?.includes(`:${project}:`))), [items, agent, project])

  return (
    <section className="agents panel" aria-label="Agents">
      <div className="section-head agents-head">
        <h2>Agents</h2>
        <div className="agents-filters">
          <div className="segmented" role="tablist" aria-label="Agent">
            {AGENTS.map((a) => (
              <button key={a} role="tab" aria-selected={agent === a} className={agent === a ? 'on' : ''} onClick={() => setAgent(a)}>{a}</button>
            ))}
          </div>
          <div className="segmented" role="tablist" aria-label="Project">
            {['all', ...projects.map((p) => p.id)].map((p) => (
              <button key={p} role="tab" aria-selected={project === p} className={project === p ? 'on' : ''} onClick={() => setProject(p)}>{p}</button>
            ))}
          </div>
        </div>
      </div>
      {agent !== 'all' && <p className="muted agent-role">{agent}: {ROLE[agent]}.</p>}
      {error && <div className="error">{error}</div>}
      {!items && !error && <div className="muted">Loading…</div>}
      {items && shown.length === 0 && <div className="muted">Nothing yet.</div>}
      <ol className="feed">
        {shown.slice(0, 300).map((i) => (
          <li key={i.id} className={`feed-item ${i.status}`}>
            <div className="event-when mono">{date(i.at)}</div>
            <div>
              <div className="event-head">
                <span className={`agent-chip agent-${i.agent.toLowerCase()}`}>{i.agent}</span>
                <Title item={i} />
                {(i.status === 'retracted' || i.status === 'superseded') && <span className="status off">{i.status}</span>}
              </div>
              {i.detail && <div className="event-summary">{i.detail}</div>}
              <div className="feed-links">
                {i.decision && <button className="link" onClick={() => onOpen(i.decision!)}>why?</button>}
                {i.links.map((u) => (
                  <a key={u} href={u} target="_blank" rel="noreferrer" className="mono">{shortLink(u)}</a>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Title({ item }: { item: AgentItem }) {
  const pkg = item.decision?.split(':')[2]
  const proj = item.decision?.split(':')[1] ?? item.project
  switch (item.kind) {
    case 'judgment':
      return <span><b className={`verdict ${item.title}`}>{String(item.title).replace('_', ' ')}</b> <span className="muted">on</span> <code>{item.advisory}</code> <span className="muted">for {pkg} in {proj}</span></span>
    case 'plan':
      return <span>chose to <b>{ACTION_LABEL[String(item.title)] ?? item.title}</b> <span className="muted">for {pkg} in {proj} ({item.point})</span></span>
    case 'audit':
      return <span><b>{String(item.title ?? '').replace('_', ' ')}</b> <span className="muted">withdrawal of</span> <code>{item.advisory}</code></span>
    default:
      return <span><b>{DONE_LABEL[String(item.title)] ?? String(item.title)}</b> <span className="muted">for {pkg} in {proj}</span></span>
  }
}

function shortLink(url: string) {
  const m = url.match(/github\.com\/[^/]+\/retcon-target-([^/]+)\/(pull|issues)\/(\d+)/)
  return m ? `${m[1]} #${m[3]}` : url
}
