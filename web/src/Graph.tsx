import { useEffect, useMemo, useRef, useState } from 'react'
import cytoscape, { type Core } from 'cytoscape'
import { api, type Event, type GraphData, type Project } from './api'
import { date } from './format'

const KIND_LEVEL: Record<string, number> = { Decision: 4, Judgment: 3, Exposure: 2, Advisory: 1 }

function palette() {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => css.getPropertyValue(name).trim()
  return {
    text: v('--text'), muted: v('--muted'), line: v('--line'), panel: v('--panel'), accent: v('--accent'),
    held: v('--held'), retracted: v('--retracted'), p0: v('--p0'), p1: v('--p1'), p2: v('--p2'), p3: v('--p3'),
  }
}

export function Graph({ projects, onOpen }: { projects: Project[]; onOpen: (id: string) => void }) {
  const [project, setProject] = useState<string>(() => new URLSearchParams(location.search).get('project') ?? 'gladys')
  const [data, setData] = useState<GraphData | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  const [picked, setPicked] = useState<{ id: string; kind: string; label: string; status: string } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const cy = useRef<Core | null>(null)

  useEffect(() => {
    let live = true
    api.graph(project).then((d) => { if (live) setData(d) }).catch((e) => setError(String(e)))
    api.events().then((list) => { if (live) setEvents(list) }).catch(() => {})
    return () => { live = false }
  }, [project])

  const retractions = useMemo(() => events.filter((e) => e.kind !== 'published'
    && e.changes.some((c) => c.decision.includes(`:${project}:`))), [events, project])

  useEffect(() => {
    if (!data || !box.current) return
    const c = palette()
    const urgencyColor: Record<string, string> = { P0: c.p0, P1: c.p1, P2: c.p2, P3: c.p3 }
    const instance = cytoscape({
      container: box.current,
      elements: [
        ...data.nodes.map((n) => ({
          data: { ...n, level: KIND_LEVEL[n.kind] ?? 0,
            display: n.kind === 'Decision' ? `${n.label}${n.status === 'held' && n.extra ? ` ${n.extra}` : ''}`
              : '' },
          classes: `${n.kind.toLowerCase()} ${n.status}`,
        })),
        ...data.edges.map((e) => ({ data: e, classes: `${e.kind ?? 'support'} ${e.status}` })),
      ],
      style: [
        { selector: 'node', style: { 'background-color': c.muted, width: 10, height: 10, 'border-width': 0,
          label: 'data(display)', color: c.text, 'font-size': 9, 'text-valign': 'bottom', 'text-margin-y': 3,
          'min-zoomed-font-size': 7 } },
        { selector: 'node.advisory', style: { 'background-color': c.p1, width: 7, height: 7 } },
        { selector: 'node.exposure', style: { 'background-color': c.accent, width: 10, height: 10, shape: 'round-rectangle' } },
        { selector: 'node.judgment', style: { 'background-color': c.held, shape: 'diamond', width: 12, height: 12 } },
        { selector: 'node.decision', style: { width: 18, height: 18, 'font-size': 10, 'font-weight': 'bold',
          'text-background-color': c.panel, 'text-background-opacity': 0.75, 'text-background-padding': '2px',
          'text-background-shape': 'roundrectangle',
          'background-color': (el: cytoscape.NodeSingular) => urgencyColor[el.data('extra')] ?? c.muted } },
        { selector: 'edge', style: { width: 1, 'line-color': c.line, 'curve-style': 'haystack', opacity: 0.9 } },
        { selector: 'edge.adjusts', style: { 'line-style': 'dashed', 'line-color': c.held } },
        { selector: '.retracted', style: { opacity: 0.22 } },
        { selector: 'node.retracted', style: { 'background-color': c.retracted } },
        { selector: '.rippling', style: { opacity: 1, 'background-color': c.p0, 'line-color': c.p0, width: 3,
          'transition-property': 'background-color, line-color, opacity, width', 'transition-duration': 300 } },
        { selector: 'node.rippling', style: { width: 22, height: 22 } },
        { selector: '.faded', style: { opacity: 0.08 } },
        { selector: 'node:selected', style: { 'border-width': 3, 'border-color': c.accent } },
      ],
      layout: { name: 'cose', animate: false, randomize: false, nodeRepulsion: () => 9000, idealEdgeLength: () => 26,
        edgeElasticity: () => 120, gravity: 0.6, numIter: 1500, componentSpacing: 40, nodeDimensionsIncludeLabels: true,
        padding: 20 } as cytoscape.LayoutOptions,
      wheelSensitivity: 0.3,
      minZoom: 0.15,
      maxZoom: 2.2,
    })
    instance.on('tap', 'node', (evt) => {
      const n = evt.target.data()
      setPicked({ id: n.id, kind: n.kind, label: n.label, status: n.status })
      instance.elements().addClass('faded')
      evt.target.closedNeighborhood().removeClass('faded')
      evt.target.predecessors().removeClass('faded')
      evt.target.successors().removeClass('faded')
    })
    instance.on('tap', (evt) => {
      if (evt.target === instance) { instance.elements().removeClass('faded'); setPicked(null) }
    })
    cy.current = instance
    return () => { instance.destroy(); cy.current = null }
  }, [data])

  async function replay(eventId: string) {
    setPlaying(eventId)
    const ev = await api.event(eventId)
    await ripple(ev.waves, false)
    setPlaying(null)
  }

  async function simulate(nodeId: string) {
    setPlaying(nodeId)
    try {
      const sim = await api.whatIf(nodeId)
      await ripple(sim.waves, true)
    } catch (e) {
      setError(String(e))
    }
    setPlaying(null)
  }

  async function ripple(waves: string[][], restore: boolean) {
    const c = cy.current
    if (!c) return
    c.elements().removeClass('faded rippling')
    const ev = { waves }
    const select = (id: string) => c.nodes(`[id = "${CSS.escape(id)}"]`).union(c.edges().filter((e) => e.data('support') === id))
    const touched = ev.waves.flat().map(select)
    touched.forEach((els) => els.removeClass('retracted').addClass('held'))
    const all = touched.reduce((acc, els) => acc.union(els), c.collection())
    const focus = all.closedNeighborhood().closedNeighborhood()
    c.elements().addClass('faded')
    focus.removeClass('faded')
    if (focus.nonempty()) {
      c.animate({ fit: { eles: focus, padding: 70 } }, { duration: 500 })
      await new Promise((r) => setTimeout(r, 550))
    }
    for (const [i, wave] of ev.waves.entries()) {
      await new Promise((r) => setTimeout(r, i === 0 ? 400 : 700))
      for (const id of wave) select(id).addClass('rippling')
      await new Promise((r) => setTimeout(r, 450))
      for (const id of wave) select(id).removeClass('rippling held').addClass('retracted')
    }
    await new Promise((r) => setTimeout(r, 900))
    c.elements().removeClass('faded')
    if (restore) {
      // a what-if writes nothing: put every touched element back the way the live graph has it
      touched.forEach((els) => els.forEach((el) => {
        el.removeClass('retracted held')
        el.addClass(el.data('status') === 'retracted' ? 'retracted' : 'held')
      }))
    }
  }

  return (
    <section className="graph panel" aria-label="Graph">
      <div className="section-head graph-head">
        <h2>Graph</h2>
        <div className="segmented" role="tablist" aria-label="Project">
          {projects.map((p) => (
            <button key={p.id} role="tab" aria-selected={project === p.id} className={project === p.id ? 'on' : ''}
              onClick={() => { setProject(p.id); setPicked(null) }}>{p.id}</button>
          ))}
        </div>
      </div>
      <div className="graph-tools">
        <label className="muted" htmlFor="replay">Replay a retraction</label>
        <select id="replay" disabled={!!playing || retractions.length === 0} value=""
          onChange={(e) => e.target.value && replay(e.target.value)}>
          <option value="">{retractions.length ? 'Choose an event…' : 'No retractions yet'}</option>
          {retractions.map((e) => (
            <option key={e.id} value={e.id}>
              {date(e.at)} {e.kind === 'correction' ? 'correction' : 'withdrawn'} {e.advisory ?? e.target} ({e.changes.length})
            </option>
          ))}
        </select>
        {playing && <span className="muted">{playing.startsWith('event:') ? 'Replaying…' : 'Simulating…'}</span>}
        <span className="legend">
          <i className="dot advisory" /> advisory <i className="dot exposure" /> exposure
          <i className="dot judgment" /> judgment <i className="dot decision" /> decision
        </span>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="graph-canvas" ref={box} />
      {picked && (
        <div className="graph-picked">
          <span className={`kind kind-${picked.kind.toLowerCase()}`}>{picked.kind}</span>
          <code>{picked.id}</code>
          <span className={`status ${picked.status === 'held' ? 'on' : 'off'}`}>{picked.status}</span>
          <button className="link" onClick={() => onOpen(picked.id)}>Why?</button>
          {picked.status === 'held' && ['Advisory', 'Exposure', 'Judgment'].includes(picked.kind) && (
            <button className="ask" disabled={!!playing} onClick={() => simulate(picked.id)}>What if wrong?</button>
          )}
        </div>
      )}
    </section>
  )
}
