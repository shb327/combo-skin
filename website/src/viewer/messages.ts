/** The viewer's events, as the page reads them (the viewer's embed contract, protocol version 1),
 * and the page's own text for each failure. Anything that is not a known, well-formed event is
 * ignored; the viewer's own `message` is never shown. */

/** The viewer's origin, checked and defaulted by vite.config.ts. */
export const VIEWER_ORIGIN = import.meta.env.VITE_VIEWER_ORIGIN

/** How long the viewer may take to answer at all, and, once it has, between two events. */
export const READY_MS = 15_000
export const STALL_MS = 60_000

/** A fresh id for the commands of one attempt. `crypto.randomUUID` needs a secure context, which
 * a dev server reached over plain http on another host is not. */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
}

export type ViewerEvent =
  | { type: 'cs3d:ready'; id: null; webgl2: boolean }
  | { type: 'cs3d:progress'; id: string | null; loaded: number; total: number }
  | { type: 'cs3d:loaded'; id: string | null; ms: number | null }
  | { type: 'cs3d:error'; id: string | null; code: string; retryable: boolean }
  | { type: 'cs3d:recovering'; id: string | null }
  | { type: 'cs3d:state'; id: string | null }

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/** The event in a message's `data`, or null for anything else. A missing `id` is null, the id
 * of the events the viewer's URL causes. */
export function readEvent(data: unknown): ViewerEvent | null {
  if (typeof data !== 'object' || data === null) return null
  const m = data as Record<string, unknown>
  const id = m.id ?? null
  if (id !== null && typeof id !== 'string') return null
  switch (m.type) {
    case 'cs3d:ready':
      return typeof m.webgl2 === 'boolean' ? { type: m.type, id: null, webgl2: m.webgl2 } : null
    case 'cs3d:progress':
      return isNumber(m.loaded) && isNumber(m.total)
        ? { type: m.type, id, loaded: m.loaded, total: m.total }
        : null
    case 'cs3d:loaded':
      return { type: m.type, id, ms: isNumber(m.ms) ? m.ms : null }
    case 'cs3d:error':
      return typeof m.code === 'string' && typeof m.retryable === 'boolean'
        ? { type: m.type, id, code: m.code, retryable: m.retryable }
        : null
    case 'cs3d:recovering':
    case 'cs3d:state':
      return { type: m.type, id }
    default:
      return null
  }
}

/** What a failure means for the card: `no-webgl2` hides every card's button, `cannot-draw`
 * this card's; `other` only shows the message. */
export interface Failure {
  kind: 'no-webgl2' | 'cannot-draw' | 'other'
  text: string
  retryable: boolean
}

const NOT_LOADED = 'The 3D view could not be loaded.'

/** The page's text for a viewer error code, or `timeout` for a viewer that did not answer. */
export function failureFor(code: string, retryable: boolean): Failure {
  if (code === 'no-webgl2') {
    return { kind: 'no-webgl2', text: "3D isn't available in this browser.", retryable: false }
  }
  if (code === 'bad-params' || code.startsWith('unknown-')) {
    return { kind: 'cannot-draw', text: "This combo can't be shown in 3D.", retryable: false }
  }
  if (code === 'context-lost') {
    return { kind: 'other', text: 'Your graphics card stopped the 3D view.', retryable: true }
  }
  if (code === 'timeout' || code === 'assets-unavailable') {
    return { kind: 'other', text: NOT_LOADED, retryable: true }
  }
  return { kind: 'other', text: NOT_LOADED, retryable }
}
