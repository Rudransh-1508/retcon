import { FlaskConical, ScrollText, Undo2 } from 'lucide-react'
import { TiltCard } from '@/explorer/ui/Tilt'
import { Reveal } from './Reveal'
import { Section } from './Section'

const AGENTS = [
  ['Triage', 'Reads your code and judges whether an advisory is exploitable here, citing file and line.'],
  ['Planner', 'Chooses what to do on GitHub at each decision point, and re-plans when its evidence is withdrawn.'],
  ['Fixer', 'Writes the prose of pull requests and comments from the decision and its chain of support.'],
  ['Auditor', 'Reads every withdrawal, classifies it, and explains why the retraction happened.'],
] as const

export function HowItWorks() {
  return (
    <Section id="how" eyebrow="How it works" title="Memory that keeps its reasons."
      intro="Every belief and every decision records what supports it. That one rule is what lets Retcon take work back, and take back only the right work.">
      <ul className="grid gap-5 md:grid-cols-3 [perspective:1200px]">
        <Card index={0} icon={<ScrollText className="size-5" aria-hidden="true" />} title="Every decision knows why"
          body="A decision is held only while at least one support holds, and a support holds only while all its premises do. Ask why, and you get the whole chain, including what was retracted and when.">
          <Chain items={['GHSA-8cf7', 'jsonwebtoken@8.5.1', 'upgrade to 9.0.0']} />
        </Card>
        <Card index={1} icon={<Undo2 className="size-5" aria-hidden="true" />} title="A withdrawal takes back exactly what it should"
          body="When an advisory is withdrawn, the retraction travels forward wave by wave and every decision it reaches gets an outcome. Nothing is deleted, so the history stays.">
          <ul className="flex flex-wrap gap-2 font-mono text-xs">
            <Chip tone="retract">Cancel: PR closed</Chip>
            <Chip tone="warn">Downgrade: relabelled</Chip>
            <Chip tone="held">Unchanged: text rewritten</Chip>
          </ul>
        </Card>
        <Card index={2} icon={<FlaskConical className="size-5" aria-hidden="true" />} title="Ask what if, before it happens"
          body="Press What if wrong? on any advisory, exposure or judgment. Retcon copies the graph, applies the retraction to the copy, shows what would change, and deletes the copy.">
          <p className="rounded-lg bg-ink/5 px-3 py-2 font-mono text-xs text-muted-foreground">Simulated on a copy. Nothing was written.</p>
        </Card>
      </ul>

      <Reveal className="mt-14">
        <h3 className="font-display text-xl font-semibold tracking-tight">Four agents write into it</h3>
        <p className="mt-1 max-w-2xl text-muted-foreground">They never write a belief without naming its support; the engine rejects it. The memory rules themselves are never left to a model.</p>
        <dl className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          {AGENTS.map(([name, role]) => (
            <div key={name} className="border-t border-line pt-4">
              <dt className="font-display text-base font-semibold">{name}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{role}</dd>
            </div>
          ))}
        </dl>
      </Reveal>
    </Section>
  )
}

function Card({ index, icon, title, body, children }: { index: number; icon: React.ReactNode; title: string; body: string; children: React.ReactNode }) {
  return (
    <li>
      <Reveal delay={index * 0.08} className="h-full">
        <TiltCard className="h-full" max={5}>
          <div className="flex h-full flex-col gap-4 p-6 transform-3d">
            <span className="grid size-10 place-items-center rounded-xl bg-ink text-on-ink translate-z-6">{icon}</span>
            <h3 className="font-display text-xl font-semibold leading-snug tracking-tight translate-z-3">{title}</h3>
            <p className="text-[15px] leading-relaxed text-muted-foreground">{body}</p>
            <div className="mt-auto pt-2">{children}</div>
          </div>
        </TiltCard>
      </Reveal>
    </li>
  )
}

function Chain({ items }: { items: string[] }) {
  return (
    <ol className="grid gap-1.5 font-mono text-xs">
      {items.map((t, i) => (
        <li key={t} className="flex items-center gap-2">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-held" />
          <span className="rounded-md bg-ink/5 px-2 py-1">{t}</span>
          {i < items.length - 1 && <span className="sr-only">supports</span>}
        </li>
      ))}
    </ol>
  )
}

const TONES = { held: 'bg-held/10 text-held ring-held/30', retract: 'bg-retract/10 text-retract ring-retract/30', warn: 'bg-u1/12 text-u1 ring-u1/35' }
function Chip({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  return <li className={`rounded-full px-2.5 py-1 ring-1 ring-inset ${TONES[tone]}`}>{children}</li>
}
