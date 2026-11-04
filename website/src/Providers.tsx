import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { Api } from '@/api/client'
import { ApiContext } from '@/api/useApi'

/** The API client and the query cache, for `main.tsx` and tests. */
export function Providers({
  api,
  queryClient,
  children,
}: {
  api: Api
  queryClient: QueryClient
  children: ReactNode
}) {
  return (
    <ApiContext.Provider value={api}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ApiContext.Provider>
  )
}
