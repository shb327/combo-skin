import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSession } from '../auth/useSession'
import { DraftsContext } from './useDrafts'

interface State {
  /** The admin whose changes these are. */
  owner: string | null
  entries: Record<string, unknown>
}

/** Keeps each form's unsaved values in memory, across the end of a session and the login page,
 * for the admin who made them. Nothing is written to browser storage. */
export function DraftsProvider({ children }: { children: ReactNode }) {
  const { state: session } = useSession()
  const username = session.status === 'active' ? session.session.admin.username : null
  const [state, setState] = useState<State>({ owner: null, entries: {} })
  if (username !== null && username !== state.owner) {
    // Another admin logged in: the previous admin's changes are not theirs to see.
    setState({ owner: username, entries: state.owner === null ? state.entries : {} })
  }

  const update = useCallback((key: string, change: (current: unknown) => unknown) => {
    setState((current) => ({ ...current, entries: { ...current.entries, [key]: change(current.entries[key]) } }))
  }, [])
  const remove = useCallback((key: string) => {
    setState((current) => {
      if (!(key in current.entries)) return current
      const entries = { ...current.entries }
      delete entries[key]
      return { ...current, entries }
    })
  }, [])
  const clearAll = useCallback(() => setState((current) => ({ ...current, entries: {} })), [])

  const unsaved = Object.keys(state.entries).length > 0
  useEffect(() => {
    if (!unsaved) return
    // A reload or a closed tab would lose the changes: ask the browser to warn first.
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  const value = useMemo(() => ({ entries: state.entries, update, remove, clearAll }), [state.entries, update, remove, clearAll])
  return <DraftsContext value={value}>{children}</DraftsContext>
}
