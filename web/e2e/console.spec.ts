import { test, expect, recorded, manifest, withoutWebGL } from './fixtures'

type Decision = { id: string; project: string; package: string; status: string; urgency: string | null; mode: string | null }
type Plan = { rationale: string }
type Why = { plans?: Plan[]; history?: unknown[]; judgments?: unknown[] }
type Event = { kind: string; advisory: string | null; target?: string | null }

const decisions = recorded<Decision[]>('/api/decisions')
const held = decisions.filter((d) => d.status === 'held')
const rich = decisions.find((d) => d.id === manifest.rich)!

async function openDecision(page: import('@playwright/test').Page, d: Decision) {
  await page.getByPlaceholder('Search packages').fill(d.package)
  await page.getByRole('button', { name: `Why: upgrade ${d.package} in ${d.project}`, exact: true }).click()
  return page.getByRole('dialog', { name: 'Why' })
}

test('Decisions shows the summary tiles and the decision cards from the recordings', async ({ page }) => {
  await page.goto('/app')
  const summary = page.getByRole('list', { name: 'Summary' })
  await expect(summary.getByRole('listitem').filter({ hasText: 'Open decisions' })).toContainText(String(held.length))
  await expect(summary.getByRole('listitem').filter({ hasText: 'Urgent now' }))
    .toContainText(String(held.filter((d) => d.urgency === 'P0' || d.urgency === 'P1').length))
  await expect(summary.getByRole('listitem').filter({ hasText: 'Taken back' })).toContainText(String(decisions.length - held.length))
  const first = decisions.find((d) => d.id === manifest.first)!
  await expect(page.getByRole('button', { name: `Why: upgrade ${first.package} in ${first.project}`, exact: true })).toBeVisible()
})

test('Opening a decision shows its chain of support, the Planner reasoning and the history', async ({ page }) => {
  const tree = recorded<Why>(`/api/why?id=${encodeURIComponent(rich.id)}`)
  await page.goto('/app')
  const why = await openDecision(page, rich)
  await expect(why.getByRole('heading', { name: rich.package })).toBeVisible()
  await expect(why.getByRole('img', { name: /^Chain of support:/ })).toBeVisible()
  await expect(why.getByRole('heading', { name: 'Planner' })).toBeVisible()
  await expect(why.getByText(tree.plans![0].rationale)).toBeVisible()
  await expect(why.getByRole('list', { name: 'History' }).getByRole('listitem')).toHaveCount(tree.history!.length)
  await expect(why.getByRole('heading', { name: 'Triage judgments' })).toBeVisible()
})

test('Graph draws a 3D canvas', async ({ page }) => {
  await page.goto('/app?view=graph')
  await expect(page.getByRole('heading', { name: 'The memory, layer by layer.' })).toBeVisible()
  await expect(page.getByRole('img', { name: /3D graph of gladys: \d+ beliefs on 5 plates/ })).toBeVisible()
  await expect(page.locator('canvas')).toBeVisible()
  await expect(page.getByText('The 3D view could not start')).toHaveCount(0)
})

test('Graph explains itself when WebGL is unavailable', async ({ page }) => {
  await withoutWebGL(page)
  await page.goto('/app?view=graph')
  await expect(page.getByText('The 3D view could not start: WebGL is not available in this browser.')).toBeVisible()
  await expect(page.locator('canvas')).toHaveCount(0)
})

test('Agents shows the four agents and their feed', async ({ page }) => {
  await page.goto('/app?view=agents')
  await expect(page.getByRole('heading', { name: 'Four agents, one memory.' })).toBeVisible()
  for (const agent of ['Triage', 'Planner', 'Auditor', 'Fixer']) {
    await expect(page.getByRole('button', { name: new RegExp(`^${agent}: \\d+ entr`) })).toBeVisible()
  }
  await expect(page.getByRole('heading', { name: 'Feed' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Why?' }).first()).toBeVisible()
})

test('Timeline lists withdrawals and corrections', async ({ page }) => {
  const events = recorded<Event[]>('/api/events')
  const withdrawal = events.find((e) => e.kind === 'withdrawn')!
  await page.goto('/app?view=timeline')
  await expect(page.getByRole('heading', { name: 'Every withdrawal and correction.' })).toBeVisible()
  await expect(page.getByText(withdrawal.advisory!).first()).toBeVisible()
})

test('A slow Why response shows that the chain of support is being read', async ({ page, api }) => {
  api.slow('/api/why', 2500)
  await page.goto('/app')
  const why = await openDecision(page, rich)
  await expect(why.getByText('Reading the chain of support')).toBeVisible()
  await expect(why.getByRole('heading', { name: 'Planner' })).toBeVisible({ timeout: 10_000 })
})

test('A failed Decisions response shows an error instead of cards', async ({ page, api }) => {
  api.fail('/api/decisions', 503)
  await page.goto('/app')
  await expect(page.getByText(/Could not load data: 503/)).toBeVisible()
  await expect(page.getByRole('button', { name: /^Why: upgrade / })).toHaveCount(0)
})

test('A failed Why response says so in the panel', async ({ page, api }) => {
  api.fail('/api/why', 500)
  await page.goto('/app')
  const why = await openDecision(page, rich)
  await expect(why.getByText(/500/)).toBeVisible()
})
