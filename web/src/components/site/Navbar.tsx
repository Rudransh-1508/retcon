'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, m, useMotionValueEvent, useScroll } from 'framer-motion'
import { ArrowRight, Menu, X } from 'lucide-react'
import { GitHubMark, LogoMark } from './Logo'
import { APP_URL, NAV, REPO_URL } from './links'
import { ease } from './motion'

export function Navbar() {
  const { scrollY } = useScroll()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 8))

  useEffect(() => {
    if (!open) return
    const close = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open])

  return (
    <header
      className={`sticky top-0 z-40 transition-[background-color,border-color,box-shadow] duration-300 ${
        scrolled || open ? 'border-b border-line bg-paper/85 backdrop-blur-md' : 'border-b border-transparent'
      }`}
    >
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-on-ink">
        Skip to content
      </a>
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-page items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 rounded-md">
          <LogoMark />
          <span className="font-display text-lg font-semibold tracking-tight">Retcon</span>
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <li key={item.href}>
              <a href={item.href} className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors duration-200 hover:text-ink">
                {item.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-1 sm:gap-2">
          <a href={REPO_URL} target="_blank" rel="noreferrer" aria-label="Retcon on GitHub"
            className="grid h-11 w-11 place-items-center rounded-md text-muted-foreground transition-colors duration-200 hover:text-ink">
            <GitHubMark />
          </a>
          <a href={APP_URL}
            className="group hidden h-10 items-center gap-1.5 rounded-full bg-ink pl-4 pr-3.5 text-sm font-medium text-on-ink transition-transform duration-200 hover:-translate-y-px active:translate-y-0 sm:inline-flex">
            Open the live app
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
          </a>
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="grid h-11 w-11 place-items-center rounded-md text-ink md:hidden">
            {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <m.div id="mobile-nav" key="mobile-nav" className="overflow-hidden md:hidden"
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
            transition={{ duration: 0.22, ease }}>
            <ul className="mx-auto max-w-page px-4 pb-4 pt-1">
              {NAV.map((item) => (
                <li key={item.href}>
                  <a href={item.href} onClick={() => setOpen(false)}
                    className="flex h-12 items-center border-b border-line text-base text-ink">{item.label}</a>
                </li>
              ))}
              <li className="pt-4">
                <a href={APP_URL} className="flex h-12 items-center justify-center gap-2 rounded-full bg-ink font-medium text-on-ink">
                  Open the live app <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </li>
            </ul>
          </m.div>
        )}
      </AnimatePresence>
    </header>
  )
}
