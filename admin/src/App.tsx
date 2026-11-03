import { Route, Routes } from 'react-router'
import type { Api } from './api/client'
import { RequireSession } from './auth/RequireSession'
import { SessionProvider } from './auth/session'
import { Layout } from './components/Layout'
import { ByGlovesPage } from './pages/ByGlovesPage'
import { ByKnifePage } from './pages/ByKnifePage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'

export function App({ api }: { api: Api }) {
  return (
    <SessionProvider api={api}>
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
          <Route path="gloves" element={<ByGlovesPage />} />
          <Route path="knives" element={<ByKnifePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </SessionProvider>
  )
}
