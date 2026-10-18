export type Decision = {
  id: string; project: string; package: string; status: 'held' | 'retracted'
  urgency: string | null; target: string | null; evidence: string[]
}
export type Project = { id: string; repo: string; snapshot_sha: string; snapshot_date: string; open_decisions: number }
export type RetractedBy = { id: string; at: string; reason: string; trigger: string; wave: number }
export type WhyNode = {
  id: string; kind: string; status?: string; [key: string]: unknown
  retracted_by: RetractedBy[]
  supports?: WhySupport[]
}
export type WhySupport = { id: string; kind: string; status: string; by: string | null; premises: WhyNode[]; [key: string]: unknown }
export type Change = { decision: string; change: string; before: Record<string, unknown> | null; after: Record<string, unknown> }
export type Event = { id: string; kind: string; at: string; advisory: string; summary: string; severity: string; changes: Change[] }

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}

export const api = {
  projects: () => get<Project[]>('/api/projects'),
  decisions: () => get<Decision[]>('/api/decisions'),
  why: (id: string) => get<WhyNode>(`/api/why?id=${encodeURIComponent(id)}`),
  events: () => get<Event[]>('/api/events'),
}
