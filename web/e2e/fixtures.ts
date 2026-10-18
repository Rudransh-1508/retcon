import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test as base, expect, type Page, type Route } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const DIR = join(__dirname, 'recordings')

type Manifest = { api: string; recorded: string; first: string; rich: string; responses: Record<string, string> }
export const manifest: Manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8'))

/** A recorded response body, by the request path it answered (for example '/api/decisions'). */
export function recorded<T = unknown>(path: string): T {
  const file = manifest.responses[path]
  if (!file) throw new Error(`no recording for ${path}`)
  return JSON.parse(readFileSync(join(DIR, file), 'utf8')) as T
}

type Rule = { endpoint: string; delay: number; status: number | null }

/**
 * Answers /api requests from the recordings. Tests can slow down or fail any endpoint, matched by path
 * prefix ('/api/why' matches every Why request). Requests that were never recorded get a 404 and fail the test.
 */
export class RecordedApi {
  private rules: Rule[] = []
  readonly missing: string[] = []

  /** Answer requests to this endpoint only after `ms` milliseconds. */
  slow(endpoint: string, ms: number) {
    this.rules.unshift({ endpoint, delay: ms, status: null })
  }

  /** Answer requests to this endpoint with an error status instead of the recording. */
  fail(endpoint: string, status = 500) {
    this.rules.unshift({ endpoint, delay: 0, status })
  }

  async handle(route: Route) {
    const url = new URL(route.request().url())
    const key = url.pathname + url.search
    const rule = this.rules.find((r) => url.pathname === r.endpoint || key.startsWith(r.endpoint))
    if (rule?.delay) await new Promise((done) => setTimeout(done, rule.delay))
    if (rule?.status) return route.fulfill({ status: rule.status, contentType: 'text/plain', body: `simulated ${rule.status}` })
    const file = manifest.responses[key]
    if (!file) {
      this.missing.push(key)
      return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: `not recorded: ${key}` }) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(join(DIR, file)) })
  }
}

/** Make WebGL unavailable before the page's scripts run. */
export async function withoutWebGL(page: Page) {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
      if (kind.startsWith('webgl') || kind === 'experimental-webgl') return null
      return (original as (...a: unknown[]) => unknown).call(this, kind, ...rest)
    } as typeof original
  })
}

/** Accessibility violations (WCAG 2.1 A and AA), once entrance animations have finished. */
export async function axe(page: Page) {
  // Reduced motion keeps opacity fades, and text halfway through one fails contrast. Endless loops are fine.
  await page.waitForFunction(() => document.getAnimations()
    .every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity))
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  return violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => `${n.target.join(' ')}: ${n.failureSummary ?? ''}`) }))
}

export const test = base.extend<{ api: RecordedApi }>({
  api: [async ({ page, baseURL }, use) => {
    const api = new RecordedApi()
    const origin = new URL(baseURL!).origin
    // Nothing leaves the machine: /api comes from the recordings and any other host is refused.
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url())
      if (url.origin !== origin) return route.abort('blockedbyclient')
      if (url.pathname.startsWith('/api/')) return api.handle(route)
      return route.continue()
    })
    await use(api)
    expect(api.missing, 'requests with no recording; run npm run test:record').toEqual([])
  }, { auto: true }],
})

export { expect }
