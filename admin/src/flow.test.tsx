import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MESSAGES } from './api/errors'
import { FakeApi, PASSWORD, USERNAME } from './test/fakeApi'
import { logIn, renderApp, where } from './test/render'

const WRONG_PASSWORD = 'a wrong placeholder password'
const CONSOLE = ['log', 'info', 'warn', 'error', 'debug'] as const

describe('a full session', () => {
  it('never puts a password or CSRF token anywhere but the request and the password field', async () => {
    const spies = CONSOLE.map((method) => vi.spyOn(console, method))
    const fake = new FakeApi()
    const { user } = renderApp('/', fake)
    const tokens = () => [
      fake.csrfToken,
      ...fake.requests.map((r) => r.headers['x-csrf-token']).filter(Boolean),
    ]
    const secrets = () => [PASSWORD, WRONG_PASSWORD, ...tokens()]

    function nothingLeaked() {
      expect(localStorage.length).toBe(0)
      expect(sessionStorage.length).toBe(0)
      expect(document.cookie).toBe('')
      const page = document.body.cloneNode(true) as HTMLElement
      page.querySelector('input[type="password"]')?.remove()
      for (const secret of secrets()) {
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
