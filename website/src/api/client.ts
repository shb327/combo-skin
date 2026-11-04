/** The only module that talks to the network. The site only reads the API's public combo routes:
 * GET requests to the configured API origin, without credentials. */
import createClient from 'openapi-fetch'
import type { components, paths } from './schema'

export type PublicCombo = components['schemas']['PublicCombo']
export type ComboItem = components['schemas']['Item']
export type Kind = 'gloves' | 'knives'

/** Why a request failed: no response, a 404 for the finish, or any other answer. */
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

  return {
    async finishCombos(kind, type, finish, signal) {
      const params = { path: { type_slug: type, finish_slug: finish } }
      let result: { data?: unknown; response: Response }
      try {
        result =
          kind === 'gloves'
            ? await client.GET('/gloves/{type_slug}/{finish_slug}/combos', { params, signal })
            : await client.GET('/knives/{type_slug}/{finish_slug}/combos', { params, signal })
      } catch (failure) {
        if (failure instanceof OutsideOriginError) throw failure
        throw new ApiError('network')
      }
      if (result.response.status === 404) throw new ApiError('not_found')
      if (!result.response.ok || !Array.isArray(result.data)) throw new ApiError('http')
      return result.data as PublicCombo[]
    },
  }
}
