import { render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router'
import { vi } from 'vitest'
import { App } from '../App'
import { createApi } from '../api/client'
import { FakeApi, ORIGIN, PASSWORD, USERNAME } from './fakeApi'

/** Render the whole app at a path, against the fake API. */
export function renderApp(path: string, fake = new FakeApi(), { fakeTimers = false } = {}) {
  window.history.replaceState(null, '', path)
  const api = createApi({ baseUrl: ORIGIN, fetch: fake.respond })
  const user = userEvent.setup(fakeTimers ? { advanceTimers: vi.advanceTimersByTime } : {})
  // StrictMode, as in main.tsx: effects run twice in development, and the app must still ask
  // the API only once.
  render(
    <StrictMode>
      <BrowserRouter>
        <App api={api} />
      </BrowserRouter>
    </StrictMode>,
  )
  return { fake, api, user }
}

/** The address bar: path and query string. */
export function where() {
  return window.location.pathname + window.location.search
}

export async function logIn(
  user: ReturnType<typeof userEvent.setup>,
  username = USERNAME,
  password = PASSWORD,
) {
  await user.type(await screen.findByLabelText('Username'), username)
  await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Log in' }))
}

/** Starts watching the page; the returned function says whether `selector` ever matched. */
export function everShown(selector: string): () => boolean {
  let seen = document.querySelector(selector) !== null
  const observer = new MutationObserver(() => {
    if (document.querySelector(selector)) seen = true
  })
  observer.observe(document.body, { childList: true, subtree: true })
  return () => {
    observer.disconnect()
    return seen
  }
}
