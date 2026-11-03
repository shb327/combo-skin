/** The path to come back to after login, kept in the `next` query parameter of /login. */

export const LOGIN_PATH = '/login'

export function loginPath(next?: string): string {
  return next ? `${LOGIN_PATH}?next=${encodeURIComponent(next)}` : LOGIN_PATH
}

/** `next` if it is a path inside the app, other than /login; null otherwise. */
export function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return null
  const here = window.location.origin
  const url = new URL(next, here)
  if (url.origin !== here || url.pathname === LOGIN_PATH) return null
  return next
}
