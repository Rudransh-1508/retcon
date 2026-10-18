/**
 * The tour's signal bus. Product components announce what a visitor just did; the tour listens while it runs.
 * Emitting with no tour running does nothing, so components carry no tour logic beyond one emit call.
 */
export type TourSignal =
  | 'filter-changed'   // detail: the urgency filter now shown, for example 'P0'
  | 'why-opened'       // detail: the belief id
  | 'why-closed'
  | 'chain-hovered'
  | 'whatif-opened'    // detail: the belief id
  | 'whatif-closed'
  | 'view-changed'     // detail: the view id
  | 'graph-orbited'
  | 'belief-picked'    // detail: the belief id
  | 'replay-started'   // detail: the event id
  | 'agent-selected'   // detail: the agent name

type Listener = (signal: TourSignal, detail?: string) => void

const listeners = new Set<Listener>()

export function emit(signal: TourSignal, detail?: string) {
  for (const listener of listeners) listener(signal, detail)
}

export function listen(listener: Listener) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
