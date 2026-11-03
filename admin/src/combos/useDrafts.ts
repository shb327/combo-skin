import { createContext, useContext, useState } from 'react'

/** Unsaved form values, kept in memory above the routes. */
export interface DraftsValue {
  entries: Readonly<Record<string, unknown>>
  update(key: string, change: (current: unknown) => unknown): void
  remove(key: string): void
  clearAll(): void
}

export const DraftsContext = createContext<DraftsValue | null>(null)

export function useDrafts(): DraftsValue {
  const value = useContext(DraftsContext)
  if (!value) throw new Error('useDrafts outside DraftsProvider')
  return value
}

/** A form's values: its unsaved changes if it has any, otherwise `base` (the stored values, or
 * an empty form). Pages that use it are keyed by their path, so `restored` is read on mount. */
export function useDraft<T>(key: string, base: T) {
  const drafts = useDrafts()
  const entry = drafts.entries[key] as T | undefined
  const [restored, setRestored] = useState(() => entry !== undefined)
  return {
    values: entry ?? base,
    unsaved: entry !== undefined,
    /** Shown once: the form came back with changes made before the page was left. */
    restored: restored && entry !== undefined,
    set(change: (current: T) => T) {
      drafts.update(key, (current) => change((current as T | undefined) ?? base))
    },
    /** Forget the unsaved changes: after saving, or when the owner discards them. */
    forget() {
      setRestored(false)
      drafts.remove(key)
    },
  }
}
