import { QueryClient, useQuery } from '@tanstack/react-query'
import { ApiError, type Kind } from './client'
import { useApi } from './useApi'

/** How long a finish's combos count as fresh: going back to a page within it sends no request. */
export const COMBOS_STALE_MS = 5 * 60 * 1000

/** One automatic retry, except when the API says the finish does not exist. */
function retry(failures: number, error: unknown): boolean {
  return failures < 1 && !(error instanceof ApiError && error.reason === 'not_found')
}

/** The site's query client. `retryDelay` is for tests. */
export function createQueryClient({ retryDelay }: { retryDelay?: number } = {}): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: COMBOS_STALE_MS,
        refetchOnWindowFocus: false,
        // Always try the request: a browser that reports itself offline gets the error and
        // "Try again", not a paused "Loading combos…".
        networkMode: 'always',
        retry,
        ...(retryDelay === undefined ? {} : { retryDelay }),
      },
    },
  })
}

/** The published combos of one finish, in the API's order. */
export function useFinishCombos(kind: Kind, type: string, finish: string) {
  const api = useApi()
  return useQuery({
    queryKey: ['combos', kind, type, finish],
    queryFn: ({ signal }) => api.finishCombos(kind, type, finish, signal),
  })
}
