import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MESSAGES } from './api/errors'
import { FakeApi, PASSWORD, USERNAME, error, json } from './test/fakeApi'
import { logIn, renderApp, where } from './test/render'

afterEach(() => {
  vi.useRealTimers()
})

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('loading', () => {
  it('asks the API once and shows only a loading state until it answers', async () => {
    let answer: (response: Response) => void = () => {}
    const fake = new FakeApi().withSession()
    fake.next('GET /admin/me', new Promise<Response>((resolve) => (answer = resolve)))
    renderApp('/', fake)

    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(screen.queryByLabelText('Username')).toBeNull()
    expect(screen.queryByRole('navigation')).toBeNull()

    await act(async () => answer(json(200, fake.session())))
    expect(await screen.findByText(USERNAME)).toBeInTheDocument()
    expect(screen.queryByLabelText('Username')).toBeNull()
  })

  it('shows the shell for a live session', async () => {
    const { fake } = renderApp('/', new FakeApi().withSession())
    expect(await screen.findByRole('navigation')).toBeInTheDocument()
    expect(screen.getByText(USERNAME)).toBeInTheDocument()
    expect(fake.to('GET /admin/me')).toHaveLength(1)
  })

  it('shows the login page without one', async () => {
    const { fake } = renderApp('/')
    expect(await screen.findByLabelText('Username')).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).toBeNull()
    expect(fake.to('GET /admin/me')).toHaveLength(1)
  })
})

