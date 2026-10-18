// Serves the static export in out/ the way Vercel does (clean URLs), for the browser tests.
// /api/* is never served here: the tests answer it from e2e/recordings.

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../out/', import.meta.url))
const PORT = Number(process.env.PORT ?? 4317)
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain',
}

async function file(path) {
  try { return (await stat(path)).isFile() ? path : null } catch { return null }
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost')
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '')
  const base = join(ROOT, safe)
  const found = (await file(base)) ?? (await file(`${base}.html`)) ?? (await file(join(base, 'index.html')))
  if (!found || pathname.startsWith('/api/')) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found')
    return
  }
  res.writeHead(200, { 'content-type': TYPES[extname(found)] ?? 'application/octet-stream' })
  res.end(await readFile(found))
}).listen(PORT, '127.0.0.1', () => console.log(`serving out/ on http://127.0.0.1:${PORT}`))
