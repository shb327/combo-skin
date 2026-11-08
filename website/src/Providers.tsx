import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { useReducer, type ReactNode } from 'react'
import type { Api } from '@/api/client'
import { ApiContext } from '@/api/useApi'
import { INITIAL, ViewerContext, viewerReducer } from '@/viewer/state'

/** The API client, the query cache and the 3D view state of the visit, for `main.tsx` and
 * tests. */
export function Providers({
  api,
  queryClient,
  children,
}: {
  api: Api
  queryClient: QueryClient
  children: ReactNode
}) {
  const viewer = useReducer(viewerReducer, INITIAL)
  return (
    <ApiContext.Provider value={api}>
      <QueryClientProvider client={queryClient}>
        <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>
      </QueryClientProvider>
    </ApiContext.Provider>
  )
}
