'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { AnimatePresence, m } from 'framer-motion'
import { Bot, History, LayoutList, Lock, LockOpen, Network, type LucideIcon } from 'lucide-react'
import { api, passphrase } from './api'
import { invalidate, useResource } from './data'
import { useUrlParam } from './useUrlParam'
import { usePointerGlow } from './ui/Glow'
import { Agents } from './views/Agents'
import { Decisions } from './views/Decisions'
import { Timeline } from './views/Timeline'
import { Skeleton } from './ui/States'
import { WhySheet } from './why/WhySheet'
import { LogoMark } from '@/components/site/Logo'
import { ease } from '@/components/site/motion'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

// The 3D graph pulls in three.js, so it only loads when someone opens the Graph view.
const Graph = dynamic(() => import('./views/Graph').then((m) => m.Graph), {
  ssr: false,
  loading: () => <Skeleton className="h-[68dvh] min-h-[440px] rounded-3xl" />,
})

type View = 'decisions' | 'graph' | 'agents' | 'timeline'
const VIEWS: { id: View; label: string; Icon: LucideIcon }[] = [
  { id: 'decisions', label: 'Decisions', Icon: LayoutList },
  { id: 'graph', label: 'Graph', Icon: Network },
  { id: 'agents', label: 'Agents', Icon: Bot },
  { id: 'timeline', label: 'Timeline', Icon: History },
]
const isView = (v: string): v is View => VIEWS.some((x) => x.id === v)

export default function App() {
  usePointerGlow()
  const [rawView, setView] = useUrlParam('view', 'decisions')
  const view: View = isView(rawView) ? rawView : 'decisions'
  const [why, setWhy] = useUrlParam('why', '')
  const [project, setProject] = useState('all')
  const [admin, setAdmin] = useState(() => passphrase.get() !== '')

  const projects = useResource('projects', api.projects)
  const decisions = useResource('decisions', api.decisions)
  const error = projects.error ?? decisions.error

  // After a view change (not on load) move focus to the content so keyboard and screen reader users land in it.
  const main = useRef<HTMLElement>(null)
  const shown = useRef(view)
  useEffect(() => {
    if (shown.current === view) return
    shown.current = view
    main.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0 })
  }, [view])

  const onChanged = () => { invalidate('decisions'); invalidate('projects'); projects.reload(); decisions.reload() }

  return (
    <div className="min-h-dvh">
      <a href="#console" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-on-ink">Skip to content</a>
      <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[80rem] items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 rounded-md">
            <LogoMark />
            <span className="font-display text-lg font-semibold tracking-tight">Retcon</span>
            <span className="hidden rounded-full bg-ink/6 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:inline">console</span>
          </Link>
          <NavPills view={view} onChange={setView} />
          <AdminButton admin={admin} onChange={setAdmin} />
        </div>
      </header>

      <main id="console" ref={main} tabIndex={-1} className="mx-auto max-w-[80rem] px-4 pb-32 pt-8 outline-none focus-visible:ring-0 sm:px-6 md:pb-20 md:pt-10">
        <AnimatePresence mode="wait" initial={false}>
          <m.div key={view} className="[perspective:1400px]" style={{ transformOrigin: '50% 0%' }}
            initial={{ opacity: 0, y: 14, rotateX: 4 }} animate={{ opacity: 1, y: 0, rotateX: 0 }}
            exit={{ opacity: 0, y: -8, transition: { duration: 0.12 } }} transition={{ duration: 0.3, ease }}>
            {view === 'decisions' && (
              <Decisions projects={projects.data ?? []} decisions={decisions.data} error={error} selected={why || null}
                onOpen={setWhy} project={project} onProject={setProject} />
            )}
            {view === 'graph' && <Graph projects={projects.data ?? []} onOpen={setWhy} />}
            {view === 'agents' && <Agents projects={projects.data ?? []} onOpen={setWhy} />}
            {view === 'timeline' && <Timeline onOpen={setWhy} />}
          </m.div>
        </AnimatePresence>
      </main>

      <MobileDock view={view} onChange={setView} />
      <WhySheet key={String(admin)} id={why || null} decisions={decisions.data} onClose={() => setWhy('')} onOpen={setWhy} onChanged={onChanged} />
    </div>
  )
}

