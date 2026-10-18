import { ArrowRight } from 'lucide-react'
import { GitHubMark } from './Logo'
import { Reveal } from './Reveal'
import { Section } from './Section'
import { CopyCommand } from './CopyCommand'
import { APP_URL, REPO_URL } from './links'

export function UseIt() {
  return (
    <Section id="use" eyebrow="Use it" title="Free, three ways in."
      intro="There is nothing to buy. Look around the live console, give your own agent Retcon’s memory, or run the whole thing yourself.">
      <ul className="grid gap-5 lg:grid-cols-3">
        <Way index={0} kicker="Look around" title="Open the live console"
          body="Browse the decisions Retcon holds, open the chain of support behind any of them, ask what if, and replay a real withdrawal in 3D."
          action={<a href={APP_URL} className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 font-medium text-on-ink transition-transform duration-200 hover:-translate-y-0.5">Open the console<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></a>} />
        <Way index={1} kicker="Connect your agent" title="Use it over MCP"
          body="Retcon’s memory is an MCP server, read only when remote. Any agent can ask why a pull request is open, or what would change if an advisory were wrong."
          action={<CopyCommand label="Add Retcon to Claude Code" command="claude mcp add --transport http retcon https://retcon-kappa.vercel.app/mcp" />}
          note="Then ask: why is there an open pull request for jsonwebtoken in gladys?" />
        <Way index={2} kicker="Run it yourself" title="Self-host the whole system"
          body="FalkorDB for the graph, a worker that replays the advisory feed, and the API and console. The README walks through it, and the tests run against real FalkorDB."
          action={<a href={REPO_URL} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-line px-6 font-medium transition-colors hover:border-ink/40"><GitHubMark className="size-4" />View the code</a>} />
      </ul>
    </Section>
  )
}

function Way({ index, kicker, title, body, action, note }: { index: number; kicker: string; title: string; body: string; action: React.ReactNode; note?: string }) {
  return (
    <li>
      <Reveal delay={index * 0.08} className="h-full">
        <article className="flex h-full flex-col gap-4 rounded-2xl border border-line bg-panel p-6">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-held">{kicker}</p>
          <h3 className="font-display text-2xl font-semibold tracking-tight">{title}</h3>
          <p className="text-[15px] leading-relaxed text-muted-foreground">{body}</p>
          <div className="mt-auto grid gap-3 pt-2">
            {action}
            {note && <p className="text-sm text-muted-foreground">{note}</p>}
          </div>
        </article>
      </Reveal>
    </li>
  )
}
