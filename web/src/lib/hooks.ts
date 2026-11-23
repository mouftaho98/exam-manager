/** Small data-loading hooks shared by the pages. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, errorMessage } from './api'
import type { MyOffering, User } from './types'

/**
 * Load something on mount and whenever `deps` change; `reload()` fetches it
 * again. Only the newest request's answer is kept, so typing in a search box
 * can't have an older, slower response overwrite a newer one.
 */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const latest = useRef(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(() => {
    const id = ++latest.current
    setLoading(true)
    return load()
      .then((d) => { if (id === latest.current) { setData(d); setError('') } })
      .catch((e) => { if (id === latest.current) setError(errorMessage(e)) })
      .finally(() => { if (id === latest.current) setLoading(false) })
  }, deps)
  useEffect(() => { reload() }, [reload])
  return { data, error, loading, reload, setData }
}

/** The signed-in user and the offerings they've joined (GET /me). */
export function useMe() {
  const res = useLoad(() => api.get<{ user: User; offerings: MyOffering[] }>('/me'))
  const user = res.data?.user ?? null
  const offerings = res.data?.offerings ?? []
  return {
    ...res,
    user,
    offerings,
    // Rooms are for teaching staff: approved instructors and anyone who is staff somewhere.
    isStaff: user?.instructorStatus === 'APPROVED' || offerings.some((o) => o.role !== 'STUDENT'),
  }
}
