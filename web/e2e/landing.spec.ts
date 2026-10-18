import { test, expect, axe } from './fixtures'

// The browser has already finished the tour (the fixture's default): the link must start it anyway.

test('Take the tour, reached from the keyboard, opens the console with the tour started', async ({ page }) => {
  await page.goto('/')
  const link = page.getByRole('link', { name: 'Take the tour' })
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute('href', '/app?tour=1')

  for (let i = 0; i < 30 && !(await link.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab')
  await expect(link).toBeFocused()
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(/\/app$/)
  await expect(page.getByRole('dialog', { name: 'Welcome to Retcon' })).toBeVisible()
})

test('Take the tour is quieter than the main call to action', async ({ page }) => {
  await page.goto('/')
  const hero = page.locator('#main')
  const main = hero.getByRole('link', { name: 'Open the live app' })
  const tour = hero.getByRole('link', { name: 'Take the tour' })
  const weight = (el: Element) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, size: parseFloat(s.fontSize) } }
  const [m, t] = [await main.evaluate(weight), await tour.evaluate(weight)]
  expect(t.bg).toBe('rgba(0, 0, 0, 0)')
  expect(m.bg).not.toBe('rgba(0, 0, 0, 0)')
  expect(t.size).toBeLessThanOrEqual(m.size)
})

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme, reducedMotion: 'reduce' })

    test('The landing page has no accessibility violations', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByRole('link', { name: 'Take the tour' })).toBeVisible()
      expect(await axe(page)).toEqual([])
    })
  })
}
