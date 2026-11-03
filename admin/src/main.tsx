import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App } from './App'
import { createApi } from './api/client'
import './index.css'

const api = createApi({ baseUrl: import.meta.env.VITE_API_BASE_URL })

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <BrowserRouter>
      <App api={api} />
    </BrowserRouter>
  </StrictMode>,
)
