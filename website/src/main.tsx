import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { createApi } from './api/client'
import { createQueryClient } from './api/queries'
import { Providers } from './Providers'

const api = createApi({ baseUrl: import.meta.env.VITE_API_BASE_URL })
const queryClient = createQueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers api={api} queryClient={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Providers>
  </StrictMode>,
)
