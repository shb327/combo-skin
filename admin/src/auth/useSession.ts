import { createContext, useContext } from 'react'
import type { AdminSession } from '../api/client'

export type SessionState =
  | { status: 'loading' }
  | { status: 'anonymous'; reason: 'none' | 'ended' | 'logout' }
  | { status: 'active'; session: AdminSession }

export interface SessionContextValue {
  state: SessionState
  login(username: string, password: string): Promise<void>
  /** Resolves only after the API ended the session; throws otherwise and the session stays. */
  logout(): Promise<void>
  /** The login page is showing: a later page visit should keep its return path again. */
  shownLogin(): void
}

export const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession outside SessionProvider')
  return value
}
