import type { Page } from '@playwright/test'
import { test, expect, recorded, manifest } from './fixtures'

test.use({ tourSeen: false })

type Decision = { id: string; project: string; package: string; status: string; urgency: string | null }
const decisions = recorded<Decision[]>('/api/decisions')
const first = decisions.find((d) => d.id === manifest.first)!

const card = (page: Page, name: string) => page.getByRole('dialog', { name })
const urgencyTab = (page: Page, label: string) => page.getByRole('tablist', { name: 'Urgency' }).getByRole('tab', { name: new RegExp(`^${label}`) })
const decisionCards = (page: Page) => page.getByRole('button', { name: /^Why: upgrade / })

/** From the welcome card to the summary tiles step, past the concept steps. */
async function toTiles(page: Page) {
  await page.goto('/app')
  await page.getByRole('button', { name: 'Start' }).click()
  await card(page, 'Five kinds of belief').getByRole('button', { name: 'Skip step' }).click()
  await card(page, 'What a retraction does').getByRole('button', { name: 'Skip step' }).click()
  await expect(card(page, 'The numbers at a glance')).toBeVisible()
}

/** Whether a click at the centre of this element reaches it, rather than the dim layer. */
async function reachable(page: Page, locator: ReturnType<Page['locator']>) {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return !!hit && (el === hit || el.contains(hit))
  })
}

test('Steps 3 to 5: the tiles, the P0 filter and the first decision, with real clicks', async ({ page }) => {
  await toTiles(page)
  const tiles = card(page, 'The numbers at a glance')
  for (const word of ['Open decisions', 'Urgent now', 'Real pull requests', 'Taken back']) await expect(tiles).toContainText(word)
  await expect.poll(() => reachable(page, page.getByRole('list', { name: 'Summary' }))).toBe(true)
  await tiles.getByRole('button', { name: 'Next' }).click()

  const filter = card(page, 'Narrow the list')
  await expect(filter).toContainText('Click P0.')
  const before = await decisionCards(page).count()
  await urgencyTab(page, 'P0').click()
  await expect(urgencyTab(page, 'P0')).toHaveAttribute('aria-selected', 'true')
  // "Show cancelled" is on, so cancelled decisions that were P0 stay in the list too.
  const p0 = decisions.filter((d) => d.urgency === 'P0').length
  await expect(decisionCards(page)).toHaveCount(p0)
  expect(p0).toBeLessThan(before)

  const open = card(page, 'Open a decision')
  for (const word of ['package', 'version that fixes it', 'urgency', 'real pull request', 'how many advisories hold it']) await expect(open).toContainText(word)
  await page.getByRole('button', { name: `Why: upgrade ${first.package} in ${first.project}`, exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Why' })).toBeVisible()
  await expect(open).toBeHidden()
})

test('While a step waits, clicks outside the highlighted control do nothing', async ({ page }) => {
  await toTiles(page)
  await card(page, 'The numbers at a glance').getByRole('button', { name: 'Next' }).click()
  await expect(card(page, 'Narrow the list')).toBeVisible()

  // The P1 filter and the first card sit outside the cut-out: the dim layer takes the click.
  expect(await reachable(page, urgencyTab(page, 'P1'))).toBe(false)
  const p1 = (await urgencyTab(page, 'P1').boundingBox())!
  await page.mouse.click(p1.x + p1.width / 2, p1.y + p1.height / 2)
  await expect(urgencyTab(page, 'Any')).toHaveAttribute('aria-selected', 'true')
  await expect(card(page, 'Narrow the list')).toBeVisible()
  expect(await reachable(page, urgencyTab(page, 'P0'))).toBe(true)
})

test('Opening the first decision completes step 5 before its Why data arrives', async ({ page, api }) => {
  api.slow('/api/why', 4000)
  await toTiles(page)
  await card(page, 'The numbers at a glance').getByRole('button', { name: 'Next' }).click()
  await urgencyTab(page, 'P0').click()
  await page.getByRole('button', { name: `Why: upgrade ${first.package} in ${first.project}`, exact: true }).click()
  const why = page.getByRole('dialog', { name: 'Why' })
  await expect(why.getByText('Reading the chain of support')).toBeVisible()
  await expect(card(page, 'Open a decision')).toBeHidden()
})
