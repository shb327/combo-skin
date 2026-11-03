import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { errorMessage } from '../api/errors'
import { LOGIN_PATH } from '../auth/returnPath'
import { useSession } from '../auth/useSession'
import logo from '../logo.svg'

const SECTIONS = [
  { to: '/', label: 'Home', end: true },
  { to: '/gloves', label: 'By gloves', end: false },
  { to: '/knives', label: 'By knife', end: false },
]

export function Layout() {
  const { state, logout } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPath, setMenuPath] = useState(location.pathname)
  if (menuPath !== location.pathname) {
    // Close the small-screen menu after navigating.
    setMenuPath(location.pathname)
    setMenuOpen(false)
  }
  const username = state.status === 'active' ? state.session.admin.username : ''

  async function onLogout() {
    setBusy(true)
    setError(null)
    try {
      await logout()
      navigate(LOGIN_PATH, { replace: true })
    } catch (failure) {
      setError(errorMessage(failure))
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/10 px-4 py-3">
        <button
          type="button"
          className="rounded-md border border-white/15 px-2 py-1 text-sm whitespace-nowrap md:hidden"
          aria-expanded={menuOpen}
          aria-controls="sections"
          onClick={() => setMenuOpen((open) => !open)}
        >
          Menu
        </button>
        <img src={logo} alt="Combo Skin" className="h-6 w-auto" />
        <span className="text-sm font-semibold tracking-widest uppercase">Admin</span>
        {/* Below 640 px the username takes its own line under the others. */}
        <span className="order-last w-full truncate text-sm text-white/70 sm:order-none sm:ml-auto sm:w-auto">
          {username}
        </span>
        <button
          type="button"
          className="ml-auto rounded-md border border-white/15 px-3 py-1 text-sm whitespace-nowrap hover:border-accent disabled:opacity-50 sm:ml-0"
          onClick={onLogout}
          disabled={busy}
        >
          Log out
        </button>
      </header>
      {error && (
        <p role="alert" className="border-b border-red-500/40 bg-red-500/10 px-4 py-2 text-sm">
          {error}
        </p>
      )}
      <div className="flex flex-1 flex-col md:flex-row">
        <nav
          id="sections"
          aria-label="Sections"
          className={`${menuOpen ? 'block' : 'hidden'} border-b border-white/10 p-3 md:block md:w-52 md:border-r md:border-b-0`}
        >
          <ul className="flex flex-col gap-1">
            {SECTIONS.map((section) => (
              <li key={section.to}>
                <NavLink
                  to={section.to}
                  end={section.end}
                  className={({ isActive }) =>
                    `block rounded-md px-3 py-2 ${isActive ? 'bg-white/10 text-accent' : 'hover:bg-white/5'}`
                  }
                >
                  {section.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <main className="min-w-0 flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
