import { ArrowUpRight } from 'lucide-react'
import { Reveal } from './Reveal'
import { Section } from './Section'
import { PRS } from './links'

const STATS = [
  ['635', 'advisories withdrawn in GitHub’s npm and PyPI data'],
  ['131', 'of them for reasons other than being a duplicate'],
  ['568', 'real events replayed against two projects in about 30 seconds'],
] as const

const RUNS = [
  {
    pkg: 'jsonwebtoken', project: 'gladys', outcome: 'Unchanged', tone: 'text-held ring-held/30 bg-held/10',
    steps: [
      ['2022-12-22', 'Four advisories land, one claiming remote code execution.'],
      ['Triage', 'Reads Gladys’s code: jwt.verify gets the server’s own secret, never attacker input. Judged not reachable here, so the upgrade is P1, not a panic.'],
      ['2023-01-27', 'The RCE claim is withdrawn. Triage’s judgment rested on it, so it is retracted too.'],
      ['Result', 'The pull request stays open, rewritten to show the three advisories that still hold.'],
    ],
  },
  {
    pkg: 'axios', project: 'wiredoor', outcome: 'Cancel, then back', tone: 'text-retract ring-retract/30 bg-retract/10',
    steps: [
      ['2025-07-23', 'A pull request opens for a “transitive critical” advisory.'],
      ['Next day', 'The advisory is withdrawn: the flaw sits in form-data. The pull request closes, and the form-data pull request is untouched.'],
      ['September', 'New axios advisories arrive and the cancelled decision is supported again, so it reopens.'],
    ],
  },
  {
    pkg: 'express', project: 'wiredoor', outcome: 'Cancel', tone: 'text-retract ring-retract/30 bg-retract/10',
    steps: [
      ['Withdrawn', 'The advisory is withdrawn because it “describes a correctness bug, not a vulnerability”.'],
      ['Result', 'Nothing else holds the decision up, so it is cancelled and its pull request closes with an explanation.'],
    ],
  },
] as const

export function RealRuns() {
  return (
    <Section id="proof" eyebrow="Real runs" title="Not a mock-up. Real advisories, real pull requests."
      intro="Retcon replayed GitHub’s real 2019 to 2026 advisory history against two open-source projects and opened, rewrote and closed real pull requests on snapshot copies of them.">
      <ul className="grid gap-6 border-y border-line py-8 sm:grid-cols-3" aria-label="The data">
        {STATS.map(([n, label], i) => (
          <li key={n}><Reveal delay={i * 0.06}>
            <p className="font-display text-5xl font-semibold tabular-nums tracking-tight sm:text-6xl">{n}</p>
            <p className="mt-2 max-w-[16rem] text-sm leading-snug text-muted-foreground">{label}</p>
          </Reveal></li>
        ))}
      </ul>

      <ul className="mt-10 grid gap-5 lg:grid-cols-3">
        {RUNS.map((r, i) => (
          <li key={r.pkg}><Reveal delay={i * 0.08} className="h-full">
            <article className="flex h-full flex-col rounded-2xl border border-line bg-panel p-6">
              <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h3 className="font-mono text-base font-semibold">{r.pkg}</h3>
                <span className="text-sm text-muted-foreground">in {r.project}</span>
                <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${r.tone}`}>{r.outcome}</span>
              </header>
              <ol className="mt-5 grid gap-4 border-l border-line pl-5">
                {r.steps.map(([when, what]) => (
                  <li key={when} className="relative">
                    <span aria-hidden="true" className="absolute -left-[25px] top-1.5 size-2 rounded-full bg-ink/40 ring-4 ring-panel" />
                    <p className="font-mono text-xs text-muted-foreground">{when}</p>
                    <p className="mt-0.5 text-[15px] leading-relaxed">{what}</p>
                  </li>
                ))}
              </ol>
            </article>
          </Reveal></li>
        ))}
      </ul>

      <Reveal className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="text-muted-foreground">See every pull request it opened, rewrote and closed:</span>
        <a href={PRS.gladys} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline">gladys<ArrowUpRight className="size-3.5" aria-hidden="true" /></a>
        <a href={PRS.wiredoor} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline">wiredoor<ArrowUpRight className="size-3.5" aria-hidden="true" /></a>
      </Reveal>
    </Section>
  )
}
