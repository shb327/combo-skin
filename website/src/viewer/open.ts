/** Opening a combo's 3D window from its card, provided by the finish page's `ViewerHost`. */
import { createContext, useContext } from 'react'

/** The query parameter of an open window: `?3d=<combo id>`. */
export const PARAM = '3d'

export const OpenContext = createContext<((comboId: string) => void) | null>(null)

/** Opens a combo's 3D window; null outside a finish page. */
export function useOpenViewer(): ((comboId: string) => void) | null {
  return useContext(OpenContext)
}
