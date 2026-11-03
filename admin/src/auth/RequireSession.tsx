import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { loginPath } from './returnPath'
import { useSession } from './useSession'

/** Pages behind login. Without a session, login first, then back to the same path. */
export function RequireSession({ children }: { children: ReactNode }) {
  const { state } = useSession()
  const location = useLocation()
  if (state.status === 'active') return children
  const afterLogout = state.status === 'anonymous' && state.reason === 'logout'
  return <Navigate to={afterLogout ? loginPath() : loginPath(location.pathname + location.search)} replace />
}
