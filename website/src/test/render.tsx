import type { QueryClient } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter, type NavigateFunction } from 'react-router-dom'
import App from '@/App'
import { createApi } from '@/api/client'
import { createQueryClient } from '@/api/queries'
import { Providers } from '@/Providers'
import { ORIGIN, fakeApi, type FakeApi } from './fakeApi'
import { NavigateHandle } from './NavigateHandle'

/** Renders the whole site at `path` with a fake API. `navigate` moves inside the same app, so
 * the query cache is kept. Retries come without a delay. */
export function renderSite(
  path: string,
  {
    api = fakeApi(),
    queryClient = createQueryClient({ retryDelay: 0 }),
  }: { api?: FakeApi; queryClient?: QueryClient } = {},
) {
  let navigate!: NavigateFunction
  const result = render(
    <Providers api={createApi({ baseUrl: ORIGIN, fetch: api.fetch })} queryClient={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <NavigateHandle onReady={(handle) => (navigate = handle)} />
        <App />
      </MemoryRouter>
    </Providers>,
  )
  return { ...result, api, queryClient, navigate: (to: string) => navigate(to) }
}
