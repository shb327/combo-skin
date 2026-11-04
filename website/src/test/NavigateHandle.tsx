import { useLocation, useNavigate, type Location, type NavigateFunction } from 'react-router-dom'

/** Hands a test the router's `navigate`, to move inside the app without a reload, and its
 * current location. */
export function NavigateHandle({
  onReady,
}: {
  onReady: (navigate: NavigateFunction, location: Location) => void
}) {
  onReady(useNavigate(), useLocation())
  return null
}
