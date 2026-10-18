export type Decision = {
  id: string; project: string; package: string; status: 'held' | 'retracted'
  urgency: string | null; target: string | null; evidence: string[]
  pr_url: string | null; mode: string | null
}
export type Project = { id: string; repo: string; snapshot_sha: string; snapshot_date: string; open_decisions: number }
export type RetractedBy = {
  id: string; at: string; reason: string; trigger: string; wave: number
  classification?: string | null; rationale?: string | null; original?: string | null
}
export type WhyNode = {
  id: string; kind: string; status?: string; [key: string]: unknown
  retracted_by: RetractedBy[]
  supports?: WhySupport[]
}
export type WhySupport = { id: string; kind: string; status: string; by: string | null; premises: WhyNode[]; [key: string]: unknown }
export type Change = { decision: string; change: string; before: Record<string, unknown> | null; after: Record<string, unknown> }
export type Event = {
  id: string; kind: string; at: string; advisory: string | null; summary: string | null; severity: string | null
  changes: Change[]; target?: string | null; reason?: string | null; by?: string | null
  classification?: string | null; rationale?: string | null
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}

export type GraphNode = { id: string; kind: string; status: string; label: string; extra: string | null }
export type GraphEdge = { id: string; support: string | null; source: string; target: string; status: string; kind?: string }
export type GraphData = { nodes: GraphNode[]; edges: GraphEdge[] }
export type EventDetail = { id: string; kind: string; at: string; advisory: string | null; target: string | null; waves: string[][]; changes: Change[] }

export type AgentItem = {
  agent: string; kind: 'judgment' | 'plan' | 'audit' | 'action'; id: string; project: string | null; decision: string | null
  status: string; title: string | null; detail: string | null; at: string | null; advisory?: string | null; point?: string | null
  links: string[]
}

export type Simulation = { event: string; waves: string[][]; changes: Change[] }

export const passphrase = {
  get: () => { try { return sessionStorage.getItem('retcon-admin') ?? '' } catch { return '' } },
  set: (v: string) => { try { if (v) sessionStorage.setItem('retcon-admin', v); else sessionStorage.removeItem('retcon-admin') } catch { /* ignore */ } },
}

export const api = {
  projects: () => get<Project[]>('/api/projects'),
  decisions: () => get<Decision[]>('/api/decisions'),
  why: (id: string) => get<WhyNode>(`/api/why?id=${encodeURIComponent(id)}`),
  events: () => get<Event[]>('/api/events'),
  agents: () => get<AgentItem[]>('/api/agents?limit=400'),
  graph: (project: string) => get<GraphData>(`/api/graph?project=${encodeURIComponent(project)}`),
  event: (id: string) => get<EventDetail>(`/api/event?id=${encodeURIComponent(id)}`),
  whatIf: (id: string) => get<Simulation>(`/api/whatif?id=${encodeURIComponent(id)}`),
  correct: async (id: string, reason: string): Promise<Simulation> => {
    const res = await fetch('/api/correct', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-retcon-passphrase': passphrase.get() },
      body: JSON.stringify({ id, reason }),
    })
    if (!res.ok) throw new Error(res.status === 403 ? 'Admin passphrase required.' : `${res.status} ${await res.text()}`)
    return res.json()
  },
}
