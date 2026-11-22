/** The only module that talks to the network. The site reads its published combos from static
 * data files on its own origin, deployed with it: `/data/<kind>/<type>/<finish>.json` (the
 * combos of one finish) and `/data/combo-counts.json`. GET requests without credentials, and
 * none outside `/data/` on the site's origin. */
import type { components } from './schema'

export type PublicCombo = components['schemas']['PublicCombo']
export type ComboItem = components['schemas']['Item']
export type ComboCounts = components['schemas']['ComboCounts']
export type Kind = 'gloves' | 'knives'

/** Why a request failed: no response, no such file, or any other answer. */
export class ApiError extends Error {
  readonly reason: 'network' | 'not_found' | 'http'

  constructor(reason: 'network' | 'not_found' | 'http') {
    super(`Data request failed: ${reason}`)
    this.name = 'ApiError'
    this.reason = reason
  }
}

/** A request that would leave the site's data files. Never sent. */
export class OutsideOriginError extends Error {
  constructor(url: string) {
    super(`Refused a request outside the site's data files: ${url}`)
    this.name = 'OutsideOriginError'
  }
}

export interface ApiOptions {
  /** The site's own origin, `window.location.origin` in the browser. */
  baseUrl: string
  /** For tests; the browser's `fetch` otherwise. */
  fetch?: (request: Request) => Promise<Response>
}

export interface Api {
  /** The published combos of one finish, best rated first. */
  finishCombos(kind: Kind, type: string, finish: string, signal?: AbortSignal): Promise<PublicCombo[]>
  /** The published combo count of every finish that has combos. */
  comboCounts(signal?: AbortSignal): Promise<ComboCounts>
}

/** A type or finish slug, as in the catalog and the site's URLs. */
const SLUG = /^[a-z0-9][a-z0-9-]*$/

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** `{type: {finish: n}}` with every n a whole number of at least 1. */
function isCountsOfKind(value: unknown): value is Record<string, Record<string, number>> {
  return (
    isObject(value) &&
    Object.values(value).every(
      (finishes) =>
        isObject(finishes) &&
        Object.values(finishes).every((n) => typeof n === 'number' && Number.isInteger(n) && n > 0),
    )
  )
}

export function createApi({ baseUrl, fetch: fetchImpl }: ApiOptions): Api {
  let origin: string
  try {
    origin = new URL(baseUrl).origin
  } catch {
    throw new Error(`The site's origin must be an origin: ${baseUrl}`)
  }
  if (origin !== baseUrl) throw new Error(`The site's origin must be an origin: ${baseUrl}`)
  const send = fetchImpl ?? ((request: Request) => fetch(request))
  const prefix = `${origin}/data/`

  /** GETs one data file and parses its JSON. Pages answers a file it does not have with the
   * app's HTML page and 200, so anything but JSON is `not_found` too. */
  async function read(path: string, signal?: AbortSignal): Promise<unknown> {
    const url = `${prefix}${path}`
    // The last check before the network.
    if (!url.startsWith(prefix) || new URL(url).origin !== origin) throw new OutsideOriginError(url)
    const request = new Request(url, { method: 'GET', credentials: 'omit', redirect: 'error', signal })
    let response: Response
    try {
      response = await send(request)
    } catch {
      throw new ApiError('network')
    }
    const type = (response.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase()
    if (response.status === 404 || (response.ok && type !== 'application/json')) {
      throw new ApiError('not_found')
    }
    if (!response.ok) throw new ApiError('http')
    try {
      return await response.json()
    } catch {
      throw new ApiError('http')
    }
  }

  return {
    async finishCombos(kind, type, finish, signal) {
      if (!SLUG.test(type) || !SLUG.test(finish)) throw new ApiError('not_found')
      const data = await read(`${kind}/${type}/${finish}.json`, signal)
      if (!Array.isArray(data)) throw new ApiError('http')
      return data as PublicCombo[]
    },

    async comboCounts(signal) {
      const data = await read('combo-counts.json', signal)
      if (!isObject(data) || !isCountsOfKind(data.gloves) || !isCountsOfKind(data.knives)) {
        throw new ApiError('http')
      }
      // Keys it does not know are kept, and ignored.
      return { ...data, gloves: data.gloves, knives: data.knives }
    },
  }
}
