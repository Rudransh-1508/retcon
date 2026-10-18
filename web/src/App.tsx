import { useEffect, useMemo, useState } from 'react'
import { api, passphrase, type Decision, type Project } from './api'
import { Why } from './Why'
import { Timeline } from './Timeline'
import { Graph } from './Graph'
import { Urgency } from './bits'
import './app.css'

export default function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [selected, setSelected] = useState<string | null>(() => new URLSearchParams(location.search).get('why'))
  const [showRetracted, setShowRetracted] = useState(true)
  const [view, setView] = useState<View>(() => (new URLSearchParams(location.search).get('view') as View) || 'decisions')
  const [error, setError] = useState<string | null>(null)

  const [reload, setReload] = useState(0)
  const [admin, setAdmin] = useState(() => passphrase.get() !== '')
  useEffect(() => {
    Promise.all([api.projects(), api.decisions()])
      .then(([p, d]) => { setProjects(p); setDecisions(d) })
      .catch((e) => setError(String(e)))
  }, [reload])

  useEffect(() => {
    const url = new URL(location.href)
    if (selected) url.searchParams.set('why', selected)
    else url.searchParams.delete('why')
    if (view !== 'decisions') url.searchParams.set('view', view)
    else url.searchParams.delete('view')
    history.replaceState(null, '', url)
  }, [selected, view])

  const byProject = useMemo(() => {
    const groups = new Map<string, Decision[]>()
    for (const d of decisions) {
      if (!showRetracted && d.status === 'retracted') continue
      groups.set(d.project, [...(groups.get(d.project) ?? []), d])
    }
    for (const list of groups.values()) list.sort(byUrgency)
    return groups
  }, [decisions, showRetracted])

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden>R</span>
          <div>
            <h1>Retcon</h1>
            <p>Agent memory that can take things back.</p>
          </div>
        </div>
        <nav className="tabs" aria-label="Views">
          {VIEWS.map(([id, label]) => (
            <button key={id} className={view === id ? 'on' : ''} aria-current={view === id ? 'page' : undefined}
              onClick={() => setView(id)}>{label}</button>
          ))}
        </nav>
        <AdminToggle admin={admin} onChange={setAdmin} />
      </header>

      {error && <div className="error">Could not load data: {error}</div>}

      <main className={`layout ${selected ? 'has-why' : ''}`}>
        {view === 'timeline' && <Timeline onOpen={setSelected} />}
        {view === 'graph' && <Graph projects={projects} onOpen={setSelected} />}
        {view === 'decisions' && <section className="decisions panel" aria-label="Decisions">
          <div className="section-head">
            <h2>Decisions</h2>
            <label className="toggle">
              <input type="checkbox" checked={showRetracted} onChange={(e) => setShowRetracted(e.target.checked)} />
              Show cancelled
            </label>
          </div>
          {projects.map((p) => (
            <div key={p.id} className="project">
              <div className="project-head">
                <a href={`https://github.com/${p.repo}`} target="_blank" rel="noreferrer" className="project-name">{p.id}</a>
                <span className="muted mono">snapshot {p.snapshot_sha.slice(0, 7)} · {p.snapshot_date}</span>
              </div>
              <ul className="decision-list">
                {(byProject.get(p.id) ?? []).map((d) => (
                  <li key={d.id}>
                    <button
                      className={`decision ${d.status} ${selected === d.id ? 'active' : ''}`}
                      onClick={() => setSelected(d.id)}
                    >
                      <Urgency value={d.status === 'held' ? d.urgency : null} />
                      <span className="pkg">{d.package}</span>
                      <span className="target mono">
                        {d.status === 'retracted' ? 'cancelled' : d.target === 'none' ? 'no fix yet' : `→ ${d.target}`}
                      </span>
                      <span className="count muted">{d.status === 'held' ? `${d.evidence.length} adv.` : ''}</span>
                    </button>
                    {d.pr_url && (
                      <a className="pr-link mono" href={d.pr_url} target="_blank" rel="noreferrer"
                        title="Open the real pull request on GitHub">#{d.pr_url.split('/').pop()}</a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {projects.length === 0 && !error && <div className="muted">No projects yet.</div>}
        </section>}

        {selected && (
          <section className="why-panel" aria-label="Why">
            <Why key={`${selected}:${admin}`} id={selected} onClose={() => setSelected(null)} onOpen={setSelected} onChanged={() => setReload((n) => n + 1)} />
          </section>
        )}
      </main>
    </div>
  )
}

function AdminToggle({ admin, onChange }: { admin: boolean; onChange: (v: boolean) => void }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  if (admin) return <button className="ghost small" onClick={() => { passphrase.set(''); onChange(false) }}>Admin on · sign out</button>
  if (!open) return <button className="ghost small" onClick={() => setOpen(true)}>Admin</button>
  return (
    <form className="admin-form" onSubmit={(e) => { e.preventDefault(); passphrase.set(value); onChange(value !== ''); setOpen(false) }}>
      <input type="password" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Passphrase" aria-label="Admin passphrase" autoFocus />
      <button className="ghost small" type="submit">Enter</button>
    </form>
  )
}

type View = 'decisions' | 'graph' | 'timeline'
const VIEWS: [View, string][] = [['decisions', 'Decisions'], ['graph', 'Graph'], ['timeline', 'Timeline']]

function byUrgency(a: Decision, b: Decision) {
  const rank = (d: Decision) => (d.status === 'retracted' ? 9 : Number((d.urgency ?? 'P9').slice(1)))
  return rank(a) - rank(b) || a.package.localeCompare(b.package)
}
