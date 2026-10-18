'use client'

import { useEffect, useRef, useState } from 'react'
import { m } from 'framer-motion'
import { ArrowRight, FlaskConical, X } from 'lucide-react'
import { api, passphrase, type Simulation } from '../api'
import { Urgency } from '../ui/Urgency'
import { ErrorNote, Spinner } from '../ui/States'
import { Button } from '@/components/ui/button'
import { ease } from '@/components/site/motion'
import { plural } from '../format'

const WOULD: Record<string, string> = {
  cancel: 'would be cancelled', downgrade: 'would be downgraded', unchanged: 'would keep its priority',
  escalate: 'would escalate', new: 'would open', updated: 'would change',
}
const DID: Record<string, string> = {
  cancel: 'was cancelled', downgrade: 'was downgraded', unchanged: 'kept its priority',
  escalate: 'escalated', new: 'opened', updated: 'changed',
}

export function WhatIf({ target, onClose, onDone, onOpen, onGhost }: {
  target: string; onClose: () => void; onDone: () => void; onOpen: (id: string) => void; onGhost: (ids: Set<string>) => void
}) {
  const [sim, setSim] = useState<Simulation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [applied, setApplied] = useState(false)
  const ghost = useRef(onGhost)
  useEffect(() => { ghost.current = onGhost })

  useEffect(() => {
    let live = true
    api.whatIf(target)
      .then((s) => { if (live) { setSim(s); ghost.current(new Set(s.waves.flat())) } })
      .catch((e) => { if (live) setError(String(e)) })
    return () => { live = false; ghost.current(new Set()) }
  }, [target])

  const retracted = sim ? sim.waves.flat().filter((id) => !id.startsWith('support:')).length : 0
  const admin = passphrase.get() !== ''

  async function applyForReal() {
    setBusy(true)
    setError(null)
    try {
      setSim(await api.correct(target, reason))
      setApplied(true)
      onDone()
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <m.section role="region" aria-label="What if"
      initial={{ opacity: 0, y: 10, rotateX: -6 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ duration: 0.3, ease }}
      className="rounded-xl border border-retract/35 bg-retract/6 p-4 [transform-origin:top] [transform-perspective:900px]">
      <div className="flex items-start gap-3">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-retract" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-semibold">{applied ? 'Retracted' : 'What if this were wrong?'}</h3>
          <code className="mt-0.5 block break-all font-mono text-[11px] text-muted-foreground">{target}</code>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close what-if"><X /></Button>
      </div>

      {error && <ErrorNote className="mt-3">{error}</ErrorNote>}
      {!sim && !error && <div className="mt-3"><Spinner label="Simulating on a copy of the graph" /></div>}

      {sim && (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted-foreground">
            {applied ? 'Done. ' : 'Simulated on a temporary copy; nothing was written. '}
            {plural(retracted, 'belief')} {applied ? 'were' : 'would be'} retracted across {plural(sim.waves.length, 'wave')}.
            {applied && ' GitHub catches up on the worker’s next run.'}
          </p>
          {sim.changes.length === 0 && <p className="text-sm">No decision would change.</p>}
          <ul className="grid gap-1.5">
            {sim.changes.map((c) => {
              const [, project, pkg] = c.decision.split(':')
              return (
                <li key={c.decision} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-panel px-3 py-2 text-sm">
                  <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => onOpen(c.decision)}>{pkg}</button>
                  <span className="text-muted-foreground">in {project}</span>
                  <span>{(applied ? DID : WOULD)[c.change] ?? c.change}</span>
                  {c.before?.urgency && c.change !== 'cancel' ? (
                    <span className="ml-auto inline-flex items-center gap-1.5">
                      <Urgency value={String(c.before.urgency)} /><ArrowRight className="size-3 text-muted-foreground" aria-hidden="true" /><Urgency value={String(c.after.urgency)} />
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
          {admin && !applied && (
            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); if (reason.trim() && !busy) void applyForReal() }}>
              <label className="sr-only" htmlFor="correction-reason">Why is it wrong?</label>
              <input id="correction-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is it wrong? (shown on GitHub)"
                className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 text-sm placeholder:text-muted-foreground" />
              <Button type="submit" variant="destructive" className="h-10" disabled={busy || !reason.trim()}>
                {busy ? 'Retracting…' : 'Retract for real'}
              </Button>
            </form>
          )}
        </div>
      )}
    </m.section>
  )
}
