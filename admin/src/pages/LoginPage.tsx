import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { ApiError, MESSAGES, errorMessage } from '../api/errors'
import { safeNext } from '../auth/returnPath'
import { useSession } from '../auth/useSession'
import { useTitle } from '../components/useTitle'
import logo from '../logo.svg'

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function LoginPage() {
  useTitle('Log in')
  const { state, login, shownLogin } = useSession()
  const [params] = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const inFlight = useRef(false)
  const [loggedInHere, setLoggedInHere] = useState(false)
  const passwordField = useRef<HTMLInputElement>(null)

  useEffect(shownLogin, [shownLogin])

  const remaining = lockedUntil === null ? 0 : Math.max(0, Math.ceil((lockedUntil - now) / 1000))

  useEffect(() => {
    if (lockedUntil === null) return
    const timer = setInterval(() => {
      setNow(Date.now())
      if (Date.now() >= lockedUntil) setLockedUntil(null)
    }, 1000)
    return () => clearInterval(timer)
  }, [lockedUntil])

  if (state.status === 'active') {
    // After a login on this page, go where the user was headed; otherwise home.
    const target = loggedInHere ? (safeNext(params.get('next')) ?? '/') : '/'
    return <Navigate to={target} replace />
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current || remaining > 0 || !username || !password) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      setLoggedInHere(true)
      await login(username, password)
    } catch (failure) {
      setLoggedInHere(false)
      setError(errorMessage(failure))
      if (failure instanceof ApiError && failure.code === 'too_many_attempts' && failure.retryAfter) {
        setNow(Date.now())
        setLockedUntil(Date.now() + failure.retryAfter * 1000)
      } else {
        setLockedUntil(null)
      }
      if (failure instanceof ApiError && failure.code === 'invalid_credentials') {
        passwordField.current?.focus()
      }
    } finally {
      // The password is never kept after a request.
      setPassword('')
      inFlight.current = false
      setBusy(false)
    }
  }

  const ended = state.status === 'anonymous' && state.reason === 'ended'
  const message =
    error === MESSAGES.tooManyAttempts && remaining > 0
      ? `${error} Try again in ${clock(remaining)}.`
      : error

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        method="post"
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-xl border border-white/10 p-6"
      >
        <img src={logo} alt="Combo Skin" className="mx-auto h-10 w-auto" />
        <h1 className="mt-4 text-center text-xl font-semibold tracking-widest uppercase">Admin</h1>
        {ended && !error && (
          <p role="status" className="mt-4 rounded-md bg-white/5 px-3 py-2 text-sm">
            {MESSAGES.sessionEnded}
          </p>
        )}
        {message && (
          <p role="alert" className="mt-4 rounded-md bg-red-500/10 px-3 py-2 text-sm">
            {message}
          </p>
        )}
        <label className="mt-4 block text-sm" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          maxLength={64}
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="mt-1 w-full rounded-md border border-white/15 bg-transparent px-3 py-2 focus:border-accent focus:outline-none"
        />
        <label className="mt-4 block text-sm" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          maxLength={1024}
          required
          ref={passwordField}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1 w-full rounded-md border border-white/15 bg-transparent px-3 py-2 focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || remaining > 0}
          className="mt-6 w-full rounded-md bg-accent px-3 py-2 font-semibold text-background disabled:opacity-50"
        >
          Log in
        </button>
      </form>
    </div>
  )
}
