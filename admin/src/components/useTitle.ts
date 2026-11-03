import { useEffect } from 'react'

export function useTitle(page: string) {
  useEffect(() => {
    document.title = `${page} · Combo Skin admin`
  }, [page])
}
