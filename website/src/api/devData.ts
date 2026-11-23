/** The dev and preview servers' `/data/` files, answered live from the local API's public
 * routes, so development shows the dashboard's published combos. Production has real files
 * there, written by the publish command (deploy/). Used by vite.config.ts and tests. */

const SLUG = '[a-z0-9][a-z0-9-]*'
const FINISH = new RegExp(`^/data/(gloves|knives)/(${SLUG})/(${SLUG})\\.json$`)

/** The API route for a data file's path, or null for a path that is not one. */
export function apiPathFor(url: string): string | null {
  const path = url.split('?')[0]
  if (path === '/data/combo-counts.json') return '/combo-counts'
  const match = FINISH.exec(path)
  return match ? `/${match[1]}/${match[2]}/${match[3]}/combos` : null
}

interface DevRequest {
  url?: string
  method?: string
}

interface DevResponse {
  statusCode: number
  setHeader(name: string, value: string): void
  end(body?: string | Uint8Array): void
}

/** Connect middleware for Vite's dev and preview servers. */
export function dataProxy(api: string, fetchImpl: (url: string) => Promise<Response> = fetch) {
  return async (req: DevRequest, res: DevResponse, next: () => void) => {
    const url = req.url ?? ''
    if (!url.startsWith('/data/')) return next()
    const route = apiPathFor(url)
    if (!route || (req.method !== 'GET' && req.method !== 'HEAD')) {
      res.statusCode = 404
      res.end()
      return
    }
    try {
      const answer = await fetchImpl(`${api}${route}`)
      res.statusCode = answer.status
      res.setHeader('Content-Type', answer.headers.get('Content-Type') ?? 'application/octet-stream')
      res.setHeader('Cache-Control', 'no-store')
      res.end(new Uint8Array(await answer.arrayBuffer()))
    } catch {
      res.statusCode = 502
      res.end()
    }
  }
}
