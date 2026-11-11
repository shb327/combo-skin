import { useSearchParams } from 'react-router-dom'
import type { ComboCounts } from '@/api/client'

/** The URL's `has` value that turns the "Has combos" filter on. */
const HAS_COMBOS = 'combos'

/** Whether the "Has combos" filter applies (only once counts have loaded), and how to set it.
 * It lives in the URL as `?has=combos`, set with `replace` so toggling adds no history. */
export function useHasCombos(counts: ComboCounts | undefined) {
  const [searchParams, setSearchParams] = useSearchParams()
  const filtered = counts !== undefined && searchParams.get('has') === HAS_COMBOS
  const setFiltered = (on: boolean) =>
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params)
        if (on) next.set('has', HAS_COMBOS)
        else next.delete('has')
        return next
      },
      { replace: true },
    )
  return { filtered, setFiltered }
}
