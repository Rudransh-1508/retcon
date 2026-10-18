import type { Page } from '@playwright/test'
import { test, expect, settled, skipTo } from './fixtures'

test.use({ tourSeen: false })

const card = (page: Page, name: string) => page.getByRole('dialog', { name })

test('Steps 15 to 17: the Agents tab and an agent, the Timeline, then Finish', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/app')
  await skipTo(page, 'Four agents, one memory')

  const agents = card(page, 'Four agents, one memory')
  // The agent definitions and "still holding" as the Agents view puts them.
  for (const words of ['Triage judges exploitability', 'the Planner chooses what to do on GitHub', 'the Fixer writes the pull requests',
    'the Auditor explains every withdrawal', 'Still holding']) await expect(agents).toContainText(words)
  await page.getByRole('button', { name: 'Agents', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Four agents, one memory.' })).toBeVisible()
  await expect(agents).toBeVisible()

  // The ring turns until the pointer is over it, as it would for a person reaching for the Auditor.
  const auditor = page.getByRole('button', { name: /^Auditor: \d+ entr/ })
  const at = (await auditor.boundingBox())!
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2)
  await (await settled(auditor)).click()
  await expect(auditor).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Still holding', { exact: true })).toBeVisible()

  const timeline = card(page, 'What happened, in order')
  await expect(timeline).toContainText('Auditor')
  await page.getByRole('button', { name: 'Timeline', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Every withdrawal and correction.' })).toBeVisible()

  const finish = card(page, 'You know your way around')
  await expect(finish).toContainText('claude mcp add --transport http retcon https://retcon-kappa.vercel.app/mcp')
  await expect(finish).toContainText('Tour button')
  await expect(finish).toContainText('Admin')
  await finish.getByRole('button', { name: 'Finish' }).click()
  await expect(finish).toBeHidden()
  expect(await page.evaluate(() => localStorage.getItem('retcon-tour'))).toBe('done')
})

test('The tour has the eighteen steps of the script, welcome to finish', async ({ page }) => {
  await page.goto('/app')
  await expect(card(page, 'Welcome to Retcon')).toContainText('1 of 18')
})
