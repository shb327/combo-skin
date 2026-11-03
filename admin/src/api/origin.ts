/** The API origin the app talks to, from VITE_API_BASE_URL. Used by vite.config.ts and tests. */

export const DEFAULT_API_ORIGIN = 'http://localhost:8000'

/** Returns the value if it is exactly an origin: http(s), a host, an optional port, and nothing
 * else. Plain http is allowed only for localhost. */
export function checkApiOrigin(value: string): string {
  const refuse = (why: string) =>
    new Error(`VITE_API_BASE_URL must be an origin such as https://api.example.com: ${why}`)
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw refuse('not a URL')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw refuse('use http or https')
  if (url.username || url.password) throw refuse('no user info')
  if (url.origin !== value) throw refuse('no path, trailing slash, query or fragment')
  if (url.protocol === 'http:' && url.hostname !== 'localhost') {
    throw refuse('plain http only for localhost')
  }
  return value
}

/** The configured origin, or the local API when the variable is unset or empty. */
export function apiOrigin(value: string | undefined): string {
  return value ? checkApiOrigin(value) : DEFAULT_API_ORIGIN
}
