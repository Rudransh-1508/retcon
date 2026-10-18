import { Plus } from 'lucide-react'
import { Section } from './Section'

const FAQ = [
  ['Is it really opening pull requests?',
   'Yes. On two demo repositories: snapshot copies, not forks, of Gladys and wiredoor, so nothing can ever reach the upstream projects. The GitHub token is limited to those two repositories, and the code refuses any other.'],
  ['Does an LLM decide what is true?',
   'No. What holds and what is retracted is decided by the graph, never by a model. The agents write beliefs, and the engine rejects any belief that does not name its support. The Auditor only explains a retraction; it does not decide it.'],
  ['What happens when an advisory is withdrawn?',
   'Every decision that rested on it gets an outcome. Cancel: no support is left, so the pull request is closed with an explanation. Downgrade: support is left but urgency is lower, so it is relabelled with a comment. Unchanged: other advisories still hold it, so only the pull request text is rewritten.'],
  ['Will What if wrong? change anything?',
   'No. It copies the graph, applies the retraction to the copy, shows you what would change, and deletes the copy. Making a correction for real needs an admin passphrase.'],
  ['Why are most withdrawals ignored?',
   'About 80% of withdrawals are duplicates. Retcon links a duplicate to its original and counts them as the same evidence, so withdrawing one changes nothing and touches nothing on GitHub.'],
  ['Which models do the agents use?',
   'Triage, the Planner, the Fixer and the Auditor all use Groq’s gpt-oss-120b. If no model is available, a fixed policy takes over: P0 and P1 get pull requests, the rest go to the report.'],
  ['Can I point it at my own repository?',
   'The hosted demo watches two projects. To watch your own, run Retcon yourself; the README explains the setup.'],
] as const

export function Faq() {
  return (
    <Section id="faq" eyebrow="FAQ" title="Questions people ask first.">
      {/* Native details: no JavaScript, keyboard and screen reader support for free. Opening one closes the others. */}
      <div className="max-w-3xl divide-y divide-line border-y border-line">
        {FAQ.map(([q, a]) => (
          <details key={q} name="faq" className="group">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 font-display text-lg font-medium tracking-tight marker:content-none [&::-webkit-details-marker]:hidden">
              {q}
              <Plus className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-45" aria-hidden="true" />
            </summary>
            <p className="max-w-2xl pb-5 leading-relaxed text-muted-foreground">{a}</p>
          </details>
        ))}
      </div>
    </Section>
  )
}
