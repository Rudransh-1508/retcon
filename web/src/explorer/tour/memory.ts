// Whether this browser has finished or skipped the tour. Storage can be blocked or throw; that must never break the
// console, so a failed read counts as "not seen" and a failed write is ignored (the tour then runs once per load).

const KEY = 'retcon-tour'

export const tourMemory = {
  seen(): boolean {
    try { return localStorage.getItem(KEY) === 'done' } catch { return false }
  },
  remember() {
    try { localStorage.setItem(KEY, 'done') } catch { /* storage blocked */ }
  },
}

/** The query parameter that starts the tour regardless of memory, as used by the landing page's link. */
export const FORCE_PARAM = 'tour'

/** Parameters that mean the visitor was sent to something specific; the tour does not start on its own then. */
export const DEEP_LINK_PARAMS = ['why', 'view', 'project']
