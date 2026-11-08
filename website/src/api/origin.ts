/** The origins the site talks to: the API, from VITE_API_BASE_URL, the screenshot image
 * host, from VITE_IMAGE_ORIGIN, and the 3D viewer, from VITE_VIEWER_ORIGIN. Used by vite.config.ts and tests. The same rules as the admin
 * dashboard's (admin/src/api/origin.ts). */

export const DEFAULT_API_ORIGIN = 'http://localhost:8000'
/** The local storage service of the Compose stack. */
export const DEFAULT_IMAGE_ORIGIN = 'http://localhost:9000'
/** The viewer's local production build (`vite preview` in the viewer project). */
export const DEFAULT_VIEWER_ORIGIN = 'http://127.0.0.1:5321'

/** Returns the value if it is exactly an origin: http(s), a host, an optional port, and nothing
 * else. Plain http is allowed only for the hosts in `httpHosts` (localhost by default). Errors
 * name the variable. */
export function checkOrigin(
  name: string,
  example: string,
  value: string,
  httpHosts: readonly string[] = ['localhost'],
): string {
  const refuse = (why: string) => new Error(`${name} must be an origin such as ${example}: ${why}`)
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw refuse('not a URL')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw refuse('use http or https')
  if (url.username || url.password) throw refuse('no user info')
  if (url.origin !== value) throw refuse('no path, trailing slash, query or fragment')
  if (url.protocol === 'http:' && !httpHosts.includes(url.hostname)) {
    throw refuse(`plain http only for ${httpHosts.join(' and ')}`)
  }
  return value
}

export function checkApiOrigin(value: string): string {
  return checkOrigin('VITE_API_BASE_URL', 'https://api.example.com', value)
}

export function checkImageOrigin(value: string): string {
  return checkOrigin('VITE_IMAGE_ORIGIN', 'https://images.example.com', value)
}

/** The viewer also runs locally on 127.0.0.1, its own preview address. */
export function checkViewerOrigin(value: string): string {
  return checkOrigin('VITE_VIEWER_ORIGIN', 'https://viewer.example.com', value, ['localhost', '127.0.0.1'])
}

/** The configured origin, or the local API when the variable is unset or empty. */
export function apiOrigin(value: string | undefined): string {
  return value ? checkApiOrigin(value) : DEFAULT_API_ORIGIN
}

/** The configured screenshot origin, or the local storage service when unset or empty. */
export function imageOrigin(value: string | undefined): string {
  return value ? checkImageOrigin(value) : DEFAULT_IMAGE_ORIGIN
}

/** The configured viewer origin, or the local viewer when unset or empty. */
export function viewerOrigin(value: string | undefined): string {
  return value ? checkViewerOrigin(value) : DEFAULT_VIEWER_ORIGIN
}
