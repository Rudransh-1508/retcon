import { Bot, Package, Route, ScrollText, Scale, SearchCheck, ShieldAlert, Target, Wrench, ListChecks, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export const KIND_ICON: Record<string, LucideIcon> = {
  Advisory: ShieldAlert, Exposure: Package, Judgment: Scale, Decision: Target, Plan: Route,
}

export const AGENT_ICON: Record<string, LucideIcon> = {
  Triage: SearchCheck, Planner: Route, Auditor: ScrollText, Fixer: Wrench, Policy: ListChecks,
}

export function KindChip({ kind, className }: { kind: string; className?: string }) {
  const Icon = KIND_ICON[kind] ?? Bot
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md bg-ink/6 px-1.5 py-0.5 font-mono text-[11px] font-medium text-ink/80', className)}>
      <Icon className="size-3" aria-hidden="true" />{kind}
    </span>
  )
}

export function AgentChip({ agent, className }: { agent: string; className?: string }) {
  const Icon = AGENT_ICON[agent] ?? Bot
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 text-[11px] font-medium text-on-ink', className)}>
      <Icon className="size-3" aria-hidden="true" />{agent}
    </span>
  )
}
