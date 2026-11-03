import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Route, Routes, useLocation } from 'react-router'
import type { Api } from './api/client'
import { ApiContext } from './api/useApi'
import { RequireSession } from './auth/RequireSession'
import { SessionProvider } from './auth/session'
import { DraftsProvider } from './combos/DraftsProvider'
import { Layout } from './components/Layout'
import { AddComboPage } from './pages/AddComboPage'
import { BatchPage } from './pages/BatchPage'
import { EditComboPage } from './pages/EditComboPage'
import { FinishPage } from './pages/FinishPage'
import { FinishesPage } from './pages/FinishesPage'
import { HomePage } from './pages/HomePage'
import { KnifeOrderPage } from './pages/KnifeOrderPage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { TypePage } from './pages/TypePage'

/** A page mounted afresh for each path, so its form starts from that path's values. */
function ByPath({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return <div key={pathname}>{children}</div>
}

export function App({ api, queryClient }: { api: Api; queryClient: QueryClient }) {
  return (
    <ApiContext value={api}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider api={api}>
          <DraftsProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                element={
                  <RequireSession>
                    <Layout />
                  </RequireSession>
                }
              >
                <Route index element={<HomePage />} />
                <Route path="gloves" element={<FinishesPage kind="glove" />} />
                <Route path="gloves/:type" element={<ByPath><TypePage kind="glove" /></ByPath>} />
                <Route path="gloves/:type/:finish" element={<ByPath><FinishPage kind="glove" /></ByPath>} />
                <Route path="gloves/:type/:finish/add" element={<ByPath><AddComboPage kind="glove" /></ByPath>} />
                <Route path="gloves/:type/:finish/batch" element={<ByPath><BatchPage /></ByPath>} />
                <Route path="gloves/:type/:finish/batch/:knifeFinish" element={<ByPath><BatchPage /></ByPath>} />
                <Route path="knives" element={<FinishesPage kind="knife" />} />
                <Route path="knives/:type" element={<ByPath><TypePage kind="knife" /></ByPath>} />
                <Route path="knives/:type/:finish" element={<ByPath><FinishPage kind="knife" /></ByPath>} />
                <Route path="knives/:type/:finish/add" element={<ByPath><AddComboPage kind="knife" /></ByPath>} />
                <Route path="combos/:id" element={<ByPath><EditComboPage /></ByPath>} />
                <Route path="knife-order" element={<KnifeOrderPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </DraftsProvider>
        </SessionProvider>
      </QueryClientProvider>
    </ApiContext>
  )
}
