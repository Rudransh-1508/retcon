import type { Page } from '@playwright/test'
import { test, expect, settled, skipTo, withoutWebGL } from './fixtures'

test.use({ tourSeen: false })

const card = (page: Page, name: string) => page.getByRole('dialog', { name })

/** Sweep the pointer outward from the middle of the canvas, where the plates sit, until the hover tooltip names a
 *  belief; then click it there. */
async function clickABelief(page: Page) {
  const box = (await page.locator('canvas').boundingBox())!
  const tooltip = page.getByRole('tooltip')
  const points: [number, number][] = []
  for (let row = 1; row < 12; row++) for (let col = 1; col < 18; col++) points.push([col / 18, row / 12])
  points.sort((a, b) => Math.hypot(a[0] - 0.5, a[1] - 0.5) - Math.hypot(b[0] - 0.5, b[1] - 0.5))
  for (const [fx, fy] of points) {
    const x = box.x + box.width * fx, y = box.y + box.height * fy
    await page.mouse.move(x, y)
    if (await tooltip.isVisible()) {
      await page.mouse.click(x, y)
      return
    }
  }
  throw new Error('no belief under the pointer anywhere on the canvas')
}

test('Steps 11 to 14: the Graph tab, orbit, pick a belief and replay, with real input', async ({ page }) => {
  test.setTimeout(120_000) // eleven steps, then a 3D scene rendered in software
  await page.goto('/app')
  await skipTo(page, 'The whole memory')
  await page.getByRole('button', { name: 'Graph', exact: true }).click()

  const orbit = card(page, 'Look around')
  await expect(orbit).toContainText('zoom')
  const canvas = await settled(page.locator('canvas'))
  const box = (await canvas.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width / 2 + i * 15, box.y + box.height / 2 + i * 3)
  await page.mouse.up()

  const pick = card(page, 'Follow one belief')
  await expect(pick).toContainText('Links that skip a plate stay hidden until something is selected')
  await page.waitForTimeout(800) // let the orbit's damping settle
  await clickABelief(page)
  await expect(page.getByRole('button', { name: 'Why?' })).toBeVisible()

  await expect(card(page, 'Replay a withdrawal')).toContainText('magenta pulse')
  const replay = page.getByLabel('Replay a retraction')
  await replay.selectOption({ index: 1 })
  await expect(page.getByRole('status').filter({ hasText: 'Replaying' })).toBeVisible()
  await expect(card(page, 'Replay a withdrawal')).toBeHidden()
})

test('Without WebGL the graph steps are explained and the tour carries on', async ({ page }) => {
  await withoutWebGL(page)
  await page.goto('/app')
  await skipTo(page, 'The whole memory')
  await page.getByRole('button', { name: 'Graph', exact: true }).click()

  for (const title of ['Look around', 'Follow one belief', 'Replay a withdrawal']) {
    const step = card(page, title)
    await expect(step.getByRole('status')).toContainText('is not available right now')
    await step.getByRole('button', { name: 'Next' }).click()
    await expect(step).toBeHidden()
  }
  await expect(page.locator('[data-tour-layer="card"]')).toBeVisible()
})
