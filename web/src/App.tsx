import { useEffect, useMemo, useState } from 'react'
import { api, type Decision, type Project } from './api'
import { Why } from './Why'
import { Urgency } from './bits'
import './app.css'

export default function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [selected, setSelected] = useState<string | null>(() => new URLSearchParams(location.search).get('why'))
  const [showRetracted, setShowRetracted] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.projects(), api.decisions()])
      .then(([p, d]) => { setProjects(p); setDecisions(d) })
      .catch((e) => setError(String(e)))
  }, [])

  useEffect(() => {
    const url = new URL(location.href)
    if (selected) url.searchParams.set('why', selected)
    else url.searchParams.delete('why')
    history.replaceState(null, '', url)
  }, [selected])

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
      </header>

      {error && <div className="error">Could not load data: {error}</div>}

      <main className={`layout ${selected ? 'has-why' : ''}`}>
        <section className="decisions" aria-label="Decisions">
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
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        {selected && (
          <section className="why-panel" aria-label="Why">
            <Why key={selected} id={selected} onClose={() => setSelected(null)} onOpen={setSelected} />
          </section>
        )}
      </main>
    </div>
  )
}

function byUrgency(a: Decision, b: Decision) {
  const rank = (d: Decision) => (d.status === 'retracted' ? 9 : Number((d.urgency ?? 'P9').slice(1)))
  return rank(a) - rank(b) || a.package.localeCompare(b.package)
}
