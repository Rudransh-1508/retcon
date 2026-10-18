import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

test.use({ tourSeen: false })

const beliefs = (page: Page) => page.getByRole('dialog', { name: 'Five kinds of belief' })
const outcomes = (page: Page) => page.getByRole('dialog', { name: 'What a retraction does' })

// Bottom plate first, with a phrase from each definition.
const KINDS = [
  ['Advisory', 'outside claim'],
  ['Exposure', 'really uses one of those vulnerable versions'],
  ['Judgment', 'Triage, an agent'],
  ['Decision', 'urgency from P0 (most urgent) to P3'],
  ['Plan', 'the Planner, an agent'],
] as const

const OUTCOMES = [
  ['Cancel', 'nothing supports it', 'Advisory, Exposure, Judgment, Decision, Plan'],
  ['Downgrade', 'at a lower urgency', 'Advisory, Judgment, Decision, Plan'],
  ['Unchanged', 'nothing above it changes', 'Advisory'],
] as const

async function toBeliefs(page: Page) {
  await page.goto('/app')
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(beliefs(page)).toBeVisible()
}

test('Step 1 moves on only once all five plates have been read, each revealing its definition', async ({ page }) => {
  await toBeliefs(page)
  const card = beliefs(page)
  for (const [i, [kind, phrase]] of KINDS.entries()) {
    await expect(card.getByRole('button', { name: 'Next' })).toHaveCount(0)
    await card.getByRole('button', { name: new RegExp(`^${kind}`) }).click()
    await expect(card.getByRole('button', { name: new RegExp(`^${kind}`) })).toHaveAttribute('aria-pressed', 'true')
    await expect(card.getByRole('status').filter({ hasText: phrase })).toBeVisible()
    await expect(card).toContainText(`${i + 1} of 5 plates read`)
  }
  await card.getByRole('button', { name: 'Next' }).click()
  await expect(outcomes(page)).toBeVisible()
})

test('Step 2 moves on only once all three outcomes have been seen, each changing the right plates', async ({ page }) => {
  await toBeliefs(page)
  await beliefs(page).getByRole('button', { name: 'Skip step' }).click()
  const card = outcomes(page)
  for (const [outcome, phrase, plates] of OUTCOMES) {
    await expect(card.getByRole('button', { name: 'Next' })).toHaveCount(0)
    await card.getByRole('button', { name: new RegExp(`^${outcome}`) }).click()
    const status = card.getByRole('status').filter({ hasText: phrase })
    await expect(status).toBeVisible()
    await expect(status).toContainText(`Plates that change: ${plates}`)
  }
  await card.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('dialog', { name: 'You know your way around' })).toBeVisible()
})

test('Skip step moves past both concept steps', async ({ page }) => {
  await toBeliefs(page)
  await beliefs(page).getByRole('button', { name: 'Skip step' }).click()
  await outcomes(page).getByRole('button', { name: 'Skip step' }).click()
  await expect(page.getByRole('dialog', { name: 'You know your way around' })).toBeVisible()
})

test('The diagram can be completed from the keyboard', async ({ page }) => {
  await toBeliefs(page)
  const card = beliefs(page)
  await expect(card).toBeFocused()
  for (const [kind] of [...KINDS].reverse()) {
    // Plates are listed top to bottom, so Tab meets Plan first.
    await page.keyboard.press('Tab')
    await expect(card.getByRole('button', { name: new RegExp(`^${kind}`) })).toBeFocused()
    await page.keyboard.press('Space')
  }
  await expect(card).toContainText('5 of 5 plates read')
  await expect(card.getByRole('button', { name: 'Next' })).toBeVisible()
})

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('the diagram changes without animating', async ({ page }) => {
    await toBeliefs(page)
    const diagram = beliefs(page).locator('[data-tour-diagram]')
    await beliefs(page).getByRole('button', { name: /^Exposure/ }).click()
    expect(await diagram.evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0)
  })
})
