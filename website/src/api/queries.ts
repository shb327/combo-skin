import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, type ComboCounts, type Kind } from './client'
import { withFinishCount } from './counts'
import { useApi } from './useApi'

const COUNTS_KEY = ['combo-counts']

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

/** The published combos of one finish, in the API's order. Loading them also sets the finish's
 * number in cached counts, so its card agrees with the page the visitor just saw. */
export function useFinishCombos(kind: Kind, type: string, finish: string) {
  const api = useApi()
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: ['combos', kind, type, finish],
    queryFn: async ({ signal }) => {
      const combos = await api.finishCombos(kind, type, finish, signal)
      // Keeps the counts' own age, so they still refresh on time.
      const updatedAt = queryClient.getQueryState(COUNTS_KEY)?.dataUpdatedAt
      queryClient.setQueryData<ComboCounts>(
        COUNTS_KEY,
        (counts) => counts && withFinishCount(counts, kind, type, finish, combos.length),
        { updatedAt },
      )
      return combos
    },
  })
}

/** The published combo count of every finish with combos, or undefined while they load or when
 * they failed: the pages then show no counts. */
export function useComboCounts(): ComboCounts | undefined {
  const api = useApi()
  const query = useQuery({
    queryKey: COUNTS_KEY,
    queryFn: ({ signal }) => api.comboCounts(signal),
  })
  return query.isError ? undefined : query.data
}
