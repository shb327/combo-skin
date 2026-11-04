import { useNavigate, type NavigateFunction } from 'react-router-dom'

/** Hands a test the router's `navigate`, to move inside the app without a reload. */
export function NavigateHandle({ onReady }: { onReady: (navigate: NavigateFunction) => void }) {
  onReady(useNavigate())
  return null
}
