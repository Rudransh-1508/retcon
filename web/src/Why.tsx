import { useEffect, useState } from 'react'
import { api, type WhyNode, type WhySupport } from './api'
import { Severity, Urgency } from './bits'
import { date } from './format'

export function Why({ id, onClose, onOpen }: { id: string; onClose: () => void; onOpen: (id: string) => void }) {
  const [tree, setTree] = useState<WhyNode | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.why(id).then(setTree).catch((e) => setError(String(e)))
  }, [id])

  return (
    <div className="why">
      <div className="section-head">
        <h2>Why?</h2>
        <button className="ghost" onClick={onClose} aria-label="Close">Close</button>
      </div>
      {error && <div className="error">{error}</div>}
      {!tree && !error && <div className="muted">Loading…</div>}
      {tree && (
        <>
          <Headline node={tree} />
          {Array.isArray(tree.history) && tree.history.length > 0 && <History items={tree.history as HistoryItem[]} />}
          {Array.isArray(tree.judgments) && tree.judgments.length > 0 && (
            <div className="judgments">
              <h3>Triage judgments</h3>
              {(tree.judgments as WhyNode[]).map((j) => <JudgmentCard key={j.id} node={j} />)}
            </div>
          )}
          <div className="tree">
            <NodeCard node={tree} root onOpen={onOpen} />
          </div>
        </>
      )}
    </div>
  )
}

type HistoryItem = {
  event: string; kind: string; advisory: string; at: string; change: string
  before: string | null; after: string | null; evidence_before: number; evidence_after: number
}

const CHANGE_LABEL: Record<string, string> = {
  new: 'opened', updated: 'more evidence', escalate: 'escalated', unchanged: 'support changed',
  downgrade: 'downgraded', cancel: 'cancelled',
}

