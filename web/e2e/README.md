# Browser tests

The console is tested the way a visitor uses it: in a real browser (Playwright, Chromium), against the static
export Vercel serves, with every `/api` request answered from responses recorded from the real endpoints. Tests
never touch the live API, and any other host is refused.

## Run

```bash
cd web
npx playwright install chromium   # once
npm run test:e2e
```

`npm run test:e2e` builds the static export, serves `out/` on port 4317 and runs every spec. Set `E2E_SKIP_BUILD=1`
to reuse the last build while iterating. Add `--ui` to watch the browser, or `-g "Why panel"` to run one test.

- `console.spec.ts`: each view loads from the recordings, the Why panel, WebGL fallback, slow and failed responses.
- `a11y.spec.ts`: an axe scan (WCAG 2.1 A and AA) of every view and of the Why panel, in light and dark.

## Recordings

`e2e/recordings/` holds one JSON file per request, and `manifest.json` maps each request path to its file. A
request the console makes with no recording gets a 404 and fails the test, so the recordings always cover what
the console reads.

Re-record from production (reads only, never calls `/api/correct`) after the API or the data changes:

```bash
npm run test:record                                   # from https://retcon-kappa.vercel.app
RETCON_API=http://127.0.0.1:8000 npm run test:record  # from a local server
```

The recorder takes projects, decisions, the agent feed, events, each project's graph, the Why tree and a What-if for
the first Decision card and for `decision:gladys:jsonwebtoken` (which has Planner plans, history and Triage
judgments), and one withdrawal to replay. Tests that read counts or text compute them from the recordings, so a
fresh recording does not need test edits unless a screen changed.

## Writing tests

Import `test` and `expect` from `./fixtures`. The `api` fixture changes how any endpoint answers, matched by path
prefix:

```ts
test('slow Why', async ({ page, api }) => {
  api.slow('/api/why', 2500)       // answer after 2.5 s
  api.fail('/api/decisions', 503)  // answer with an error
})
```

`withoutWebGL(page)` makes WebGL unavailable, and `axe(page)` returns accessibility violations once entrance
animations have finished. Assert on what a visitor sees (roles, names, text), not on markup or component state.
