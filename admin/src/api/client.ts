/** The only module that talks to the network. Every request goes to the configured API origin,
 * with credentials, and every write made with a session carries its CSRF token. */
import createClient, { type Client, type Middleware } from 'openapi-fetch'
import { ApiError, httpError } from './errors'
import type { components, paths } from './schema'

export type AdminSession = components['schemas']['AdminSession']
export type SessionChange = 'refreshed' | 'ended'
type Listener = (session: AdminSession | null, change: SessionChange) => void

const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
export const CSRF_HEADER = 'X-CSRF-Token'

export interface ApiOptions {
  /** The API origin, already checked by `checkApiOrigin`. */
  baseUrl: string
  /** For tests; the browser's `fetch` otherwise. */
  fetch?: (request: Request) => Promise<Response>
}

export interface Api {
  /** Any API route, typed from the schema. Throws `ApiError` unless the API answers 2xx. */
  request: Client<paths>['request']
  me(): Promise<AdminSession>
  login(username: string, password: string): Promise<AdminSession>
  logout(): Promise<void>
  /** The session the client works with, kept in memory only; null when there is none. */
  setSession(session: AdminSession | null): void
  /** Told when a refused write refreshed the session, or a request found it ended. */
  onSessionChange(listener: Listener): () => void
}

/** Refuses anything but a path on the API origin, before a request is made. */
export function checkPath(path: string): void {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
    throw new Error('API requests take a path on the API origin, such as /admin/me')
  }
}

export function createApi({ baseUrl, fetch: fetchImpl }: ApiOptions): Api {
  let session: AdminSession | null = null
  const listeners = new Set<Listener>()

  const csrf: Middleware = {
    onRequest({ request }) {
      if (!request.url.startsWith(`${baseUrl}/`)) throw new Error('Request outside the API origin')
      if (session && WRITES.has(request.method)) request.headers.set(CSRF_HEADER, session.csrf_token)
      return request
    },
  }
  const client = createClient<paths>({
    baseUrl,
    credentials: 'include',
    fetch: fetchImpl ?? ((request) => fetch(request)),
  })
  client.use(csrf)

  function change(next: AdminSession | null, kind: SessionChange) {
    session = next
    for (const listener of listeners) listener(next, kind)
  }

  async function once(method: string, path: string, init: unknown[]) {
    let result: { error?: unknown; response: Response; data?: unknown }
    try {
      result = await (client.request as (...args: unknown[]) => Promise<typeof result>)(
        method,
        path,
        ...init,
      )
    } catch {
      throw new ApiError('network')
    }
    if (result.response.ok) return result
    throw httpError(result.response, result.error)
  }

  async function send(method: string, path: string, init: unknown[]) {
    checkPath(path)
    const withSession = session !== null
    try {
      return await once(method, path, init)
    } catch (failure) {
      if (!(failure instanceof ApiError) || !withSession) throw failure
      if (failure.code === 'not_authenticated') {
        change(null, 'ended')
        throw failure
      }
      if (failure.code === 'csrf_failed' && WRITES.has(method.toUpperCase())) {
        // The token can be stale after another tab replaced the session. The refused write had no
        // effect, so fetch the current token and retry once.
        change(await me(), 'refreshed')
        return once(method, path, init)
      }
      throw failure
    }
  }

  const request = ((method: string, path: string, ...init: unknown[]) =>
    send(method, path, init)) as Client<paths>['request']

  async function me(): Promise<AdminSession> {
    const { data } = await request('get', '/admin/me')
    return data as AdminSession
  }

  return {
    request,
    me,
    async login(username, password) {
      const { data } = await request('post', '/admin/login', { body: { username, password } })
      return data as AdminSession
    },
    async logout() {
      await request('post', '/admin/logout')
    },
    setSession(next) {
      session = next
    },
    onSessionChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
