import { test, expect, axe, manifest, recorded, skipToFinish } from './fixtures'

type Decision = { id: string; project: string; package: string }
const rich = recorded<Decision[]>('/api/decisions').find((d) => d.id === manifest.rich)!

// Scans run with reduced motion so they see each screen at rest, not halfway through an entrance animation.
for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme, reducedMotion: 'reduce' })

    test('Decisions has no accessibility violations', async ({ page }) => {
      await page.goto('/app')
      await expect(page.getByRole('button', { name: /^Why: upgrade / }).first()).toBeVisible()
      expect(await axe(page)).toEqual([])
    })

    test('Graph has no accessibility violations', async ({ page }) => {
      await page.goto('/app?view=graph')
      await expect(page.getByRole('img', { name: /beliefs on 5 plates/ })).toBeVisible()
      expect(await axe(page)).toEqual([])
    })

    test('Agents has no accessibility violations', async ({ page }) => {
      await page.goto('/app?view=agents')
      await expect(page.getByRole('heading', { name: 'Feed' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Why?' }).first()).toBeVisible()
      expect(await axe(page)).toEqual([])
    })

    test('Timeline has no accessibility violations', async ({ page }) => {
      await page.goto('/app?view=timeline')
      await expect(page.getByRole('heading', { name: 'Every withdrawal and correction.' })).toBeVisible()
      await expect(page.getByRole('article').first()).toBeVisible()
      expect(await axe(page)).toEqual([])
    })

    test('The Why panel has no accessibility violations', async ({ page }) => {
      await page.goto('/app')
      await page.getByPlaceholder('Search packages').fill(rich.package)
      await page.getByRole('button', { name: `Why: upgrade ${rich.package} in ${rich.project}`, exact: true }).click()
      const why = page.getByRole('dialog', { name: 'Why' })
      await expect(why.getByRole('heading', { name: 'Planner' })).toBeVisible()
      expect(await axe(page)).toEqual([])
    })

    test.describe('first visit', () => {
      test.use({ tourSeen: false })

      test('The tour card has no accessibility violations', async ({ page }) => {
        await page.goto('/app')
        await expect(page.getByRole('dialog', { name: 'Welcome to Retcon' })).toBeVisible()
        expect(await axe(page)).toEqual([])
        await page.getByRole('button', { name: 'Start' }).click()
        await expect(page.getByRole('dialog', { name: 'Five kinds of belief' })).toBeVisible()
        await page.getByRole('button', { name: /^Judgment/ }).click()
        expect(await axe(page)).toEqual([])
        await page.getByRole('button', { name: 'Skip step' }).click()
        await page.getByRole('button', { name: /^Downgrade/ }).click()
        expect(await axe(page)).toEqual([])
        await page.getByRole('button', { name: 'Back' }).click()
        await page.getByRole('button', { name: 'Back' }).click()
        await skipToFinish(page)
        expect(await axe(page)).toEqual([])
      })
    })
  })
}
