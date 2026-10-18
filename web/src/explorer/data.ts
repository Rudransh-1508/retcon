'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Module-level cache so switching views shows the last answer instantly while a fresh one loads.
const cache = new Map<string, unknown>()

export function invalidate(prefix = '') {
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key)
}

export function useResource<T>(key: string, load: () => Promise<T>) {
  const [state, setState] = useState<{ key: string; data: T | null; error: string | null }>(() => ({
    key, data: (cache.get(key) as T | undefined) ?? null, error: null,
  }))
  const [tick, setTick] = useState(0)
  const loader = useRef(load)
  useEffect(() => { loader.current = load })

  // A new key starts from whatever the cache has for it, never from the previous key's data.
  const current = state.key === key ? state : { key, data: (cache.get(key) as T | undefined) ?? null, error: null }

  useEffect(() => {
    let live = true
    loader.current()
      .then((data) => { cache.set(key, data); if (live) setState({ key, data, error: null }) })
      .catch((e) => { if (live) setState({ key, data: (cache.get(key) as T | undefined) ?? null, error: String(e instanceof Error ? e.message : e) }) })
    return () => { live = false }
  }, [key, tick])

  const reload = useCallback(() => { invalidate(key); setTick((n) => n + 1) }, [key])
  return { data: current.data, error: current.error, loading: current.data === null && current.error === null, reload }
}
