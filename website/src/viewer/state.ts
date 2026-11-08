/** Which combo's 3D view is open, and what the visit has learnt: whether the visitor accepted
 * the download, whether the browser can show 3D, and which combos the viewer cannot draw. One
 * view at a time: opening another replaces it, and the replaced card closes its viewer. Held
 * for the app's life (a visit), so it survives moving between finish pages. */
import { createContext, useContext, type Dispatch } from 'react'
import type { Failure } from './messages'

export type Phase = 'warning' | 'loading' | 'loaded' | 'error'

export interface ActiveView {
  comboId: string
  /** Raised on every open and retry: each attempt is its own iframe. */
  attempt: number
  phase: Phase
  progress: { loaded: number; total: number }
  failure: Failure | null
}

export interface ViewerState {
  active: ActiveView | null
  /** The visitor accepted the download once; later views open at once. */
  warned: boolean
  /** The viewer reported no WebGL2: no card offers 3D any more. */
  noWebGL2: boolean
  /** Combos the viewer cannot draw. */
  cannotDraw: ReadonlySet<string>
}

type Attempt = { comboId: string; attempt: number }

export type ViewerAction =
  | { type: 'open'; comboId: string; warn: boolean }
  | { type: 'confirm'; comboId: string }
  | { type: 'close'; comboId: string }
  | { type: 'retry'; comboId: string }
  | ({ type: 'progress'; loaded: number; total: number } & Attempt)
  | ({ type: 'loaded' } & Attempt)
  | ({ type: 'recovering' } & Attempt)
  | ({ type: 'fail'; failure: Failure } & Attempt)

export const INITIAL: ViewerState = { active: null, warned: false, noWebGL2: false, cannotDraw: new Set() }

const NO_PROGRESS = { loaded: 0, total: 0 }

function current(state: ViewerState, action: { comboId: string; attempt?: number }): ActiveView | null {
  const active = state.active
  if (!active || active.comboId !== action.comboId) return null
  if (action.attempt !== undefined && action.attempt !== active.attempt) return null
  return active
}

export function viewerReducer(state: ViewerState, action: ViewerAction): ViewerState {
  const active = current(state, action)
  const update = (changes: Partial<ActiveView>) => ({ ...state, active: { ...active!, ...changes } })
  switch (action.type) {
    case 'open':
      return {
        ...state,
        active: {
          comboId: action.comboId,
          attempt: (state.active?.attempt ?? 0) + 1,
          phase: action.warn && !state.warned ? 'warning' : 'loading',
          progress: NO_PROGRESS,
          failure: null,
        },
      }
    case 'confirm':
      if (active?.phase !== 'warning') return state
      return { ...update({ phase: 'loading' }), warned: true }
    case 'close':
      return active ? { ...state, active: null } : state
    case 'retry':
      if (active?.phase !== 'error' || !active.failure?.retryable) return state
      return update({ phase: 'loading', attempt: active.attempt + 1, progress: NO_PROGRESS, failure: null })
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
