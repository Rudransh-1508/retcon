import type { TourSignal } from './signals'

export type View = 'decisions' | 'graph' | 'agents' | 'timeline'

/** How a step completes: the visitor presses the card's button, or does the thing the step asks for. */
export type Done = 'next' | { signal: TourSignal; detail?: string }

export type Step = {
  id: string
  title: string
  /** One or two sentences of meaning. Uses no term that an earlier card has not defined. */
  body: string
  /** One imperative line, for steps the visitor completes by acting. */
  action?: string
  /** The `data-tour` marker of the control to highlight. Without one the card sits in the middle of the page. */
  target?: string
  /** The view this step needs; the tour switches to it on entry, and again when going back. */
  view?: View
  done: Done
  /** Label of the button that moves on from a 'next' step. */
  cta?: string
  /** A command to show and copy, for the finish step. */
  code?: string
}

export const MCP_COMMAND = 'claude mcp add --transport http retcon https://retcon-kappa.vercel.app/mcp'

export const STEPS: Step[] = [
  {
    id: 'welcome',
    title: 'Welcome to Retcon',
    body: 'Retcon is memory for AI agents that can take things back. It acts on security advisories with real pull requests, and when an advisory turns out to be wrong it revises exactly the work that rested on it.',
    action: 'This tour takes about two minutes, and you do each step yourself.',
    done: 'next',
    cta: 'Start',
  },
  {
    id: 'finish',
    title: 'You know your way around',
    body: 'Admin is for the project owner, who can retract a belief for real; the tour never needs it. Replay this tour any time from the Tour button. To ask Retcon from your own agent, add it over MCP:',
    target: 'tour-button',
    code: MCP_COMMAND,
    done: 'next',
    cta: 'Finish',
  },
]
