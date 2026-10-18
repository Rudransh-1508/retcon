import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ErrorNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div role="alert" className={cn('flex items-start gap-2 rounded-xl border border-retract/40 bg-retract/8 px-3.5 py-3 text-sm text-retract', className)}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      <p className="font-display text-lg font-medium">{title}</p>
      {children && <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{children}</p>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-xl bg-ink/7', className)} />
}

export function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <span aria-hidden="true" className="size-3.5 animate-spin rounded-full border-2 border-line border-t-held" />
      {label}
    </div>
  )
}
