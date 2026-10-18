import type { Page } from '@playwright/test'
import { STEPS } from '../src/explorer/tour/script'
import { test, expect, recorded, manifest, settled } from './fixtures'

test.use({ tourSeen: false })

type Decision = { id: string; project: string; package: string }
const first = recorded<Decision[]>('/api/decisions').find((d) => d.id === manifest.first)!

const tourCard = (page: Page) => page.locator('[data-tour-layer="card"]')
const why = (page: Page) => page.getByRole('dialog', { name: 'Why' })

/** The card for step i is showing, with its title and progress. */
async function atStep(page: Page, i: number) {
  const card = page.getByRole('dialog', { name: STEPS[i].title })
  await expect(card).toBeVisible()
  await expect(card).toContainText(`${i + 1} of ${STEPS.length}`)
  return card
}

/** Move the pointer outward from the middle of the canvas until the tooltip names a belief, then click it. */
async function clickABelief(page: Page) {
  const box = (await page.locator('canvas').boundingBox())!
  const points: [number, number][] = []
  for (let row = 1; row < 12; row++) for (let col = 1; col < 18; col++) points.push([col / 18, row / 12])
  points.sort((a, b) => Math.hypot(a[0] - 0.5, a[1] - 0.5) - Math.hypot(b[0] - 0.5, b[1] - 0.5))
  for (const [fx, fy] of points) {
    const x = box.x + box.width * fx, y = box.y + box.height * fy
    await page.mouse.move(x, y)
    if (await page.getByRole('tooltip').isVisible()) return page.mouse.click(x, y)
  }
  throw new Error('no belief under the pointer anywhere on the canvas')
}

test('The whole tour, steps 0 to 17 in order, with real clicks, a real drag and a real selection', async ({ page }) => {
  test.setTimeout(240_000)
  const writes: string[] = []
  // The console's own freshness ping (POST /api/tick, sent once when it opens) is not the tour's and writes no belief.
  page.on('request', (r) => { if (r.url().includes('/api/') && !r.url().includes('/api/tick') && (r.method() !== 'GET' || r.url().includes('/api/correct'))) writes.push(r.url()) })
  await page.goto('/app')

  // 0. Welcome
  await (await atStep(page, 0)).getByRole('button', { name: 'Start' }).click()
  // 1. Five kinds of belief: every plate, bottom up
  let card = await atStep(page, 1)
  for (const kind of ['Advisory', 'Exposure', 'Judgment', 'Decision', 'Plan']) await card.getByRole('button', { name: new RegExp(`^${kind}`) }).click()
  await card.getByRole('button', { name: 'Next' }).click()
  // 2. What a retraction does: every outcome
  card = await atStep(page, 2)
  for (const outcome of ['Cancel', 'Downgrade', 'Unchanged']) await card.getByRole('button', { name: new RegExp(`^${outcome}`) }).click()
  await card.getByRole('button', { name: 'Next' }).click()
  // 3. The summary tiles
  await (await atStep(page, 3)).getByRole('button', { name: 'Next' }).click()
  // 4. The P0 filter
  await atStep(page, 4)
  await page.getByRole('tablist', { name: 'Urgency' }).getByRole('tab', { name: /^P0/ }).click()
  // 5. The first decision card
  await atStep(page, 5)
  await page.getByRole('button', { name: `Why: upgrade ${first.package} in ${first.project}`, exact: true }).click()
  await expect(why(page)).toBeVisible()
  // 6. The chain of support
  await atStep(page, 6)
  await (await settled(why(page).getByRole('img', { name: /^Chain of support:/ }))).hover()
  // 7. The Planner and the history
  await (await atStep(page, 7)).getByRole('button', { name: 'Next' }).click()
  // 8. What if wrong? on an advisory
  await atStep(page, 8)
  await (await settled(page.locator('[data-tour="what-if"]').first())).click()
  // 9. The What-if result, then close it
  await atStep(page, 9)
  await expect(why(page).getByRole('region', { name: 'What if' })).toContainText('nothing was written')
  await why(page).getByRole('button', { name: 'Close what-if' }).click()
  // 10. Close the panel
  await atStep(page, 10)
  await why(page).getByRole('button', { name: 'Close', exact: true }).click()
  await expect(why(page)).toBeHidden()
  // 11. The Graph tab
  await atStep(page, 11)
  await page.getByRole('button', { name: 'Graph', exact: true }).click()
  // 12. Drag to orbit
  await atStep(page, 12)
  const canvas = (await (await settled(page.locator('canvas'))).boundingBox())!
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(canvas.x + canvas.width / 2 + i * 15, canvas.y + canvas.height / 2 + i * 3)
  await page.mouse.up()
  // 13. Click a belief
  await atStep(page, 13)
  await page.waitForTimeout(800)
  await clickABelief(page)
  // 14. Replay a withdrawal
  await atStep(page, 14)
  await page.getByLabel('Replay a retraction').selectOption({ index: 1 })
  // 15. The Agents tab, then the Auditor
  await atStep(page, 15)
  await page.getByRole('button', { name: 'Agents', exact: true }).click()
  const auditor = page.getByRole('button', { name: /^Auditor: \d+ entr/ })
  const at = (await auditor.boundingBox())!
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2)
  await (await settled(auditor)).click()
  // 16. The Timeline tab
  await atStep(page, 16)
  await page.getByRole('button', { name: 'Timeline', exact: true }).click()
  // 17. Finish
  card = await atStep(page, 17)
  await expect(card).toContainText('claude mcp add')
  await card.getByRole('button', { name: 'Finish' }).click()
  await expect(tourCard(page)).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('retcon-tour'))).toBe('done')

  // Nothing written to the live graph, and the passphrase was never asked for.
  expect(writes).toEqual([])
  await expect(page.getByLabel('Admin passphrase')).toHaveCount(0)
})

test('Guard: every step\'s target is on its screen once the recorded data has rendered', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto('/app')
  await page.getByRole('button', { name: 'Start' }).click()
  for (let i = 1; i < STEPS.length; i++) {
    const step = STEPS[i]
    await atStep(page, i)
    if (step.target) {
      const names = typeof step.target === 'string' ? [step.target] : [...step.target]
      const found = page.locator(names.map((n) => `[data-tour~="${n}"]`).join(', ')).filter({ visible: true })
      await expect(found.first(), `step ${i} "${step.id}" has no visible target ${names.join(' or ')}`).toBeVisible({ timeout: 20_000 })
    }
    // The What-if result only exists once a What-if is open: make step 9's screen the way a visitor would.
    if (step.id === 'what-if') await (await settled(page.locator('[data-tour="what-if"]').first())).click()
    else if (i < STEPS.length - 1) await tourCard(page).getByRole('button', { name: /^(Skip step|Next)$/ }).first().click()
  }
})
