import { defineConfig, devices } from '@playwright/test'

const PORT = 4317

// The console is tested from its static export, as Vercel serves it, with every /api request answered from
// e2e/recordings. See e2e/README.md.
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e/.results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } } }],
  webServer: {
    command: process.env.E2E_SKIP_BUILD ? 'node e2e/serve.mjs' : 'npm run build && node e2e/serve.mjs',
    url: `http://127.0.0.1:${PORT}/app`,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
})
