import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { createApi } from './api/client'
import { createQueryClient } from './api/queries'
import { Providers } from './Providers'
import { reloadOnStaleChunk } from './staleChunks'

// The data files are deployed with the site, on its own origin.
const api = createApi({ baseUrl: window.location.origin })
const queryClient = createQueryClient()
reloadOnStaleChunk()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers api={api} queryClient={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Providers>
  </StrictMode>,
)
