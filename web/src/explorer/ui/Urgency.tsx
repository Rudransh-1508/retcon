import { cn } from '@/lib/utils'

const URGENCY = ['text-u0 bg-u0/12 ring-u0/35', 'text-u1 bg-u1/12 ring-u1/35', 'text-u2 bg-u2/12 ring-u2/35', 'text-u3 bg-u3/12 ring-u3/35']

export function Urgency({ value, className }: { value: string | null | undefined; className?: string }) {
  if (!value) {
    return <span className={cn('inline-grid h-6 min-w-9 place-items-center rounded-md text-xs text-muted-foreground ring-1 ring-line ring-inset', className)} aria-label="no urgency">-</span>
  }
  const tone = URGENCY[Math.min(3, Number(value.slice(1)) || 3)]
  return (
    <span className={cn('inline-grid h-6 min-w-9 place-items-center rounded-md px-1.5 font-mono text-xs font-semibold ring-1 ring-inset', tone, className)}
      aria-label={`urgency ${value}`}>{value}</span>
  )
}

const SEVERITY: Record<string, string> = { critical: URGENCY[0], high: URGENCY[1], moderate: URGENCY[2], medium: URGENCY[2], low: URGENCY[3] }

export function Severity({ value }: { value: string | null | undefined }) {
  if (!value) return null
  const key = value.toLowerCase()
  return <span className={cn('rounded px-1.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide ring-1 ring-inset', SEVERITY[key] ?? URGENCY[3])}>{key}</span>
}

export function StatusPill({ held, label }: { held: boolean; label?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
      held ? 'bg-held/10 text-held ring-held/30' : 'bg-retract/10 text-retract ring-retract/30')}>
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', held ? 'bg-held' : 'bg-retract')} />
      {label ?? (held ? 'held' : 'retracted')}
    </span>
  )
}
