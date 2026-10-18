import { Reveal } from './Reveal'

export function Section({ id, eyebrow, title, intro, children }: {
  id: string; eyebrow: string; title: React.ReactNode; intro?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="border-t border-line py-20 sm:py-28">
      <div className="mx-auto max-w-page px-4 sm:px-6">
        <Reveal className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-held">{eyebrow}</p>
          <h2 id={`${id}-title`} className="mt-3 font-display text-3xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl">{title}</h2>
          {intro && <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{intro}</p>}
        </Reveal>
        <div className="mt-12">{children}</div>
      </div>
    </section>
  )
}
