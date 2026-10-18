import type { Locator, Page } from '@playwright/test'
import { test, expect, axe, settled, skipTo } from './fixtures'

test.use({ tourSeen: false })

const card = (page: Page, name: string) => page.getByRole('dialog', { name })
const tourCard = (page: Page) => page.locator('[data-tour-layer="card"]')
const why = (page: Page) => page.getByRole('dialog', { name: 'Why' })
const back = async (page: Page) => tourCard(page).getByRole('button', { name: 'Back' }).click()

/** The centre of this element is under the pointer, not under the card or the dim layer. */
async function reachable(locator: Locator) {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return !!hit && (el === hit || el.contains(hit))
  })
}

test.describe('Back', () => {
  test('from the chain of support closes the Why panel again', async ({ page }) => {
    await page.goto('/app')
    await skipTo(page, 'The chain of support')
    await expect(why(page)).toBeVisible()
    await back(page)
    await expect(card(page, 'Open a decision')).toBeVisible()
    await expect(why(page)).toBeHidden()
    await expect(page.getByRole('heading', { name: 'What Retcon holds, and why.' })).toBeVisible()
  })

  test('from the Graph returns to the Decisions view', async ({ page }) => {
    await page.goto('/app')
    await skipTo(page, 'Look around')
    await expect(page.getByRole('heading', { name: 'The memory, layer by layer.' })).toBeVisible()
    await back(page)
    await expect(card(page, 'The whole memory')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'What Retcon holds, and why.' })).toBeVisible()
  })

  test('to a What-if result that is gone asks the question again, with the panel open', async ({ page }) => {
    await page.goto('/app')
    await skipTo(page, 'The whole memory')
    await expect(why(page)).toBeHidden()
    await back(page)
    await expect(card(page, 'Back to the list')).toBeVisible()
    await expect(why(page)).toBeVisible()
    await back(page)
    await expect(card(page, 'Ask what if')).toBeVisible()
  })

  test('from the Timeline step returns to the Agents step', async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto('/app')
    await skipTo(page, 'What happened, in order')
    await back(page)
    await expect(card(page, 'Four agents, one memory')).toBeVisible()
  })
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test('the card sits at the bottom and the highlighted control stays visible and tappable', async ({ page }) => {
    await page.goto('/app')
    await skipTo(page, 'The numbers at a glance')
    const tiles = page.getByRole('list', { name: 'Summary' })
    await settled(tiles)
    const [box, cardBox] = [(await tiles.boundingBox())!, (await settled(tourCard(page)).then((c) => c.boundingBox()))!]
    expect(cardBox.y + cardBox.height).toBeGreaterThan(844 - 40)
    expect(box.y + box.height / 2).toBeLessThan(cardBox.y)
    expect(await reachable(tiles)).toBe(true)

    await tourCard(page).getByRole('button', { name: 'Next' }).click()
    const p0 = page.getByRole('tablist', { name: 'Urgency' }).getByRole('tab', { name: /^P0/ })
    await settled(p0)
    expect(await reachable(p0)).toBe(true)
    await p0.tap()
    await expect(card(page, 'Open a decision')).toBeVisible()
  })

  test('a control pinned to the bottom of the screen puts the card on top', async ({ page }) => {
    await page.goto('/app')
    await skipTo(page, 'The whole memory')
    const tab = page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Graph' }).last()
    await settled(tourCard(page))
    const [box, cardBox] = [(await tab.boundingBox())!, (await tourCard(page).boundingBox())!]
    expect(cardBox.y + cardBox.height).toBeLessThan(box.y)
    expect(await reachable(tab)).toBe(true)
    await tab.tap()
    await expect(card(page, 'Look around')).toBeVisible()
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`the card is legible in ${colorScheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
      await page.goto('/app')
      await skipTo(page, 'Narrow the list')
      expect(await axe(page)).toEqual([])
    })
  }
})

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('the highlight and the card change without animating', async ({ page }) => {
    await page.goto('/app')
    await skipTo(page, 'The numbers at a glance')
    await tourCard(page).getByRole('button', { name: 'Next' }).click()
    await expect(card(page, 'Narrow the list')).toBeVisible()
    const state = () => page.evaluate(() => {
      const layers = [...document.querySelectorAll('[data-tour-layer]')]
      const ring = document.querySelector('[data-tour-layer="dim"] rect')
      return {
        animations: layers.flatMap((l) => l.getAnimations({ subtree: true })).filter((a) => a.playState === 'running').length,
        ring: ring ? ['x', 'y', 'width', 'height'].map((k) => ring.getAttribute(k)).join(',') : null,
        card: JSON.stringify(document.querySelector('[data-tour-layer="card"]')!.getBoundingClientRect()),
      }
    })
    const now = await state()
    expect(now.animations).toBe(0)
    await page.waitForTimeout(400)
    const later = await state()
    expect(later.ring).toBe(now.ring)
    expect(later.card).toBe(now.card)
  })
})
