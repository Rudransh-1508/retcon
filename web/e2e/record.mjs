// Re-record the API responses the browser tests replay. Reads only; never calls /api/correct.
// Usage: npm run test:record   (RETCON_API=https://... to record from another deployment)

import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const API = process.env.RETCON_API ?? 'https://retcon-kappa.vercel.app'
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'recordings')

// A Decision with Planner plans, history and Triage judgments: the richest Why panel.
const RICH_DECISION = 'decision:gladys:jsonwebtoken'

const manifest = {}

async function record(path) {
  const started = Date.now()
  const res = await fetch(API + path)
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
  const body = await res.json()
  const file = path.replace(/^\/api\//, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/_+$/, '') + '.json'
  await writeFile(join(OUT, file), JSON.stringify(body, null, 1) + '\n')
  manifest[path] = file
  console.log(`${path} -> ${file} (${Date.now() - started} ms)`)
  return body
}

const rank = (d) => (d.status === 'retracted' ? 9 : Number((d.urgency ?? 'P9').slice(1)))
const byUrgency = (a, b) => rank(a) - rank(b) || a.package.localeCompare(b.package)

function heldAdvisory(tree) {
  // The first Advisory that still holds anywhere under the Decision: a target for What-if.
  const stack = [tree]
  while (stack.length) {
    const node = stack.shift()
    if (node.kind === 'Advisory' && node.status === 'held') return node.id
    for (const s of node.supports ?? []) stack.push(...s.premises)
  }
  return null
}

await rm(OUT, { recursive: true, force: true })
await mkdir(OUT, { recursive: true })

const projects = await record('/api/projects')
const decisions = await record('/api/decisions')
await record('/api/agents?limit=400')
const events = await record('/api/events')
for (const p of projects) await record(`/api/graph?project=${encodeURIComponent(p.id)}`)

// The first card in the Decisions view (the most urgent of the first project) and the rich Decision.
const first = decisions.filter((d) => d.project === projects[0].id).sort(byUrgency)[0]
for (const id of new Set([first.id, RICH_DECISION])) {
  const tree = await record(`/api/why?id=${encodeURIComponent(id)}`)
  const advisory = heldAdvisory(tree)
  if (advisory) await record(`/api/whatif?id=${encodeURIComponent(advisory)}`)
}

// The Graph view's load-bearing panel (PageRank on a throwaway copy; the live graph is not changed).
for (const p of projects) await record(`/api/loadbearing?project=${encodeURIComponent(p.id)}`)

// One withdrawal per project, for replaying a retraction in the Graph view.
for (const p of projects) {
  const ev = events.find((e) => e.kind !== 'published' && e.changes.some((c) => c.decision.includes(`:${p.id}:`)))
  const path = ev && `/api/event?id=${encodeURIComponent(ev.id)}`
  if (path && !manifest[path]) await record(path)
}

// The console's tick (POST /api/tick) can start the agents' worker, so it is never recorded from a deployment:
// a fixed answer stands in for it.
await writeFile(join(OUT, 'tick.json'), JSON.stringify({ started: false, why: 'the agents ran recently', age: 240 }, null, 1) + '\n')
manifest['/api/tick'] = 'tick.json'

await writeFile(join(OUT, 'manifest.json'), JSON.stringify({ api: API, recorded: new Date().toISOString(), first: first.id, rich: RICH_DECISION, responses: manifest }, null, 1) + '\n')
console.log(`recorded ${Object.keys(manifest).length} responses from ${API}`)
