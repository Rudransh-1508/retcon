import { ArrowRight } from 'lucide-react'
import { HeroStack } from './HeroStack'
import { APP_URL } from './links'

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 [background-image:radial-gradient(var(--line)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_70%_40%,black,transparent_70%)]" />
      <div className="relative mx-auto grid max-w-page items-center gap-10 px-4 pb-16 pt-10 sm:px-6 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-6 lg:pb-24 lg:pt-20">
        <div className="max-w-xl">
          <p className="rise font-mono text-xs uppercase tracking-[0.16em] text-held">Truth maintenance for agents</p>
          <h1 className="rise mt-4 font-display text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.035em] [animation-delay:60ms] sm:text-6xl lg:text-[4.25rem]">
            Agent memory that can{' '}
            <span className="relative whitespace-nowrap">
              take things back.
              <svg aria-hidden="true" viewBox="0 0 300 12" preserveAspectRatio="none" className="absolute -bottom-1.5 left-0 h-2.5 w-full text-held">
                <path d="M2 8 C 60 2, 140 11, 298 4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="[stroke-dasharray:320] [stroke-dashoffset:320] [animation:draw_0.9s_0.6s_cubic-bezier(0.22,1,0.36,1)_forwards]" />
              </svg>
            </span>
          </h1>
          <p className="rise mt-6 max-w-[34rem] text-lg leading-relaxed text-muted-foreground [animation-delay:140ms]">
            Retcon turns security advisories into real pull requests, and records what every decision rests on.
            When an advisory is withdrawn, it revises exactly the work that depended on it, and nothing more.
          </p>
          <div className="rise mt-8 flex flex-col gap-3 [animation-delay:220ms] sm:flex-row sm:items-center">
            <a href={APP_URL}
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 font-medium text-on-ink shadow-[0_8px_24px_-12px_color-mix(in_srgb,var(--ink)_60%,transparent)] transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0">
              Open the live app
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
            </a>
            <a href="#how" className="inline-flex h-12 items-center justify-center rounded-full border border-line px-6 font-medium text-ink transition-colors duration-200 hover:border-ink/40">
              How it works
            </a>
          </div>
        </div>
        <HeroStack />
      </div>
    </section>
  )
}
