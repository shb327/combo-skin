/** A fake of the API for tests: a `fetch` function that records every request and answers from a
 * queue, from the combos set for a path, or with the counts set for `/combo-counts`. Bodies are typed from the generated schema. */
import type { components } from '../api/schema'

type Item = components['schemas']['Item']
type PublicCombo = components['schemas']['PublicCombo']
type ComboCounts = components['schemas']['ComboCounts']

export const ORIGIN = 'http://localhost:8000'
export const COUNTS_PATH = '/combo-counts'
const IMAGE = 'https://community.akamai.steamstatic.com/economy/image'

export interface Recorded {
  url: string
  method: string
  credentials: RequestCredentials
  redirect: RequestRedirect
}

/** A queued answer: a response, one still to come, or `'network-error'` for a request that never
 * gets one. */
export type Reply = Response | Promise<Response> | 'network-error'

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const notFound = () => json({ detail: 'Not Found' }, 404)

/** A reply that waits until `resolve` is called. */
export function deferred(): { reply: Promise<Response>; resolve: (response: Response) => void } {
  let resolve!: (response: Response) => void
  const reply = new Promise<Response>((done) => {
    resolve = done
  })
  return { reply, resolve }
}

export interface FakeApi {
  fetch: (request: Request) => Promise<Response>
  requests: Recorded[]
  /** Each request's abort signal, in the order of `requests`. */
  signals: AbortSignal[]
  /** Answers for the next requests, in order, before any `combos` set for their path. */
  reply(...replies: Reply[]): void
  /** The combos every later request for this path gets, e.g. `/gloves/specialist/mogul/combos`. */
  combos(path: string, combos: PublicCombo[]): void
  /** The body every later `/combo-counts` request gets. */
  counts(counts: ComboCounts): void
}

export function fakeApi(): FakeApi {
  const requests: Recorded[] = []
  const signals: AbortSignal[] = []
  const queue: Reply[] = []
  const byPath = new Map<string, PublicCombo[]>()
  let countsBody: ComboCounts | undefined

  return {
    requests,
    signals,
    reply: (...replies) => queue.push(...replies),
    combos: (path, combos) => byPath.set(path, combos),
    counts: (counts) => {
      countsBody = counts
    },
    async fetch(request) {
      const { url, method, credentials, redirect } = request
      requests.push({ url, method, credentials, redirect })
      signals.push(request.signal)
      const next = queue.shift()
      if (next === 'network-error') throw new TypeError('Failed to fetch')
      if (next) return next
      const { pathname } = new URL(url)
      if (pathname === COUNTS_PATH && countsBody) return json(countsBody)
      const combos = byPath.get(pathname)
      return combos ? json(combos) : notFound()
    },
  }
}

export function item(overrides: Partial<Item> & Pick<Item, 'type_slug' | 'finish_slug'>): Item {
  return {
    type_name: overrides.type_slug,
    display_name: overrides.finish_slug,
    image_url: `${IMAGE}/${overrides.type_slug}-${overrides.finish_slug}`,
    rarity: { code: 'rarity_ancient_weapon', name: 'Covert', color: '#eb4b4b' },
    active: true,
    float_min: 0,
    float_max: 1,
    float_from: null,
    float_to: null,
    seeds: [],
    ...overrides,
  }
}

export const MOGUL = item({
  type_slug: 'specialist',
  type_name: 'Specialist Gloves',
  finish_slug: 'mogul',
  display_name: 'Mogul',
  float_min: 0.06,
  float_max: 0.8,
})

export const KARAMBIT_RUBY = item({
  type_slug: 'karambit',
  type_name: 'Karambit',
  finish_slug: 'doppler-ruby',
  display_name: 'Doppler (Ruby)',
  float_max: 0.08,
})

export function combo(
  id: string,
  rating: number,
  glove: Item,
  knife: Item,
  description: string | null = null,
): PublicCombo {
  return { id, rating, description, glove, knife }
}

/** `count` combos of one finish, for pages that only need their number. */
export function combosOf(glove: Item, count: number): PublicCombo[] {
  return Array.from({ length: count }, (_, index) =>
    combo(`c${index}`, 9, glove, item({ type_slug: 'karambit', finish_slug: `finish-${index}` })),
  )
}