function History({ items }: { items: HistoryItem[] }) {
  return (
    <ol className="history" aria-label="History">
      {items.map((h) => (
        <li key={h.event} className={`history-item ${h.change}`}>
          <span className="history-date mono">{date(h.at)}</span>
          <span className={`history-change ${h.change}`}>{CHANGE_LABEL[h.change] ?? h.change}</span>
          <span className="history-detail">
            <span className="muted">{h.kind}</span>{' '}
            <a href={`https://github.com/advisories/${h.advisory}`} target="_blank" rel="noreferrer" className="mono">{h.advisory}</a>
          </span>
          <span className="history-urgency">
            {h.before && h.before !== h.after && <><Urgency value={h.before} /><span className="muted">→</span></>}
            <Urgency value={h.after} />
            <span className="muted mono">{h.evidence_after} adv.</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

function Headline({ node }: { node: WhyNode }) {
  if (node.kind !== 'Decision') return null
  const held = node.status === 'held'
  const evidence = (node.evidence as string[] | undefined) ?? []
  return (
    <div className={`headline ${held ? '' : 'retracted'}`}>
      <div className="headline-title">
        <Urgency value={held ? (node.urgency as string) : null} />
        <span>
          {held ? 'Upgrade' : 'Cancelled: upgrade'} <b>{String(node.package)}</b>
          {held && node.target && node.target !== 'none' ? <> to <code>{String(node.target)}</code></> : null}
          {' '}in <b>{String(node.project)}</b>
        </span>
      </div>
      <p className="muted">
        {held
          ? `Justified by ${evidence.length} advisor${evidence.length === 1 ? 'y that still holds' : 'ies that still hold'}.`
          : 'No support is left: every advisory behind it was withdrawn.'}
      </p>
    </div>
  )
}

function NodeCard({ node, root, onOpen }: { node: WhyNode; root?: boolean; onOpen: (id: string) => void }) {
  const retracted = node.status === 'retracted'
  const supports = node.supports ?? []
  return (
    <div className={`node ${retracted ? 'retracted' : ''} ${root ? 'root' : ''}`}>
      <div className="node-head">
        <span className={`kind kind-${node.kind.toLowerCase()}`}>{node.kind}</span>
        <NodeTitle node={node} onOpen={onOpen} />
        <span className={`status ${retracted ? 'off' : 'on'}`}>{retracted ? 'retracted' : 'held'}</span>
      </div>
      {retracted && node.retracted_by.length > 0 && (
        <div className="retraction-note">
          Retracted {date(node.retracted_by[0].at)}
          {node.kind === 'Advisory' ? ': withdrawn by its publisher' : ': its support was retracted'}
        </div>
      )}
      {supports.length > 0 && (
        <ul className="supports">
          {supports.map((s) => <SupportRow key={s.id} support={s} onOpen={onOpen} />)}
        </ul>
      )}
    </div>
  )
}

function SupportRow({ support, onOpen }: { support: WhySupport; onOpen: (id: string) => void }) {
  const retracted = support.status === 'retracted'
  const label = support.kind === 'affects' ? 'affected by' : support.kind === 'resolves' ? 'because of' : support.kind
  return (
    <li className={`support ${retracted ? 'retracted' : ''}`}>
      <div className="support-label">
        <span>{label}</span>
        {support.kind === 'affects' && support.fix ? (
          <span className="muted">{support.fix === 'none' ? 'no fixed release yet' : <>fixed in <code>{String(support.fix)}</code></>}</span>
        ) : null}
        {support.by && <span className="muted">· recorded by {support.by}</span>}
      </div>
      {support.premises.map((p) => <NodeCard key={p.id} node={p} onOpen={onOpen} />)}
    </li>
  )
}

const VERDICT_LABEL: Record<string, string> = {
  exploitable: 'exploitable here', not_reachable: 'not reachable here', unknown: 'unclear',
}

function JudgmentCard({ node }: { node: WhyNode }) {
  const retracted = node.status === 'retracted'
  let evidence: { file: string; line: number }[] = []
  try { evidence = JSON.parse(String(node.evidence ?? '[]')) } catch { evidence = [] }
  return (
    <div className={`node judgment ${retracted ? 'retracted' : ''}`}>
      <div className="node-head">
        <span className="kind kind-judgment">Judgment</span>
        <span className="node-title">
          <span className={`verdict ${String(node.verdict)}`}>{VERDICT_LABEL[String(node.verdict)] ?? String(node.verdict)}</span>
          <span className="muted">on</span>
          <a href={`https://github.com/advisories/${String(node.advisory)}`} target="_blank" rel="noreferrer" className="mono">{String(node.advisory)}</a>
          <span className="summary">{String(node.rationale ?? '')}</span>
          {evidence.length > 0 && (
            <span className="summary">
              {evidence.map((e) => (
                <a key={`${e.file}:${e.line}`} className="mono evidence" target="_blank" rel="noreferrer"
                  href={`https://github.com/${String(node.repo)}/blob/main/${e.file}#L${e.line}`}>{e.file}:{e.line}</a>
              ))}
            </span>
          )}
        </span>
        <span className={`status ${retracted ? 'off' : 'on'}`}>{retracted ? 'retracted' : 'held'}</span>
      </div>
      {retracted && <div className="retraction-note">Retracted {date(node.retracted_by[0]?.at)}: the advisory it judged was withdrawn</div>}
    </div>
  )
}

function NodeTitle({ node, onOpen }: { node: WhyNode; onOpen: (id: string) => void }) {
  switch (node.kind) {
    case 'Advisory':
      return (
        <span className="node-title">
          <a href={String(node.url)} target="_blank" rel="noreferrer" className="mono">{node.id}</a>
          <Severity value={node.severity as string} />
          <span className="summary">{String(node.summary ?? '')}</span>
        </span>
      )
    case 'Exposure':
      return (
        <span className="node-title">
          <code>{String(node.package)}@{String(node.version)}</code>
          <span className="muted">in {String(node.project)}{node.dev ? ' (dev only)' : ''}</span>
          {Array.isArray(node.paths) && node.paths.length > 0 && (
            <span className="summary mono">
              {node.direct ? 'direct dependency' : `via ${String(node.paths[0])}`}
            </span>
          )}
        </span>
      )
    case 'Decision':
      return (
        <span className="node-title">
          <button className="link" onClick={() => onOpen(node.id)}>{String(node.package)}</button>
          <span className="muted">in {String(node.project)}</span>
        </span>
      )
    case 'Judgment':
      return (
        <span className="node-title">
          <span className={`verdict ${String(node.verdict)}`}>{VERDICT_LABEL[String(node.verdict)] ?? String(node.verdict)}</span>
          <span className="summary">{String(node.rationale ?? '')}</span>
        </span>
      )
    default:
      return <span className="node-title mono">{node.id}</span>
  }
}
