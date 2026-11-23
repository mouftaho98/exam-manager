/**
 * A piece of page state (selected tab, filter, room…) kept in the URL query,
 * e.g. /offerings/123?tab=people. Refreshing or sharing the link keeps it.
 * Changes replace the current history entry, so Back doesn't step through
 * every tab click.
 */
import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

export function useUrlState<T extends string>(key: string, fallback: T, allowed?: readonly T[]): [T, (value: T) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get(key) as T | null
  // Ignore values that aren't valid here (e.g. ?tab=people for a student).
  const value = raw !== null && (!allowed || allowed.includes(raw)) ? raw : fallback

  const set = useCallback(
    (next: T) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          if (next === fallback || next === '') p.delete(key)
          else p.set(key, next)
          return p
        },
        { replace: true },
      ),
    [key, fallback, setParams],
  )
  return [value, set]
}
