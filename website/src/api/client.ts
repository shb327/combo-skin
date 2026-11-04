/** The only module that talks to the network. The site only reads the API's public combo routes
 * and combo counts: GET requests to the configured API origin, without credentials. */
import createClient from 'openapi-fetch'
import type { components, paths } from './schema'

export type PublicCombo = components['schemas']['PublicCombo']
export type ComboItem = components['schemas']['Item']
export type ComboCounts = components['schemas']['ComboCounts']
export type Kind = 'gloves' | 'knives'

/** Why a request failed: no response, a 404, or any other answer. */
export class ApiError extends Error {
  readonly reason: 'network' | 'not_found' | 'http'

  constructor(reason: 'network' | 'not_found' | 'http') {
    super(`API request failed: ${reason}`)
    this.name = 'ApiError'
    this.reason = reason
  }
}

/** A request that would leave the API origin. Never sent. */
export class OutsideOriginError extends Error {
  constructor(url: string) {
    super(`Refused a request outside the API origin: ${new URL(url).origin}`)
    this.name = 'OutsideOriginError'
  }
}

export interface ApiOptions {
  /** The API origin, already checked by `checkApiOrigin`. */
  baseUrl: string
  /** For tests; the browser's `fetch` otherwise. */
  fetch?: (request: Request) => Promise<Response>
}

export interface Api {
  /** The published combos of one finish, in the API's order. */
  finishCombos(kind: Kind, type: string, finish: string, signal?: AbortSignal): Promise<PublicCombo[]>
  /** The published combo count of every finish that has combos. */
  comboCounts(signal?: AbortSignal): Promise<ComboCounts>
}

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
  const send = fetchImpl ?? ((request: Request) => fetch(request))
  const client = createClient<paths>({
    baseUrl,
    credentials: 'omit',
    redirect: 'error',
    // The last check before the network.
    fetch: (request) => {
      if (!request.url.startsWith(`${baseUrl}/`)) throw new OutsideOriginError(request.url)
      return send(request)
    },
  })

  /** Sends one request; a failure without a response is a `network` error. */
  async function attempt<T>(request: () => Promise<T>): Promise<T> {
    try {
      return await request()
    } catch (failure) {
      if (failure instanceof OutsideOriginError) throw failure
      throw new ApiError('network')
    }
  }

  return {
    async finishCombos(kind, type, finish, signal) {
      const params = { path: { type_slug: type, finish_slug: finish } }
      const result: { data?: unknown; response: Response } = await attempt(() =>
        kind === 'gloves'
          ? client.GET('/gloves/{type_slug}/{finish_slug}/combos', { params, signal })
          : client.GET('/knives/{type_slug}/{finish_slug}/combos', { params, signal }),
      )
      if (result.response.status === 404) throw new ApiError('not_found')
      if (!result.response.ok || !Array.isArray(result.data)) throw new ApiError('http')
      return result.data as PublicCombo[]
    },

    async comboCounts(signal) {
      const result: { data?: unknown; response: Response } = await attempt(() =>
        client.GET('/combo-counts', { signal }),
      )
      if (result.response.status === 404) throw new ApiError('not_found')
      const data = result.data
      if (
        !result.response.ok ||
        !isObject(data) ||
        !isCountsOfKind(data.gloves) ||
        !isCountsOfKind(data.knives)
      ) {
        throw new ApiError('http')
      }
      return { gloves: data.gloves, knives: data.knives }
    },
  }
}
