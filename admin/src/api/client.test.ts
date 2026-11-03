import { describe, expect, it, vi } from 'vitest'
import { FakeApi, ORIGIN, PASSWORD, USERNAME, error } from '../test/fakeApi'
import { createApi } from './client'
import { ApiError } from './errors'

function setup(fake = new FakeApi()) {
  const api = createApi({ baseUrl: ORIGIN, fetch: fake.respond })
  return { fake, api }
}

async function loggedIn(fake = new FakeApi()) {
  const { api } = setup(fake)
  api.setSession(await api.login(USERNAME, PASSWORD))
  return { fake, api }
}

describe('requests', () => {
  it('go only to the API origin, with credentials, and carry the CSRF token on writes', async () => {
    const { fake, api } = await loggedIn()
    const token = fake.csrfToken
    await api.me()
    await api.logout()

    expect(fake.requests).toHaveLength(3)
    for (const request of fake.requests) {
      expect(request.url.startsWith(`${ORIGIN}/`)).toBe(true)
      expect(request.credentials).toBe('include')
      // A redirect, even to the API's own origin, fails instead of carrying the token elsewhere.
      expect(request.redirect).toBe('error')
    }
    const [login, me, logout] = fake.requests
    expect(login.headers['x-csrf-token']).toBeUndefined()
    expect(login.headers['content-type']).toBe('application/json')
    expect(JSON.parse(login.body)).toEqual({ username: USERNAME, password: PASSWORD })
    expect(me.headers['x-csrf-token']).toBeUndefined()
    expect(logout.headers['x-csrf-token']).toBe(token)
  })

  it('carry no CSRF token on writes without a session', async () => {
    const { fake, api } = setup()
    await api.logout()
    expect(fake.to('POST /admin/logout')[0].headers['x-csrf-token']).toBeUndefined()
  })

  it.each(['https://evil.example.com/admin/me', '//evil.example.com/admin/me', 'admin/me'])(
    'refuse %s without sending anything',
    async (path) => {
      const { fake, api } = setup()
      await expect(api.request('get', path as '/admin/me')).rejects.toThrow(/path/)
      expect(fake.requests).toEqual([])
    },
  )
})

describe('per-request options', () => {
  it('cannot change where a request goes or how it is sent', async () => {
    const { fake, api } = await loggedIn()
    const elsewhere = vi.fn(async () => new Response(null, { status: 204 }))
    const swap = vi.fn(({ request }: { request: Request }) => new Request('https://evil.example.com/x', request))
    await api.request('get', '/admin/me', {
      baseUrl: 'https://evil.example.com',
      fetch: elsewhere,
      middleware: [{ onRequest: swap }],
      credentials: 'omit',
      redirect: 'follow',
    } as never)
    expect(elsewhere).not.toHaveBeenCalled()
    expect(swap).not.toHaveBeenCalled()
    const last = fake.requests.at(-1)
    expect(last?.url).toBe(`${ORIGIN}/admin/me`)
    expect(last?.credentials).toBe('include')
    expect(last?.redirect).toBe('error')
  })
})

describe('logout', () => {
  it.each([200, 202])('treats %i as a failure: only 204 ends the session', async (status) => {
    const { fake, api } = await loggedIn()
    fake.next('POST /admin/logout', new Response(null, { status }))
    await expect(api.logout()).rejects.toMatchObject({ kind: 'http', status })
  })
})

describe('errors', () => {
  it('carry the code and Retry-After, never the server text', async () => {
    const fake = new FakeApi().next('POST /admin/login', error(429, 'too_many_attempts', { 'Retry-After': '90' }))
    const { api } = setup(fake)
    const failure = await api.login(USERNAME, PASSWORD).catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(ApiError)
    expect(failure).toMatchObject({ kind: 'http', status: 429, code: 'too_many_attempts', retryAfter: 90 })
  })

  it('report a request without a response as a network failure', async () => {
    const { api } = setup(new FakeApi().next('GET /admin/me', 'network-error'))
    await expect(api.me()).rejects.toMatchObject({ kind: 'network' })
  })
})

describe('csrf_failed', () => {
  it('refreshes the token once and retries the write once', async () => {
    const { fake, api } = await loggedIn()
    const refreshed = vi.fn()
    api.onSessionChange(refreshed)
    // Another tab logged in again: this tab's token is stale.
    fake.csrfToken = 'csrf-token-from-another-tab'

    await api.logout()

    const routes = fake.requests.slice(1).map((r) => `${r.method} ${new URL(r.url).pathname}`)
    expect(routes).toEqual(['POST /admin/logout', 'GET /admin/me', 'POST /admin/logout'])
    expect(fake.requests[3].headers['x-csrf-token']).toBe('csrf-token-from-another-tab')
    expect(refreshed).toHaveBeenCalledWith(
      expect.objectContaining({ csrf_token: 'csrf-token-from-another-tab' }),
      'refreshed',
    )
  })

  it('gives up after the retry is refused too', async () => {
    const { fake, api } = await loggedIn()
    fake.next('POST /admin/logout', error(403, 'csrf_failed'), error(403, 'csrf_failed'))
    await expect(api.logout()).rejects.toMatchObject({ code: 'csrf_failed' })
    expect(fake.requests).toHaveLength(4)
  })

  it('ends the session when the refresh gets 401', async () => {
    const { fake, api } = await loggedIn()
    const changes = vi.fn()
    api.onSessionChange(changes)
    fake.next('POST /admin/logout', error(403, 'csrf_failed'))
    fake.next('GET /admin/me', error(401, 'not_authenticated'))
    await expect(api.logout()).rejects.toMatchObject({ code: 'not_authenticated' })
    expect(changes).toHaveBeenCalledWith(null, 'ended')
    expect(fake.requests).toHaveLength(3)
  })
})

describe('not_authenticated', () => {
  it('ends a session the client had', async () => {
    const { fake, api } = await loggedIn()
    const changes = vi.fn()
    api.onSessionChange(changes)
    fake.loggedIn = false
    await expect(api.me()).rejects.toMatchObject({ code: 'not_authenticated' })
    expect(changes).toHaveBeenCalledWith(null, 'ended')
  })

  it('is just an answer without a session', async () => {
    const { api } = setup()
    const changes = vi.fn()
    api.onSessionChange(changes)
    await expect(api.me()).rejects.toMatchObject({ code: 'not_authenticated' })
    expect(changes).not.toHaveBeenCalled()
  })
})
