/** A fake of the API for tests: a `fetch` function that routes by method and path, answers
 * with bodies typed from the generated schema, and records every request. Login and session
 * routes, the catalog, and combos, agents and the default agent (through `ComboStore`). Usernames, passwords and tokens here
 * are placeholders. */
import type { components } from '../api/schema'
import { ComboStore, catalogAnswer, type Answer, type Kind } from './fakeCatalog'

type AdminSession = components['schemas']['AdminSession']
type ErrorBody = components['schemas']['Error']

export const ORIGIN = 'http://localhost:8000'
export const USERNAME = 'placeholder-admin'
export const OTHER_USERNAME = 'other-placeholder-admin'
export const PASSWORD = 'placeholder password for tests'

export type Route =
  | 'GET /admin/me'
  | 'POST /admin/login'
  | 'POST /admin/logout'
  | 'GET /gloves'
  | 'GET /knives'
  | 'GET /gloves/{type}'
  | 'GET /knives/{type}'
  | 'GET /gloves/{type}/{finish}'
  | 'GET /knives/{type}/{finish}'
  | 'GET /admin/combos'
  | 'POST /admin/combos'
  | 'GET /admin/combos/{id}'
  | 'PUT /admin/combos/{id}'
  | 'DELETE /admin/combos/{id}'
  | 'POST /admin/combos/publish'
  | 'POST /admin/combos/unpublish'
  | 'GET /admin/batches/finishes'
  | 'GET /admin/batches/candidates'
  | 'POST /admin/batches'
  | 'GET /admin/knife-order'
  | 'PUT /admin/knife-order'
  | 'GET /admin/agents'
  | 'GET /admin/screenshot-settings'
  | 'PUT /admin/screenshot-settings'

const FIXED = new Set([
  '/admin/me',
  '/admin/login',
  '/admin/logout',
  '/admin/combos',
  '/admin/combos/publish',
  '/admin/combos/unpublish',
  '/admin/batches/finishes',
  '/admin/batches/candidates',
  '/admin/batches',
  '/admin/knife-order',
  '/admin/agents',
  '/admin/screenshot-settings',
  '/gloves',
  '/knives',
])

/** The route pattern of a request, and the values of its path parameters. */
export function routeOf(method: string, pathname: string): { route: Route; params: string[] } {
  if (FIXED.has(pathname)) return { route: `${method} ${pathname}` as Route, params: [] }
  const parts = pathname.split('/').slice(1)
  if (parts[0] === 'admin' && parts[1] === 'combos' && parts.length === 3) {
    return { route: `${method} /admin/combos/{id}` as Route, params: [parts[2]] }
  }
  if ((parts[0] === 'gloves' || parts[0] === 'knives') && parts.length <= 3) {
    const pattern = ['', parts[0], '{type}', '{finish}'].slice(0, parts.length + 1).join('/')
    return { route: `${method} ${pattern}` as Route, params: parts.slice(1) }
  }
  return { route: `${method} ${pathname}` as Route, params: [] }
}

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

/** A 422 body in FastAPI's list format. */
export function refusal(...problems: [loc: (string | number)[], type: string][]) {
  return json(422, { detail: problems.map(([loc, type]) => ({ loc, msg: 'refused', type })) })
}

export class FakeApi {
  requests: Recorded[] = []
  loggedIn = false
  csrfToken = 'csrf-token-0'
  username = USERNAME
  store = new ComboStore()
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
    return { admin: { username: this.username }, csrf_token: this.csrfToken, expires_at: this.expiresAt }
  }

  /** Requests to a route, in order. */
  to(route: Route) {
    return this.requests.filter((r) => routeOf(r.method, new URL(r.url).pathname).route === route)
  }

  /** Writes made with the session, in order. */
  writes() {
    return this.requests.filter((r) => r.method !== 'GET')
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
    const url = new URL(request.url)
    const { route, params } = routeOf(request.method, url.pathname)
    const reply = this.queued.get(route)?.shift()
    if (reply === 'network-error') throw new TypeError('Failed to fetch')
    if (reply) return reply
    return this.answer(route, request, body, params, url.searchParams)
  }

  /** Every CSRF token the fake has issued, in order. */
  issued: string[] = []

  private newToken() {
    this.tokens += 1
    this.issued.push(`csrf-token-${this.tokens}`)
    return `csrf-token-${this.tokens}`
  }

  private answer(
    route: Route,
    request: Request,
    body: string,
    params: string[],
    query: URLSearchParams,
  ): Response {
    const [method, path] = route.split(' ')
    if (path.startsWith('/gloves') || path.startsWith('/knives')) {
      const kind: Kind = path.startsWith('/gloves') ? 'glove' : 'knife'
      return reply(catalogAnswer(kind, params[0], params[1]))
    }
    if (!['/admin/me', '/admin/login', '/admin/logout'].includes(path)) {
      if (!this.loggedIn) return error(401, 'not_authenticated')
      if (method !== 'GET' && request.headers.get('X-CSRF-Token') !== this.csrfToken) {
        return error(403, 'csrf_failed')
      }
      return reply(this.combos(route, (body ? JSON.parse(body) : null) as never, params, query))
    }
    switch (route) {
      case 'GET /admin/me':
        return this.loggedIn ? json(200, this.session()) : error(401, 'not_authenticated')
      case 'POST /admin/login': {
        const credentials = JSON.parse(body) as components['schemas']['Credentials']
        const known = credentials.username === USERNAME || credentials.username === OTHER_USERNAME
        if (!known || credentials.password !== PASSWORD) {
          return error(401, 'invalid_credentials')
        }
        this.username = credentials.username
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

  private combos(route: Route, body: never, params: string[], query: URLSearchParams): Answer {
    const store = this.store
    const by = this.username
    switch (route) {
      case 'GET /admin/combos':
        return store.list(query)
      case 'POST /admin/combos':
        return store.create(body, by)
      case 'GET /admin/combos/{id}':
        return store.read(params[0])
      case 'PUT /admin/combos/{id}':
        return store.update(params[0], body, by)
      case 'DELETE /admin/combos/{id}':
        return store.remove(params[0], Number(query.get('version')))
      case 'POST /admin/combos/publish':
        return store.setStatus(body, true, by)
      case 'POST /admin/combos/unpublish':
        return store.setStatus(body, false, by)
      case 'GET /admin/batches/finishes':
        return store.batchFinishes()
      case 'GET /admin/batches/candidates':
        return store.candidates(query)
      case 'POST /admin/batches':
        return store.saveBatch(body, by)
      case 'GET /admin/knife-order':
        return store.getKnifeOrder()
      case 'PUT /admin/knife-order':
        return store.replaceKnifeOrder(body)
      case 'GET /admin/agents':
        return store.agents()
      case 'GET /admin/screenshot-settings':
        return store.screenshotSettings()
      case 'PUT /admin/screenshot-settings':
        return store.replaceScreenshotSettings(body)
      default:
        return [404, { detail: 'Not Found' }]
    }
  }
}

function reply(answer: Answer): Response {
  const [status, body] = answer
  return status === 204 ? new Response(null, { status }) : json(status, body)
}
