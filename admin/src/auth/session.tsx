import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { AdminSession, Api } from '../api/client'
import { ApiError } from '../api/errors'
import { SessionContext, type SessionState } from './useSession'

/** Hidden for at least this long, a tab re-checks its session when it becomes visible. */
const HIDDEN_RECHECK_MS = 60_000
// setTimeout cannot wait longer than this.
const MAX_TIMEOUT_MS = 2 ** 31 - 1

/** The state after /admin/me failed: no session, or the API could not be reached. */
function anonymous(failure: unknown): SessionState {
  const unreachable = failure instanceof ApiError && failure.kind === 'network'
  return { status: 'anonymous', reason: unreachable ? 'unreachable' : 'none' }
}

export function SessionProvider({ api, children }: { api: Api; children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' })
  const started = useRef(false)

  const activate = useCallback(
    (session: AdminSession) => {
      api.setSession(session)
      setState({ status: 'active', session })
    },
    [api],
  )

  // The client says when a request found the session ended, or a refused write refreshed it.
  useEffect(
    () =>
      api.onSessionChange((session, change) => {
        if (change === 'ended' || !session) setState({ status: 'anonymous', reason: 'ended' })
        else setState({ status: 'active', session })
      }),
    [api],
  )

  // One /admin/me on load: it says whether a session exists and returns its CSRF token.
  useEffect(() => {
    if (started.current) return
    started.current = true
    api.me().then(activate, (failure) => setState(anonymous(failure)))
  }, [api, activate])

  const retry = useCallback(
    () => api.me().then(activate, (failure) => setState(anonymous(failure))),
    [api, activate],
  )

  const recheck = useCallback(() => {
    // A 401 ends the session through onSessionChange; other failures leave it as it is.
    api.me().then(activate, () => {})
  }, [api, activate])

  const expiresAt = state.status === 'active' ? state.session.expires_at : null

  useEffect(() => {
    if (!expiresAt) return
    const delay = Math.min(Math.max(Date.parse(expiresAt) - Date.now(), 0), MAX_TIMEOUT_MS)
    const timer = setTimeout(recheck, delay)
    return () => clearTimeout(timer)
  }, [expiresAt, recheck])

  const active = state.status === 'active'

  useEffect(() => {
    if (!active) return
    let hiddenSince: number | null = null
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenSince = Date.now()
      } else if (hiddenSince !== null) {
        if (Date.now() - hiddenSince >= HIDDEN_RECHECK_MS) recheck()
        hiddenSince = null
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [active, recheck])

  const login = useCallback(
    async (username: string, password: string) => activate(await api.login(username, password)),
    [api, activate],
  )

  const logout = useCallback(async () => {
    await api.logout()
    api.setSession(null)
    setState({ status: 'anonymous', reason: 'logout' })
  }, [api])

  const shownLogin = useCallback(() => {
    setState((current) =>
      current.status === 'anonymous' && current.reason === 'logout'
        ? { status: 'anonymous', reason: 'none' }
        : current,
    )
  }, [])

  if (state.status === 'loading') {
    return (
      <div role="status" className="flex min-h-screen items-center justify-center text-white/60">
        Loading…
      </div>
    )
  }

  return (
    <SessionContext value={{ state, login, logout, shownLogin, retry }}>{children}</SessionContext>
  )
}
