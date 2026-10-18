'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { m } from 'framer-motion'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { ease } from '@/components/site/motion'

export type Option<T extends string> = { value: T; label: string; count?: number }

/** shadcn Tabs as a filter: a pill slides under the active option. */
export function Segmented<T extends string>({ value, onValueChange, options, label, className }: {
  value: T; onValueChange: (v: T) => void; options: Option<T>[]; label: string; className?: string
}) {
  const list = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null)

  useLayoutEffect(() => {
    const measure = () => {
      const el = list.current?.querySelector<HTMLElement>('[data-state="active"]')
      if (el) setPill((p) => (p && p.x === el.offsetLeft && p.w === el.offsetWidth ? p : { x: el.offsetLeft, w: el.offsetWidth }))
    }
    measure()
    // Triggers change width when the fonts arrive or a count changes, so watch each one as well as the list.
    const ro = new ResizeObserver(measure)
    if (list.current) { ro.observe(list.current); list.current.querySelectorAll('[role="tab"]').forEach((t) => ro.observe(t)) }
    return () => ro.disconnect()
  }, [value, options])

  return (
    <Tabs value={value} onValueChange={(v) => onValueChange(v as T)} className={className}>
      <TabsList ref={list} aria-label={label}
        className="relative h-10 w-full max-w-full justify-start gap-0 overflow-x-auto rounded-full border border-line bg-panel/70 p-1 sm:w-fit">
        {pill && (
          <m.span aria-hidden="true" className="absolute top-1 bottom-1 left-0 rounded-full bg-ink"
            initial={false} animate={{ x: pill.x, width: pill.w }} transition={{ duration: 0.28, ease }} />
        )}
        {options.map((o) => (
          // These tabs filter one list, so there is no panel for aria-controls to point at.
          <TabsTrigger key={o.value} value={o.value} aria-controls={undefined}
            className={cn('relative z-10 h-8 flex-none rounded-full border-0 px-3.5 text-[13px] font-medium capitalize shadow-none transition-colors duration-200 data-[state=active]:bg-transparent data-[state=active]:text-on-ink data-[state=active]:shadow-none',
              'text-muted-foreground hover:text-ink data-[state=active]:hover:text-on-ink',
              // shadcn's own dark: variants would otherwise win in dark mode.
              'dark:text-muted-foreground dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-transparent dark:data-[state=active]:text-on-ink')}>
            {o.label}
            {o.count !== undefined && <span className="ml-1.5 font-mono text-[11px]">{o.count}</span>}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
