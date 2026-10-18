'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

export function CopyCommand({ command, label }: { command: string; label: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard blocked: the command is still selectable on screen */ }
  }
  return (
    <div className="flex items-start gap-2 rounded-xl border border-line bg-paper p-3">
      <code className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed" aria-label={label}>{command}</code>
      <button type="button" onClick={copy} aria-label={copied ? 'Copied' : `Copy: ${label}`}
        className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-ink/6 hover:text-ink">
        {copied ? <Check className="size-4 text-held" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
        <span role="status" className="sr-only">{copied ? 'Copied to clipboard' : ''}</span>
      </button>
    </div>
  )
}
