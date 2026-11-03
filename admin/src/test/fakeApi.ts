/** A fake of the API's admin routes for tests: a `fetch` function that routes by method and
 * path, answers with bodies typed from the generated schema, and records every request.
 * Usernames, passwords and tokens here are placeholders. */
import type { components } from '../api/schema'

type AdminSession = components['schemas']['AdminSession']
type ErrorBody = components['schemas']['Error']

export const ORIGIN = 'http://localhost:8000'
export const USERNAME = 'placeholder-admin'
export const PASSWORD = 'placeholder password for tests'

export type Route = 'GET /admin/me' | 'POST /admin/login' | 'POST /admin/logout'

export interface Recorded {
  url: string
  method: string
  credentials: RequestCredentials
  redirect: RequestRedirect
  headers: Record<string, string>
  body: string
}

/** A queued answer: a response, one still to come, or `'network-error'` for a request that
 * never gets one. */
export type Reply = Response | Promise<Response> | 'network-error'

export function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

export function error(status: number, code: string, headers: Record<string, string> = {}) {
  const body: ErrorBody = { detail: code }
  return json(status, body, headers)
}

export class FakeApi {
  requests: Recorded[] = []
  loggedIn = false
  csrfToken = 'csrf-token-0'
  expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
  private tokens = 0
  private queued = new Map<Route, Reply[]>()

  /** Answer the next request to a route with this reply instead of the default behaviour. */
  next(route: Route, ...replies: Reply[]) {
    this.queued.set(route, [...(this.queued.get(route) ?? []), ...replies])
    return this
  }

  /** Start as logged in, as after a login in an earlier page load. */
  withSession() {
    this.loggedIn = true
    this.csrfToken = this.newToken()
    return this
  }

  session(): AdminSession {
    return { admin: { username: USERNAME }, csrf_token: this.csrfToken, expires_at: this.expiresAt }
  }

  /** Requests to a route, in order. */
  to(route: Route) {
    return this.requests.filter((r) => `${r.method} ${new URL(r.url).pathname}` === route)
  }

  respond = async (request: Request): Promise<Response> => {
    const body = await request.clone().text()
    const headers: Record<string, string> = {}
    request.headers.forEach((value, name) => {
      headers[name] = value
    })
    this.requests.push({
      url: request.url,
      method: request.method,
      credentials: request.credentials,
      redirect: request.redirect,
      headers,
      body,
    })
    const route = `${request.method} ${new URL(request.url).pathname}` as Route
    const reply = this.queued.get(route)?.shift()
    if (reply === 'network-error') throw new TypeError('Failed to fetch')
    if (reply) return reply
    return this.answer(route, request, body)
  }

  private newToken() {
    this.tokens += 1
    return `csrf-token-${this.tokens}`
  }

  private answer(route: Route, request: Request, body: string): Response {
    switch (route) {
      case 'GET /admin/me':
        return this.loggedIn ? json(200, this.session()) : error(401, 'not_authenticated')
      case 'POST /admin/login': {
        const credentials = JSON.parse(body) as components['schemas']['Credentials']
        if (credentials.username !== USERNAME || credentials.password !== PASSWORD) {
          return error(401, 'invalid_credentials')
        }
        this.loggedIn = true
        this.csrfToken = this.newToken()
        return json(200, this.session())
      }
      case 'POST /admin/logout':
        if (this.loggedIn) {
          if (request.headers.get('X-CSRF-Token') !== this.csrfToken) {
            return error(403, 'csrf_failed')
          }
          this.loggedIn = false
        }
        return new Response(null, { status: 204 })
      default:
        return error(404, 'Not Found')
    }
  }
}