describe('login', () => {
  it('returns to the requested path and query', async () => {
    const { fake, user } = renderApp('/login?next=%2Fgloves%3Fa%3D1')
    await logIn(user)
    await waitFor(() => expect(where()).toBe('/gloves?a=1'))
    // The address changes a moment before the shell renders.
    expect(await screen.findByText(USERNAME)).toBeInTheDocument()
    expect(fake.to('POST /admin/login')).toHaveLength(1)
    expect(JSON.parse(fake.to('POST /admin/login')[0].body)).toEqual({ username: USERNAME, password: PASSWORD })
  })

  it('goes home without a return path', async () => {
    const { user } = renderApp('/login')
    await logIn(user)
    await waitFor(() => expect(where()).toBe('/'))
  })

  it('keeps the username and clears the password after wrong credentials', async () => {
    const { user } = renderApp('/login')
    await logIn(user, USERNAME, 'a wrong placeholder password')
    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGES.invalidCredentials)
    expect(screen.getByLabelText('Username')).toHaveValue(USERNAME)
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByLabelText('Password')).toHaveFocus()
  })

  it('counts down Retry-After and keeps submit disabled until it ends', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const fake = new FakeApi().next('POST /admin/login', error(429, 'too_many_attempts', { 'Retry-After': '90' }))
    const { user } = renderApp('/login', fake, { fakeTimers: true })
    await logIn(user)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(MESSAGES.tooManyAttempts)
    expect(alert).toHaveTextContent('1:30')
    const submit = screen.getByRole('button', { name: 'Log in' })
    expect(submit).toBeDisabled()
    await act(async () => vi.advanceTimersByTime(30_000))
    expect(alert).toHaveTextContent('1:00')
    expect(submit).toBeDisabled()
    await act(async () => vi.advanceTimersByTime(60_000))
    expect(submit).toBeEnabled()
  })

  it.each<Record<string, string>>([{}, { 'Retry-After': 'soon' }])('enables submit without a usable Retry-After (%o)', async (headers) => {
    const fake = new FakeApi().next('POST /admin/login', error(429, 'too_many_attempts', headers))
    const { user } = renderApp('/login', fake)
    await logIn(user)
    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGES.tooManyAttempts)
    expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled()
  })

  it.each([
    ['origin_not_allowed', error(403, 'origin_not_allowed'), MESSAGES.originNotAllowed],
    ['no response', 'network-error' as const, MESSAGES.network],
    ['a 500 with markup', new Response('<b>x</b>', { status: 500 }), MESSAGES.generic],
    ['an unknown code', error(400, 'something_new'), MESSAGES.generic],
  ])('shows a fixed message for %s', async (_, reply, message) => {
    const { user } = renderApp('/login', new FakeApi().next('POST /admin/login', reply))
    await logIn(user)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(message)
    expect(document.body.innerHTML).not.toContain('<b>x</b>')
  })

  it('shows the logo and ADMIN, not the product name in text', async () => {
    renderApp('/login')
    expect(await screen.findByRole('img', { name: 'Combo Skin' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Admin' })).toHaveClass('uppercase')
    expect(document.body).not.toHaveTextContent('Combo Skin admin')
  })

  it('has labelled fields with the right attributes, in a post form', async () => {
    renderApp('/login')
    const username = await screen.findByLabelText('Username')
    const password = screen.getByLabelText('Password')
    expect(username).toHaveAttribute('autocomplete', 'username')
    expect(username).toHaveAttribute('maxlength', '64')
    expect(username).toBeRequired()
    expect(password).toHaveAttribute('autocomplete', 'current-password')
    expect(password).toHaveAttribute('maxlength', '1024')
    expect(password).toHaveAttribute('type', 'password')
    expect(password).toBeRequired()
    const form = username.closest('form')
    expect(form).toHaveAttribute('method', 'post')
    expect(form).not.toHaveAttribute('action')
  })

  it('sends nothing with an empty field, or while a login is in flight', async () => {
    const { fake, user } = renderApp('/login')
    await user.type(await screen.findByLabelText('Username'), USERNAME)
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(fake.to('POST /admin/login')).toHaveLength(0)

    let answer: (response: Response) => void = () => {}
    fake.next('POST /admin/login', new Promise<Response>((resolve) => (answer = resolve)))
    await user.type(screen.getByLabelText('Password'), PASSWORD)
    const form = screen.getByLabelText('Username').closest('form') as HTMLFormElement
    await act(async () => {
      form.requestSubmit()
      form.requestSubmit()
    })
    expect(screen.getByRole('button', { name: 'Log in' })).toBeDisabled()
    expect(fake.to('POST /admin/login')).toHaveLength(1)
    await act(async () => answer(json(200, fake.session())))
  })

  it.each([
    '//example.com',
    'https://example.com',
    '/\\example.com',
    'javascript:alert(1)',
    '/login',
    '/login?next=%2F',
    '/.//example.com',
    '/./login',
    '/%2e%2e//example.com',
  ])(
    'ignores the return path %s',
    async (next) => {
      const { user } = renderApp(`/login?next=${encodeURIComponent(next)}`)
      await logIn(user)
      await waitFor(() => expect(where()).toBe('/'))
    },
  )

  it('sends a live session from /login to home', async () => {
    renderApp('/login', new FakeApi().withSession())
    await waitFor(() => expect(where()).toBe('/'))
    expect(await screen.findByRole('navigation')).toBeInTheDocument()
  })
})

describe('session end', () => {
  it('asks for login first, then returns to the path', async () => {
    const { user } = renderApp('/knives?a=1')
    await waitFor(() => expect(where()).toBe('/login?next=%2Fknives%3Fa%3D1'))
    await logIn(user)
    await waitFor(() => expect(where()).toBe('/knives?a=1'))
  })

  it('shows login with a notice when a request finds the session ended, and returns after', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const fake = new FakeApi().withSession()
    const { user } = renderApp('/gloves?a=1', fake, { fakeTimers: true })
    expect(await screen.findByRole('navigation')).toBeInTheDocument()
    fake.loggedIn = false
    setVisibility('hidden')
    await act(async () => vi.advanceTimersByTime(61_000))
    setVisibility('visible')
    expect(await screen.findByText(MESSAGES.sessionEnded)).toBeInTheDocument()
    expect(where()).toBe('/login?next=%2Fgloves%3Fa%3D1')
    await logIn(user)
    await waitFor(() => expect(where()).toBe('/gloves?a=1'))
  })

  it('re-checks when expires_at passes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const fake = new FakeApi()
    fake.expiresAt = new Date(Date.now() + 10 * 60_000).toISOString()
    fake.withSession()
    renderApp('/', fake, { fakeTimers: true })
    expect(await screen.findByRole('navigation')).toBeInTheDocument()
    await act(async () => vi.advanceTimersByTime(9 * 60_000))
    expect(fake.to('GET /admin/me')).toHaveLength(1)
    fake.loggedIn = false
    await act(async () => vi.advanceTimersByTime(60_000 + 1_000))
    expect(fake.to('GET /admin/me')).toHaveLength(2)
    expect(await screen.findByText(MESSAGES.sessionEnded)).toBeInTheDocument()
  })

  it('re-checks after a minute hidden, not after less', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { fake } = renderApp('/', new FakeApi().withSession(), { fakeTimers: true })
    expect(await screen.findByRole('navigation')).toBeInTheDocument()
    setVisibility('hidden')
    await act(async () => vi.advanceTimersByTime(30_000))
    setVisibility('visible')
    await act(async () => vi.advanceTimersByTime(5 * 60_000))
    expect(fake.to('GET /admin/me')).toHaveLength(1)
    setVisibility('hidden')
    await act(async () => vi.advanceTimersByTime(61_000))
    setVisibility('visible')
    await waitFor(() => expect(fake.to('GET /admin/me')).toHaveLength(2))
    expect(screen.getByRole('navigation')).toBeInTheDocument()
  })

  it('goes to login when the CSRF refresh finds the session ended', async () => {
    const fake = new FakeApi().withSession()
    fake.next('POST /admin/logout', error(403, 'csrf_failed'))
    fake.next('GET /admin/me', json(200, fake.session()), error(401, 'not_authenticated'))
    const { user } = renderApp('/gloves', fake)
    await user.click(await screen.findByRole('button', { name: 'Log out' }))
    expect(await screen.findByLabelText('Username')).toBeInTheDocument()
    expect(screen.getByText(MESSAGES.sessionEnded)).toBeInTheDocument()
  })
})

