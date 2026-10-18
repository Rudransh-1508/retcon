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
  /** Whether the Why panel must be shut, or open on the first Decision, for this step; the tour sees to it on entry. */
  why?: 'open' | 'closed'
  done: Done
  /** Label of the button that moves on from a 'next' step. */
  cta?: string
  /** A command to show and copy, for the finish step. */
  code?: string
  /** The interactive words diagram; its step moves on only once every part of it has been clicked. */
  diagram?: 'beliefs' | 'outcomes'
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
    id: 'beliefs',
    title: 'Five kinds of belief',
    body: 'Everything Retcon knows is a belief, and each belief rests on the ones below it. That chain of support is what lets Retcon take things back.',
    action: 'Click each plate, from the bottom up.',
    diagram: 'beliefs',
    done: 'next',
  },
  {
    id: 'outcomes',
    title: 'What a retraction does',
    body: 'When an advisory is withdrawn, Retcon retracts it and everything that rested only on it, then re-checks each decision above. Every decision gets one of three outcomes.',
    action: 'Click each outcome to see which plates change.',
    diagram: 'outcomes',
    done: 'next',
  },
  {
    id: 'tiles',
    title: 'The numbers at a glance',
    body: 'Open decisions are the upgrades Retcon holds now, and Urgent now counts the P0 and P1 ones. Real pull requests are open on GitHub, in two real projects. Taken back counts decisions that a retraction cancelled.',
    target: 'summary',
    view: 'decisions',
    why: 'closed',
    done: 'next',
  },
  {
    id: 'filter',
    title: 'Narrow the list',
    body: 'P0 is the most urgent: a critical advisory still holds the upgrade. Filters only narrow the list; they never change anything.',
    action: 'Click P0.',
    target: 'urgency-p0',
    view: 'decisions',
    why: 'closed',
    done: { signal: 'filter-changed', detail: 'P0' },
  },
  {
    id: 'first-decision',
    title: 'Open a decision',
    body: 'Each card is one upgrade: the package, the version that fixes it, its urgency, the real pull request, and how many advisories hold it. The list is sorted by urgency, so this card is among the most urgent.',
    action: 'Click the card to see why it exists.',
    target: 'first-decision',
    view: 'decisions',
    why: 'closed',
    done: { signal: 'why-opened' },
  },
  {
    id: 'chain',
    title: 'The chain of support',
    body: 'These plates are the beliefs this decision rests on, one plate per kind, with advisories at the bottom. A green square still holds; a magenta one has been retracted.',
    action: 'Move your pointer over the plates.',
    target: 'support-stack',
    why: 'open',
    done: { signal: 'chain-hovered' },
  },
  {
    id: 'planner',
    title: 'What the Planner decided',
    body: 'The Planner recorded what it chose to do on GitHub and why: open a pull request now, or only list the upgrade in a report. Below it, the history lists every change to this decision and the advisory behind it.',
    target: 'planner',
    why: 'open',
    done: 'next',
  },
  {
    id: 'what-if',
    title: 'Ask what if',
    body: 'What if wrong? simulates retracting one belief, on a copy of the memory. It writes nothing, so it is always safe to press.',
    action: 'Click What if wrong? on an advisory.',
    target: 'what-if',
    why: 'open',
    done: { signal: 'whatif-opened' },
  },
  {
    id: 'what-if-result',
    title: 'What would change',
    body: 'The result lists which decisions would be cancelled, downgraded or left unchanged, and the beliefs that would fall pulse magenta on the plates. The project owner can then retract it for real from Admin; the tour never does.',
    action: 'Close the What-if.',
    target: 'whatif-result',
    why: 'open',
    done: { signal: 'whatif-closed' },
  },
  {
    id: 'close-why',
    title: 'Back to the list',
    body: 'Everything in this panel comes from the memory, and every belief in it links to what it rests on.',
    action: 'Close the panel.',
    target: 'why-close',
    why: 'open',
    done: { signal: 'why-closed' },
  },
  {
    id: 'graph-tab',
    title: 'The whole memory',
    body: 'The Graph shows every belief at once, in 3D: one plate per kind, each resting on the plates below it.',
    action: 'Click Graph.',
    target: 'tab-graph',
    view: 'decisions',
    why: 'closed',
    done: { signal: 'view-changed', detail: 'graph' },
  },
  {
    id: 'orbit',
    title: 'Look around',
    body: 'Drag to turn the plates and look at them from any side; scroll or pinch to zoom.',
    action: 'Drag the graph to turn it.',
    target: 'graph-canvas',
    view: 'graph',
    why: 'closed',
    done: { signal: 'graph-orbited' },
  },
  {
    id: 'pick',
    title: 'Follow one belief',
    body: 'Clicking a belief keeps its whole chain lit, what it rests on and what rests on it, and fades the rest. Links that skip a plate stay hidden until something is selected. The card that appears offers Why? and What if wrong?',
    action: 'Click any belief.',
    target: 'graph-canvas',
    view: 'graph',
    why: 'closed',
    done: { signal: 'belief-picked' },
  },
  {
    id: 'replay',
    title: 'Replay a withdrawal',
    body: 'Pick a real withdrawal to watch it travel up: a magenta pulse on the advisory, then each belief that rested only on it dims, until it reaches the decisions it changed.',
    action: 'Choose a withdrawal to replay.',
    target: 'replay',
    view: 'graph',
    why: 'closed',
    done: { signal: 'replay-started' },
  },
  {
    id: 'finish',
    title: 'You know your way around',
    body: 'Admin is for the project owner, who can retract a belief for real; the tour never needs it. Replay this tour any time from the Tour button. To ask Retcon from your own agent, add it over MCP:',
    target: 'tour-button',
    why: 'closed',
    code: MCP_COMMAND,
    done: 'next',
    cta: 'Finish',
  },
]
