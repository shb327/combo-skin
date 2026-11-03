import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MESSAGES } from './api/errors'
import { COMBO_MESSAGES } from './combos/messages'
import { FakeApi, ORIGIN, PASSWORD, USERNAME } from './test/fakeApi'
import { logIn, renderApp, where } from './test/render'

const WRONG_PASSWORD = 'a wrong placeholder password'
/** Nothing in local or session storage, and no cookie. */
function storageIsEmpty() {
  // The guard rails forbid these everywhere; this test only reads them to prove they stay empty.
  // eslint-disable-next-line no-restricted-globals
  expect(localStorage.length).toBe(0)
  // eslint-disable-next-line no-restricted-globals
  expect(sessionStorage.length).toBe(0)
  // eslint-disable-next-line no-restricted-properties, no-restricted-syntax
  expect(document.cookie).toBe('')
}

const CONSOLE = ['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir', 'table', 'group', 'groupCollapsed'] as const

describe('a full session', () => {
  it('never puts a password or CSRF token anywhere but the request and the password field', async () => {
    const spies = CONSOLE.map((method) => vi.spyOn(console, method))
    // Every address the app ever moves to, not only those at the checkpoints below.
    const addresses: string[] = []
    for (const method of ['pushState', 'replaceState'] as const) {
      const original = window.history[method].bind(window.history)
      vi.spyOn(window.history, method).mockImplementation((state, unused, url) => {
        if (url !== undefined && url !== null) addresses.push(String(url))
        original(state, unused, url)
      })
    }
    const fake = new FakeApi()
    const { user } = renderApp('/', fake)
    const tokens = () => [
      fake.csrfToken,
      ...fake.requests.map((r) => r.headers['x-csrf-token']).filter(Boolean),
    ]
    const secrets = () => [PASSWORD, WRONG_PASSWORD, ...tokens()]

    function nothingLeaked() {
      storageIsEmpty()
      const page = document.body.cloneNode(true) as HTMLElement
      page.querySelector('input[type="password"]')?.remove()
      for (const secret of secrets()) {
        for (const address of addresses) {
          expect(address).not.toContain(secret)
          expect(decodeURIComponent(address)).not.toContain(secret)
        }
        expect(window.location.href).not.toContain(secret)
        expect(decodeURIComponent(window.location.href)).not.toContain(secret)
        expect(page.innerHTML).not.toContain(secret)
        expect(page.textContent).not.toContain(secret)
        for (const spy of spies) {
          expect(JSON.stringify(spy.mock.calls)).not.toContain(secret)
        }
      }
    }

    await waitFor(() => expect(where()).toBe('/login?next=%2F'))
    nothingLeaked()
    expect(addresses.length).toBeGreaterThan(0)

    await logIn(user, USERNAME, WRONG_PASSWORD)
    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGES.invalidCredentials)
    nothingLeaked()

    await user.clear(screen.getByLabelText('Username'))
    await logIn(user)
    expect(await screen.findByRole('navigation')).toBeInTheDocument()
    nothingLeaked()

    // Another tab replaced the session: logout is refused once, then retried with the new token.
    fake.csrfToken = 'csrf-token-from-another-tab'
    await user.click(screen.getByRole('button', { name: 'Log out' }))
    expect(await screen.findByLabelText('Username')).toBeInTheDocument()
    expect(fake.to('POST /admin/logout')).toHaveLength(2)
    expect(fake.to('GET /admin/me')).toHaveLength(2)
    nothingLeaked()
    expect(tokens().length).toBeGreaterThanOrEqual(2)
  })
})

describe('entering combos', () => {
  it('keeps nothing in the browser, and sends every write to the API with the session token', async () => {
    const fake = new FakeApi().withSession()
    const { user } = renderApp('/gloves', fake)
    function writesAreSafe() {
      for (const write of fake.writes()) {
        expect(write.url.startsWith(`${ORIGIN}/`)).toBe(true)
        expect(write.credentials).toBe('include')
        if (!write.url.endsWith('/admin/login')) expect(fake.issued).toContain(write.headers['x-csrf-token'])
      }
    }

    // Search, then a batch.
    await user.type(await screen.findByRole('combobox', { name: 'Find gloves' }), 'crimson{Enter}')
    await user.click(await screen.findByRole('link', { name: 'Start a batch' }))
    await user.click(await screen.findByRole('link', { name: /Doppler \(Ruby\)/ }))
    await user.type(await screen.findByLabelText('Top rating'), '9.5')
    storageIsEmpty()

    // The session ends with the batch unsaved; it comes back after login.
    fake.loggedIn = false
    await user.click(screen.getByRole('button', { name: 'Save 3 as drafts' }))
    await logIn(user)
    expect(await screen.findByText('Restored unsaved changes.')).toBeInTheDocument()
    expect(screen.getByLabelText('Rating for M9 Bayonet')).toHaveValue('9.40')
    storageIsEmpty()

    await user.click(screen.getByRole('button', { name: 'Save 3 as drafts' }))
    await user.click(await screen.findByRole('button', { name: 'Publish these 3 new combos' }))
    expect(await screen.findByText('Published 3 combos.')).toBeInTheDocument()
    storageIsEmpty()

    // An edit that meets another admin's change.
    const karambit = fake.store.combos.find((c) => c.knife.type_slug === 'karambit')
    if (!karambit) throw new Error('No Karambit combo')
    await user.click(screen.getByRole('link', { name: /Back to/ }))
    await user.click(
      within(await screen.findByRole('listitem', { name: 'Karambit | Doppler (Ruby)' })).getByRole('link', { name: 'Edit' }),
    )
    await user.clear(await screen.findByLabelText('Rating'))
    await user.type(screen.getByLabelText('Rating'), '9.9')
    fake.store.changeAsAnother(karambit.id, { rating: 9 })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(COMBO_MESSAGES.conflict)
    storageIsEmpty()

    expect(fake.writes().length).toBeGreaterThanOrEqual(5)
    writesAreSafe()
    // Writes after the second login carry that session's token, not the first one's.
    const lastWrite = fake.writes().at(-1)
    expect(lastWrite?.headers['x-csrf-token']).toBe(fake.csrfToken)
    expect(fake.issued).toHaveLength(2)
  })
})
