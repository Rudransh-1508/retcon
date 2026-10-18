import type { Page } from '@playwright/test'
import { test, expect, recorded, manifest, settled } from './fixtures'

test.use({ tourSeen: false })

type Decision = { id: string; project: string; package: string }
const first = recorded<Decision[]>('/api/decisions').find((d) => d.id === manifest.first)!

const card = (page: Page, name: string) => page.getByRole('dialog', { name })
const why = (page: Page) => page.getByRole('dialog', { name: 'Why' })

/** Through the welcome, concept and Decisions steps, opening the first Decision for real. */
async function openFirstDecision(page: Page) {
  await page.goto('/app')
  await page.getByRole('button', { name: 'Start' }).click()
  await card(page, 'Five kinds of belief').getByRole('button', { name: 'Skip step' }).click()
  await card(page, 'What a retraction does').getByRole('button', { name: 'Skip step' }).click()
  await card(page, 'The numbers at a glance').getByRole('button', { name: 'Next' }).click()
  await page.getByRole('tablist', { name: 'Urgency' }).getByRole('tab', { name: /^P0/ }).click()
  await page.getByRole('button', { name: `Why: upgrade ${first.package} in ${first.project}`, exact: true }).click()
  await expect(why(page)).toBeVisible()
}

test('Steps 6 to 10 inside the Why panel, with real pointer and clicks', async ({ page }) => {
  const writes: string[] = []
  page.on('request', (r) => { if (r.url().includes('/api/') && (r.method() !== 'GET' || r.url().includes('/api/correct'))) writes.push(r.url()) })
  await openFirstDecision(page)

  await expect(card(page, 'The chain of support')).toBeVisible()
  await why(page).getByRole('img', { name: /^Chain of support:/ }).hover()

  const planner = card(page, 'What the Planner decided')
  await expect(planner).toContainText('history')
  await planner.getByRole('button', { name: 'Next' }).click()

  await expect(card(page, 'Ask what if')).toContainText('writes nothing')
  await (await settled(page.locator('[data-tour="what-if"]').first())).click()

  const result = card(page, 'What would change')
  await expect(result).toContainText('cancelled, downgraded or left unchanged')
  await expect(result).toContainText('the tour never does')
  await expect(why(page).getByRole('region', { name: 'What if' })).toContainText('nothing was written')
  await why(page).getByRole('button', { name: 'Close what-if' }).click()

  await expect(card(page, 'Back to the list')).toBeVisible()
  await why(page).getByRole('button', { name: 'Close', exact: true }).click()
  await expect(why(page)).toBeHidden()
  await expect(card(page, 'Back to the list')).toBeHidden()

  expect(writes).toEqual([])
  await expect(page.getByLabel('Admin passphrase')).toHaveCount(0)
})

test('The tour opens the first Decision itself when step 5 was skipped', async ({ page }) => {
  await page.goto('/app')
  await page.getByRole('button', { name: 'Start' }).click()
  await card(page, 'Five kinds of belief').getByRole('button', { name: 'Skip step' }).click()
  await card(page, 'What a retraction does').getByRole('button', { name: 'Skip step' }).click()
  await card(page, 'The numbers at a glance').getByRole('button', { name: 'Next' }).click()
  await card(page, 'Narrow the list').getByRole('button', { name: 'Skip step' }).click()
  await card(page, 'Open a decision').getByRole('button', { name: 'Skip step' }).click()
  await expect(why(page).getByRole('heading', { name: new RegExp(`Upgrade ${first.package.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`) })).toBeVisible()
  await expect(card(page, 'The chain of support')).toBeVisible()
})

test('A slow Why shows the waiting message, Skip step moves on, and a target that never appears is explained', async ({ page, api }) => {
  test.setTimeout(90_000)
  api.slow('/api/why', 60_000)
  await openFirstDecision(page)

  const chain = card(page, 'The chain of support')
  await expect(why(page).getByText('Reading the chain of support')).toBeVisible()
  await expect(chain.getByRole('status')).toContainText('Waiting for this part of the page to load')
  await chain.getByRole('button', { name: 'Skip step' }).click()

  const planner = card(page, 'What the Planner decided')
  await expect(planner.getByRole('status')).toContainText('did not appear', { timeout: 30_000 })
  await planner.getByRole('button', { name: 'Next' }).click()
  await expect(card(page, 'Ask what if')).toBeVisible()
})

test('A failed What-if turns steps 8 and 9 into plain explanation', async ({ page, api }) => {
  api.fail('/api/whatif', 500)
  await openFirstDecision(page)
  await why(page).getByRole('img', { name: /^Chain of support:/ }).hover()
  await card(page, 'What the Planner decided').getByRole('button', { name: 'Next' }).click()
  await (await settled(page.locator('[data-tour="what-if"]').first())).click()

  const result = card(page, 'What would change')
  await expect(result.getByRole('status')).toContainText('is not available right now')
  await result.getByRole('button', { name: 'Back' }).click()
  await expect(card(page, 'Ask what if').getByRole('status')).toContainText('is not available right now')
  await card(page, 'Ask what if').getByRole('button', { name: 'Next' }).click()
  await result.getByRole('button', { name: 'Next' }).click()
  await expect(card(page, 'Back to the list')).toBeVisible()
})

test('The Why panel is modal again once the tour is over', async ({ page }) => {
  await openFirstDecision(page)
  // During the tour the page behind the panel stays in reach of the tour.
  await expect(page.getByRole('heading', { name: 'What Retcon holds, and why.' })).toBeVisible()
  await card(page, 'The chain of support').getByRole('button', { name: 'Skip tour' }).click()
  await card(page, 'The chain of support').getByRole('button', { name: 'Skip tour' }).click()
  await expect(page.locator('[data-tour-layer]')).toHaveCount(0)

  await expect(why(page)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'What Retcon holds, and why.' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(why(page)).toBeHidden()
})
