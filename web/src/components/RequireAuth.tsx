/** Sends signed-out visitors to the login page, then back here after. */
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { getToken } from '../lib/api'

export default function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation()
  if (!getToken()) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  return <>{children}</>
}
