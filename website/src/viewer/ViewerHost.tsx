/** The finish page's side of the 3D window: opening it from a card, its address (`?3d=<combo
 * id>`), and closing it. The window's code loads on the first open, from the site's own origin.
 *
 * Opening pushes the address as a history entry, so Back closes the window; closing by the
 * window's own controls goes back over that entry, or, for a window opened from its address,
 * replaces the address without it. A page opened with the address shows the window waiting for
 * "Load 3D view": nothing 3D loads before a click. An id the page does not list is dropped. */
import { lazy, Suspense, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { PublicCombo } from '@/api/client'
import { OpenContext, PARAM } from './open'
import { useViewerState } from './state'
import { hasWebGL2, needsDataWarning } from './webgl'
import type { OnViewerLoaded } from './ViewerWindow'

const ViewerWindow = lazy(() => import('./ViewerWindow'))

/** The form of a combo's public id. */
const PUBLIC_ID = /^[0-9a-z]{12}$/

function without(search: string): string {
  const params = new URLSearchParams(search)
  params.delete(PARAM)
  const rest = params.toString()
  return rest ? `?${rest}` : ''
}

export function ViewerHost({
  combos,
  onLoaded,
  children,
}: {
  /** The page's combos, once loaded. */
  combos: PublicCombo[] | undefined
  onLoaded?: OnViewerLoaded
  children: ReactNode
}) {
  const [state, dispatch] = useViewerState()
  const location = useLocation()
  const navigate = useNavigate()
  const param = new URLSearchParams(location.search).get(PARAM)
  const active = state.active
  const combo = active ? combos?.find((c) => c.id === active.comboId) : undefined

  const latest = useRef({ state, location, param })
  useEffect(() => {
    latest.current = { state, location, param }
  })

  const open = useCallback(
    (comboId: string) => {
      const { location: here } = latest.current
      dispatch({ type: 'open', comboId, warn: needsDataWarning() })
      const params = new URLSearchParams(here.search)
      params.set(PARAM, comboId)
      navigate({ search: `?${params}` }, { state: { view3d: comboId } })
    },
    [dispatch, navigate],
  )

  const close = useCallback(() => {
    const { state: now, location: here, param: current } = latest.current
    const comboId = now.active?.comboId
    if (!comboId) return
    dispatch({ type: 'close', comboId })
    const pushed = (here.state as { view3d?: string } | null)?.view3d === comboId
    if (current === comboId && pushed) navigate(-1)
    else if (current !== null) navigate({ search: without(here.search) }, { replace: true })
  }, [dispatch, navigate])

  // The address changed: Back closed the window, or a page was opened with a window's address.
  const seen = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (!combos) return
    const previous = seen.current
    seen.current = param
    if (param === previous) return
    const { state: now } = latest.current
    if (param === null) {
      if (now.active) dispatch({ type: 'close', comboId: now.active.comboId })
      return
    }
    if (now.active?.comboId === param) return
    const drawable = hasWebGL2() && !now.noWebGL2 && !now.cannotDraw.has(param)
    if (!PUBLIC_ID.test(param) || !combos.some((c) => c.id === param) || !drawable) {
      seen.current = null
      navigate({ search: without(location.search) }, { replace: true })
      return
    }
    dispatch({ type: 'open', comboId: param, warn: needsDataWarning(), linked: true })
  }, [param, combos, dispatch, navigate, location.search])

  // Leaving the page, or this finish, closes the window.
  useEffect(
    () => () => {
      const comboId = latest.current.state.active?.comboId
      if (comboId) dispatch({ type: 'close', comboId })
    },
    [dispatch],
  )

  const href = combo ? `${window.location.origin}${location.pathname}?${PARAM}=${combo.id}` : ''

  return (
    <OpenContext.Provider value={open}>
      {children}
      {combo && (
        <Suspense fallback={null}>
          <ViewerWindow combo={combo} href={href} onClose={close} onLoaded={onLoaded} />
        </Suspense>
      )}
    </OpenContext.Provider>
  )
}
