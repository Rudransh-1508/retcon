import { useEffect, useState } from 'react'
import { api, passphrase, type Simulation } from './api'
import { Urgency } from './bits'

const LABEL: Record<string, string> = {
  cancel: 'would be cancelled', downgrade: 'would be downgraded', unchanged: 'would keep its priority',
  escalate: 'would escalate', new: 'would open', updated: 'would change',
}

export function WhatIf({ target, onClose, onDone, onOpen }: {
  target: string; onClose: () => void; onDone: () => void; onOpen: (id: string) => void
}) {
  const [sim, setSim] = useState<Simulation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [applied, setApplied] = useState(false)

  useEffect(() => {
    api.whatIf(target).then(setSim).catch((e) => setError(String(e)))
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
    <div className="whatif" role="region" aria-label="What if">
      <div className="whatif-head">
        <b>{applied ? 'Retracted' : 'What if this were wrong?'}</b>
        <code className="whatif-target">{target}</code>
        <button className="ghost" onClick={onClose}>Close</button>
      </div>
      {error && <div className="error">{error}</div>}
      {!sim && !error && <div className="muted">Simulating on a copy of the graph…</div>}
      {sim && (
        <>
          <p className="muted">
            {applied ? 'Done. ' : 'Simulated on a temporary copy; nothing was written. '}
            {retracted} belief{retracted === 1 ? '' : 's'} {applied ? 'were' : 'would be'} retracted
            across {sim.waves.length} wave{sim.waves.length === 1 ? '' : 's'}.
            {applied && ' GitHub catches up on the worker’s next run.'}
          </p>
          {sim.changes.length === 0 && <p>No decision would change.</p>}
          <ul className="whatif-changes">
            {sim.changes.map((c) => {
              const [, project, pkg] = c.decision.split(':')
              return (
                <li key={c.decision}>
                  <button className="link" onClick={() => onOpen(c.decision)}>{pkg}</button>
                  <span className="muted">in {project}</span>
                  <span>{applied ? LABEL[c.change]?.replace('would be ', 'was ').replace('would ', '') : LABEL[c.change] ?? c.change}</span>
                  {c.before?.urgency && c.change !== 'cancel' ? (
                    <span className="whatif-urgency">
                      <Urgency value={String(c.before.urgency)} /><span className="muted">→</span><Urgency value={String(c.after.urgency)} />
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
          {admin && !applied && (
            <div className="whatif-apply">
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is it wrong? (shown on GitHub)"
                aria-label="Reason for the correction" />
              <button className="danger" disabled={busy || !reason.trim()} onClick={applyForReal}>
                {busy ? 'Retracting…' : 'Retract for real'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