// ---- navigation -----------------------------------------------------------------------------------------------

function NavPills({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const list = useRef<HTMLUListElement>(null)
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null)
  useLayoutEffect(() => {
    const measure = () => {
      const li = list.current?.querySelector<HTMLElement>('[aria-current="page"]')?.closest('li')
      if (li) setPill((p) => (p && p.x === li.offsetLeft && p.w === li.offsetWidth ? p : { x: li.offsetLeft, w: li.offsetWidth }))
    }
    measure()
    // The labels change width when the web fonts arrive.
    const ro = new ResizeObserver(measure)
    if (list.current) list.current.querySelectorAll('li').forEach((li) => ro.observe(li))
    return () => ro.disconnect()
  }, [view])
  return (
    <nav aria-label="Views" className="hidden md:block">
      <ul ref={list} className="relative flex items-center gap-1 rounded-full border border-line bg-panel/70 p-1">
        {pill && <m.span aria-hidden="true" className="absolute bottom-1 left-0 top-1 rounded-full bg-ink" initial={false} animate={{ x: pill.x, width: pill.w }} transition={{ duration: 0.28, ease }} />}
        {VIEWS.map(({ id, label, Icon }) => (
          <li key={id} className="relative z-10">
            <button type="button" onClick={() => onChange(id)} aria-current={view === id ? 'page' : undefined}
              className={cn('flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors duration-200', view === id ? 'text-on-ink' : 'text-muted-foreground hover:text-ink')}>
              <Icon className="size-4" aria-hidden="true" />{label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function MobileDock({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <nav aria-label="Views" className="fixed inset-x-3 bottom-3 z-30 md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <ul className="grid grid-cols-4 gap-1 rounded-2xl border border-line bg-paper/90 p-1.5 shadow-[0_18px_40px_-18px_color-mix(in_srgb,var(--ink)_70%,transparent)] backdrop-blur-xl">
        {VIEWS.map(({ id, label, Icon }) => {
          const on = view === id
          return (
            <li key={id}>
              <button type="button" onClick={() => onChange(id)} aria-current={on ? 'page' : undefined}
                className={cn('relative flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium transition-colors duration-200', on ? 'text-on-ink' : 'text-muted-foreground')}>
                <m.span aria-hidden="true" className="absolute inset-0 rounded-xl bg-ink" initial={false} animate={{ opacity: on ? 1 : 0, scale: on ? 1 : 0.9 }} transition={{ duration: 0.22, ease }} />
                <Icon className="relative size-5" aria-hidden="true" />
                <span className="relative">{label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

// ---- admin ----------------------------------------------------------------------------------------------------

function AdminButton({ admin, onChange }: { admin: boolean; onChange: (v: boolean) => void }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  if (admin) {
    return (
      <Button variant="outline" size="sm" className="rounded-full border-held/40 text-held hover:bg-held/10 hover:text-held"
        onClick={() => { passphrase.set(''); onChange(false) }}>
        <LockOpen /><span className="hidden sm:inline">Admin on {'·'} sign out</span><span className="sm:hidden">Sign out</span>
      </Button>
    )
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-full border-line"><Lock />Admin</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 border-line bg-paper">
        <form onSubmit={(e) => { e.preventDefault(); passphrase.set(value); onChange(value !== ''); setOpen(false); setValue('') }} className="space-y-3">
          <div>
            <label htmlFor="admin-passphrase" className="text-sm font-medium">Admin passphrase</label>
            <p className="mt-0.5 text-xs text-muted-foreground">Needed to retract a belief for real. Kept for this tab only.</p>
          </div>
          <input id="admin-passphrase" type="password" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="current-password"
            className="h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm" />
          <Button type="submit" className="w-full" disabled={!value}>Enter</Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