describe('logout', () => {
  it('ends the session after a 204', async () => {
    const fake = new FakeApi().withSession()
    const token = fake.csrfToken
    const { user } = renderApp('/gloves', fake)
    await user.click(await screen.findByRole('button', { name: 'Log out' }))
    expect(await screen.findByLabelText('Username')).toBeInTheDocument()
    expect(fake.to('POST /admin/logout')[0].headers['x-csrf-token']).toBe(token)
    expect(where()).toBe('/login')

    window.history.pushState(null, '', '/gloves')
    await act(async () => window.dispatchEvent(new PopStateEvent('popstate')))
    await waitFor(() => expect(where()).toBe('/login?next=%2Fgloves'))
    expect(screen.queryByRole('heading', { name: 'By gloves' })).toBeNull()
  })

  it.each([
    ['a 500', new Response(null, { status: 500 })],
    ['origin_not_allowed', error(403, 'origin_not_allowed')],
    ['no response', 'network-error' as const],
  ])('stays logged in after %s', async (_, reply) => {
    const fake = new FakeApi().withSession().next('POST /admin/logout', reply)
    const { user } = renderApp('/', fake)
    await user.click(await screen.findByRole('button', { name: 'Log out' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(USERNAME)).toBeInTheDocument()
    expect(screen.getByRole('navigation')).toBeInTheDocument()
  })
})

describe('csrf_failed twice', () => {
  it('shows an error and sends nothing more', async () => {
    const fake = new FakeApi().withSession()
    fake.next('POST /admin/logout', error(403, 'csrf_failed'), error(403, 'csrf_failed'))
    const { user } = renderApp('/', fake)
    await user.click(await screen.findByRole('button', { name: 'Log out' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGES.generic)
    expect(screen.getByText(USERNAME)).toBeInTheDocument()
    const routes = fake.requests.map((r) => `${r.method} ${new URL(r.url).pathname}`)
    expect(routes).toEqual(['GET /admin/me', 'POST /admin/logout', 'GET /admin/me', 'POST /admin/logout'])
  })
})

describe('shell', () => {
  it('has the header, the navigation and the placeholders', async () => {
    const { user } = renderApp('/', new FakeApi().withSession())
    const banner = await screen.findByRole('banner')
    expect(within(banner).getByRole('img', { name: 'Combo Skin' })).toBeInTheDocument()
    expect(within(banner).getByText('Admin')).toHaveClass('uppercase')
    expect(banner).not.toHaveTextContent('Combo Skin admin')
    expect(within(banner).getByText(USERNAME)).toBeInTheDocument()
    expect(within(banner).getByRole('button', { name: 'Log out' })).toBeInTheDocument()

    const nav = screen.getByRole('navigation')
    const links = within(nav).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['Home', 'By gloves', 'By knife'])
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/', '/gloves', '/knives'])
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')

    const main = screen.getByRole('main')
    expect(within(main).getByRole('link', { name: /By gloves/ })).toHaveAttribute('href', '/gloves')
    expect(within(main).getByRole('link', { name: /By knife/ })).toHaveAttribute('href', '/knives')

    await user.click(within(nav).getByRole('link', { name: 'By gloves' }))
    expect(await screen.findByRole('heading', { name: 'By gloves' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'By gloves' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')

    await user.click(within(nav).getByRole('link', { name: 'By knife' }))
    expect(await screen.findByRole('heading', { name: 'By knife' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'By knife' })).toHaveAttribute('aria-current', 'page')
  })

  it('shows not found inside the shell', async () => {
    renderApp('/nope', new FakeApi().withSession())
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('navigation')).toBeInTheDocument()
    expect(within(screen.getByRole('main')).getByRole('link', { name: /home/i })).toHaveAttribute('href', '/')
  })

  it('asks for login before not found', async () => {
    renderApp('/nope')
    await waitFor(() => expect(where()).toBe('/login?next=%2Fnope'))
    expect(await screen.findByLabelText('Username')).toBeInTheDocument()
  })

  it.each([
    ['/', 'Home'],
    ['/gloves', 'By gloves'],
    ['/knives', 'By knife'],
    ['/nope', 'Not found'],
  ])('titles %s', async (path, page) => {
    renderApp(path, new FakeApi().withSession())
    await waitFor(() => expect(document.title).toBe(`${page} · Combo Skin admin`))
  })

  it('titles the login page', async () => {
    renderApp('/login')
    await waitFor(() => expect(document.title).toBe('Log in · Combo Skin admin'))
  })
})
