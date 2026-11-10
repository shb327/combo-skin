/** Which combo's 3D window is open, and what the visit has learnt: whether the visitor accepted
 * the download, whether the browser can show 3D, which combos the viewer cannot draw, and the
 * map and agent the visitor chose. One window at a time. Held for the app's life (a visit), so
 * it survives moving between finish pages; nothing of it is stored. */
import { createContext, useContext, type Dispatch } from 'react'
import type { Failure } from './messages'
import { DEFAULT_CHOICE, type Choice } from './params'

export type Phase = 'warning' | 'loading' | 'loaded' | 'error'

export interface ActiveView {
  comboId: string
  /** Raised on every open and retry: each attempt is its own iframe. */
  attempt: number
  phase: Phase
  /** In the warning: whether it is about the download (phones), not only a click to load (a
   * window opened from its address). */
  dataWarning: boolean
  progress: { loaded: number; total: number }
  failure: Failure | null
}

export interface ViewerState {
  active: ActiveView | null
  /** The visitor accepted the download once; later windows open at once. */
  warned: boolean
  /** The viewer reported no WebGL2: no card offers 3D any more. */
  noWebGL2: boolean
  /** Combos the viewer cannot draw. */
  cannotDraw: ReadonlySet<string>
  /** The visitor's map and agent: the next window opens with them. */
  choice: Choice
  /** The window closed last, so its card's button can take the focus back. */
  closed: { comboId: string; count: number } | null
}

type Attempt = { comboId: string; attempt: number }

export type ViewerAction =
  /** `linked`: opened from the page's address, so it waits for a click before loading. */
  | { type: 'open'; comboId: string; warn: boolean; linked?: boolean }
  | { type: 'confirm'; comboId: string }
  | { type: 'close'; comboId: string }
  | { type: 'retry'; comboId: string }
  | { type: 'choose'; choice: Choice }
  | ({ type: 'progress'; loaded: number; total: number } & Attempt)
  | ({ type: 'loaded' } & Attempt)
  | ({ type: 'recovering' } & Attempt)
  | ({ type: 'fail'; failure: Failure } & Attempt)

export const INITIAL: ViewerState = {
  active: null,
  warned: false,
  noWebGL2: false,
  cannotDraw: new Set(),
  choice: DEFAULT_CHOICE,
  closed: null,
}

const NO_PROGRESS = { loaded: 0, total: 0 }

function current(state: ViewerState, action: { comboId?: string; attempt?: number }): ActiveView | null {
  const active = state.active
  if (!active || active.comboId !== action.comboId) return null
  if (action.attempt !== undefined && action.attempt !== active.attempt) return null
  return active
}

export function viewerReducer(state: ViewerState, action: ViewerAction): ViewerState {
  const active = current(state, action as { comboId?: string; attempt?: number })
  const update = (changes: Partial<ActiveView>) => ({ ...state, active: { ...active!, ...changes } })
  switch (action.type) {
    case 'open': {
      const dataWarning = action.warn && !state.warned
      return {
        ...state,
        active: {
          comboId: action.comboId,
          attempt: (state.active?.attempt ?? 0) + 1,
          phase: dataWarning || action.linked ? 'warning' : 'loading',
          dataWarning,
          progress: NO_PROGRESS,
          failure: null,
        },
      }
    }
    case 'confirm':
      if (active?.phase !== 'warning') return state
      return { ...update({ phase: 'loading' }), warned: state.warned || active.dataWarning }
    case 'close':
      if (!active) return state
      return { ...state, active: null, closed: { comboId: active.comboId, count: (state.closed?.count ?? 0) + 1 } }
    case 'retry':
      if (active?.phase !== 'error' || !active.failure?.retryable) return state
      return update({ phase: 'loading', attempt: active.attempt + 1, progress: NO_PROGRESS, failure: null })
    case 'choose':
      return { ...state, choice: action.choice }
    case 'progress':
      if (active?.phase !== 'loading') return state
      return update({ progress: { loaded: action.loaded, total: action.total } })
    case 'loaded':
      return active?.phase === 'loading' ? update({ phase: 'loaded' }) : state
    case 'recovering':
      return active?.phase === 'loading' || active?.phase === 'loaded'
        ? update({ phase: 'loading', progress: NO_PROGRESS })
        : state
    case 'fail': {
      if (active?.phase !== 'loading' && active?.phase !== 'loaded') return state
      const { kind } = action.failure
      return {
        ...update({ phase: 'error', failure: action.failure }),
        noWebGL2: state.noWebGL2 || kind === 'no-webgl2',
        cannotDraw: kind === 'cannot-draw' ? new Set([...state.cannotDraw, action.comboId]) : state.cannotDraw,
      }
    }
  }
}

/** Provided for the app's life by `Providers.tsx`. */
export const ViewerContext = createContext<[ViewerState, Dispatch<ViewerAction>] | null>(null)

export function useViewerState(): [ViewerState, Dispatch<ViewerAction>] {
  const value = useContext(ViewerContext)
  if (!value) throw new Error('useViewerState needs the ViewerContext of Providers')
  return value
}
