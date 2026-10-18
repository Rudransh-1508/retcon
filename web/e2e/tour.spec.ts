import type { Page } from '@playwright/test'
import { test, expect, manifest } from './fixtures'

// These tests are about a browser that has never seen the tour.
test.use({ tourSeen: false })

const card = (page: Page) => page.getByRole('dialog', { name: 'Welcome to Retcon' })
const finish = (page: Page) => page.getByRole('dialog', { name: 'You know your way around' })
const firstDecision = (page: Page) => page.getByRole('button', { name: /^Why: upgrade / }).first()

test('A first visit starts the tour, and finishing it is remembered', async ({ page }) => {
  await page.goto('/app')
  await expect(card(page)).toBeVisible()
  await expect(card(page)).toContainText('1 of 2')
  await card(page).getByRole('button', { name: 'Start' }).click()
  await expect(finish(page)).toContainText('2 of 2')
  await finish(page).getByRole('button', { name: 'Finish' }).click()
  await expect(finish(page)).toBeHidden()
  expect(await page.evaluate(() => localStorage.getItem('retcon-tour'))).toBe('done')

  await page.reload()
  await expect(firstDecision(page)).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('Skipping the tour asks first, and is remembered', async ({ page }) => {
  await page.goto('/app')
  await card(page).getByRole('button', { name: 'Skip tour' }).click()
  await expect(card(page).getByText('Skip the tour?')).toBeVisible()
  await expect(card(page).getByRole('button', { name: 'Keep going' })).toBeFocused()
  await card(page).getByRole('button', { name: 'Keep going' }).click()
  await expect(card(page).getByRole('button', { name: 'Start' })).toBeVisible()

  await card(page).getByRole('button', { name: 'Skip tour' }).click()
  await card(page).getByRole('button', { name: 'Skip tour' }).click()
  await expect(card(page)).toBeHidden()
  await page.reload()
  await expect(firstDecision(page)).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('Escape offers to skip the tour', async ({ page }) => {
  await page.goto('/app')
  await expect(card(page)).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(card(page).getByText('Skip the tour?')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(card(page).getByText('Skip the tour?')).toBeHidden()
  await expect(card(page)).toBeVisible()
})

for (const [what, query, landed] of [
  ['a Decision', `?why=${encodeURIComponent(manifest.first)}`, (page: Page) => page.getByRole('dialog', { name: 'Why' })],
  ['a view', '?view=timeline', (page: Page) => page.getByRole('heading', { name: 'Every withdrawal and correction.' })],
  ['a project', '?project=wiredoor', (page: Page) => firstDecision(page)],
] as const) {
  test(`A deep link to ${what} does not start the tour`, async ({ page }) => {
    await page.goto(`/app${query}`)
    await expect(landed(page)).toBeVisible()
    await page.waitForTimeout(500)
    await expect(page.getByRole('dialog', { name: 'Welcome to Retcon' })).toHaveCount(0)
  })
}

test('The forced-start parameter starts the tour after it was finished, then leaves the address', async ({ page }) => {
  await page.goto('/app')
  await card(page).getByRole('button', { name: 'Skip tour' }).click()
  await card(page).getByRole('button', { name: 'Skip tour' }).click()

  await page.goto('/app?tour=1')
  await expect(card(page)).toBeVisible()
  await expect.poll(() => new URL(page.url()).search).toBe('')
})

test('The Tour button replays the tour from the welcome card', async ({ page }) => {
  await page.goto('/app')
  await card(page).getByRole('button', { name: 'Start' }).click()
  await finish(page).getByRole('button', { name: 'Finish' }).click()

  await page.getByRole('button', { name: 'Take the tour' }).click()
  await expect(card(page)).toBeVisible()
  await expect(card(page)).toContainText('1 of 2')
})

test('The finish step points at the Tour button', async ({ page }) => {
  await page.goto('/app')
  await card(page).getByRole('button', { name: 'Start' }).click()
  await expect(finish(page)).toContainText('claude mcp add --transport http retcon')
  // The highlighted control stays usable through the dim layer.
  await page.getByRole('button', { name: 'Take the tour' }).click()
  await expect(card(page)).toBeVisible()
})

test('Each step takes focus and the page behind the dim layer cannot be clicked', async ({ page }) => {
  await page.goto('/app')
  await expect(card(page)).toBeFocused()
  const box = (await firstDecision(page).boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(page.getByRole('dialog', { name: 'Why' })).toHaveCount(0)

  await card(page).getByRole('button', { name: 'Start' }).click()
  await expect(finish(page)).toBeFocused()
  // Tab stays between the card and the highlighted control.
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab')
    const inTour = await page.evaluate(() => !!document.activeElement?.closest('[data-tour-layer="card"], [data-tour="tour-button"]'))
    expect(inTour).toBe(true)
  }
})

test('With storage blocked the console works and the tour runs once per page load', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError') } })
  })
  await page.goto('/app')
  await expect(card(page)).toBeVisible()
  await card(page).getByRole('button', { name: 'Skip tour' }).click()
  await card(page).getByRole('button', { name: 'Skip tour' }).click()
  await expect(card(page)).toBeHidden()
  await firstDecision(page).click()
  await expect(page.getByRole('dialog', { name: 'Why' })).toBeVisible()

  await page.goto('/app')
  await expect(card(page)).toBeVisible()
})

test('The tour does not start when the Decisions list fails', async ({ page, api }) => {
  api.fail('/api/decisions', 503)
  await page.goto('/app')
  await expect(page.getByText(/Could not load data: 503/)).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
