import { GitHubMark, LogoMark } from './Logo'
import { APP_URL, PRS, REPO_URL } from './links'

const LINKS = [
  { href: APP_URL, label: 'Console' },
  { href: `${REPO_URL}/blob/main/CONTEXT.md`, label: 'Glossary', external: true },
  { href: PRS.gladys, label: 'Real PRs: gladys', external: true },
  { href: PRS.wiredoor, label: 'Real PRs: wiredoor', external: true },
]

export function Footer() {
  return (
    <footer className="border-t border-line py-12">
      <div className="mx-auto flex max-w-page flex-col gap-8 px-4 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm">
          <div className="flex items-center gap-2.5"><LogoMark /><span className="font-display text-lg font-semibold tracking-tight">Retcon</span></div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Agent memory that can take things back. Provenance-tracked beliefs in a FalkorDB graph, shared by LLM agents.</p>
        </div>
        <nav aria-label="Footer">
          <ul className="grid gap-x-10 gap-y-1 sm:grid-cols-2">
            {LINKS.map((l) => (
              <li key={l.label}>
                <a href={l.href} {...(l.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                  className="inline-flex min-h-11 items-center text-sm text-muted-foreground transition-colors hover:text-ink">{l.label}</a>
              </li>
            ))}
            <li>
              <a href={REPO_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-ink">
                <GitHubMark className="size-4" />GitHub
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  )
}
