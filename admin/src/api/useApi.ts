import { createContext, useContext } from 'react'
import type { Api } from './client'

export const ApiContext = createContext<Api | null>(null)

/** The API client for the screens; set once in `App`. */
export function useApi(): Api {
  const api = useContext(ApiContext)
  if (!api) throw new Error('useApi outside ApiContext')
  return api
}
