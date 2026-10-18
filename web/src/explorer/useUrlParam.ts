'use client'

import { useCallback, useState } from 'react'

/** A string kept in the query string (replaceState, no navigation) so views are shareable. */
export function useUrlParam(name: string, fallback: string) {
  const [value, setValue] = useState(() => new URLSearchParams(location.search).get(name) ?? fallback)
  const set = useCallback((next: string) => {
    setValue(next)
    const url = new URL(location.href)
    if (next === fallback) url.searchParams.delete(name)
    else url.searchParams.set(name, next)
    history.replaceState(null, '', url)
  }, [name, fallback])
  return [value, set] as const
}
