/** Test helpers for "View in 3D": the browser features it checks, and a fake viewer that sends
 * the viewer's events to the page as `message` events from the open iframe. */
import { act, fireEvent, screen } from '@testing-library/react'
import { vi } from 'vitest'
import agentList from '@/data/agents.json'

export const VIEWER_ORIGIN = import.meta.env.VITE_VIEWER_ORIGIN

/** A browser with WebGL2: `getContext('webgl2')` gives a context that can be released. */
export function stubWebGL2() {
  const loseContext = vi.fn()
  const context = { getExtension: (name: string) => (name === 'WEBGL_lose_context' ? { loseContext } : null) }
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(((kind: string) => (kind === 'webgl2' ? context : null)) as never)
  return { getContext, loseContext }
}

/** `matchMedia` answering every query with `matches`, or each query as `matches` says. */
export function stubMatchMedia(matches: boolean | ((query: string) => boolean)) {
  const answer = typeof matches === 'function' ? matches : () => matches
  const matchMedia = vi.fn((query: string) => ({ matches: answer(query), media: query }) as MediaQueryList)
  vi.stubGlobal('matchMedia', matchMedia)
  return matchMedia
}

/** `navigator.connection.saveData`. */
export function stubDataSaver(saveData: boolean) {
  Object.defineProperty(navigator, 'connection', { value: { saveData }, configurable: true })
}

/** Full screen on elements, recording what was asked. `events: false` never fires
 * `fullscreenchange`, as a browser that has not drawn a frame yet. */
export function stubFullscreen({ events = true }: { events?: boolean } = {}) {
  Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true })
  const request = vi.fn(function (this: Element) {
    Object.defineProperty(document, 'fullscreenElement', { value: this, configurable: true })
    if (events) document.dispatchEvent(new Event('fullscreenchange'))
    return Promise.resolve()
  })
  const exit = vi.fn(() => {
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true })
    if (events) document.dispatchEvent(new Event('fullscreenchange'))
    return Promise.resolve()
  })
  Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { value: request, configurable: true })
  Object.defineProperty(document, 'exitFullscreen', { value: exit, configurable: true })
  return { request, exit }
}

/** Undoes `stubFullscreen` and `stubDataSaver`, which `vi.restoreAllMocks` does not. */
export function unstubBrowser() {
  for (const [target, names] of [
    [document, ['fullscreenEnabled', 'fullscreenElement', 'exitFullscreen']],
    [HTMLElement.prototype, ['requestFullscreen']],
    [navigator, ['connection']],
  ] as const) {
    for (const name of names) {
      if (Object.getOwnPropertyDescriptor(target, name)?.configurable) {
        delete (target as unknown as Record<string, unknown>)[name]
      }
    }
  }
}

export const frames = () => Array.from(document.querySelectorAll('iframe'))

/** The only iframe on the page. */
export function frame(): HTMLIFrameElement {
  const all = frames()
  if (all.length !== 1) throw new Error(`Expected one iframe, found ${all.length}`)
  return all[0]
}

/** A message to the page as if `source` (the open iframe's window by default) posted it. */
export function send(
  data: unknown,
  { origin = VIEWER_ORIGIN, source }: { origin?: string; source?: Window | null } = {},
) {
  const from = source === undefined ? frame().contentWindow : source
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data, origin, source: from }))
  })
}

export const ALL_FEATURES = ['attack', 'map', 'agents', 'input', 'keys', 'first-frame']
export const VERTIGO = { id: 'de_vertigo', name: 'Vertigo' }
/** Every agent of the website's list: the viewer has built them all. */
export const BUILT_AGENTS = agentList.agents.map((agent) => agent.def_index)
export const ALL_ACTIONS = ['inspect', 'light', 'heavy']

/** The viewer's usual events, with the URL's `id: null` unless another is given. */
export const viewer = {
  /** A protocol version 1 viewer. */
  ready: (webgl2 = true) => send({ type: 'cs3d:ready', version: 1, release: 'r1', webgl2 }),
  /** A version 2 viewer with every feature, Vertigo and every agent, unless `fields` say otherwise. */
  ready2: (fields: Record<string, unknown> = {}) =>
    send({
      type: 'cs3d:ready',
      version: 2,
      release: 'r2',
      webgl2: true,
      features: ALL_FEATURES,
      maps: [VERTIGO],
      defaultMap: 'de_vertigo',
      agents: BUILT_AGENTS,
      defaultAgent: 5404,
      ...fields,
    }),
  progress: (loaded: number, total: number, id: string | null = null) =>
    send({ type: 'cs3d:progress', id, loaded, total }),
  loaded: (id: string | null = null, fields: Record<string, unknown> = {}) =>
    send({ type: 'cs3d:loaded', id, combo: {}, view: 'fp', release: 'r1', ms: 2950, ...fields }),
  error: (
    code: string,
    retryable: boolean,
    message = 'From the viewer.',
    { id = null, kept }: { id?: string | null; kept?: boolean } = {},
  ) => send({ type: 'cs3d:error', id, code, message, retryable, ...(kept === undefined ? {} : { kept }) }),
  recovering: (id: string | null = null) => send({ type: 'cs3d:recovering', id, reason: 'context-lost', attempt: 1 }),
  key: (key = 'Escape', options?: Parameters<typeof send>[1]) => send({ type: 'cs3d:key', id: null, key }, options),
}

/** Records the messages the page posts to the open iframe, with their target origin. */
export function recordPosts() {
  const post = vi.spyOn(frame().contentWindow!, 'postMessage')
  const messages = () => post.mock.calls.map(([message]) => message as unknown as Record<string, unknown>)
  return {
    post,
    messages,
    targets: () => post.mock.calls.map((call) => call[1] as unknown as string),
    /** The last message of a type. */
    last: (type: string) => [...messages()].reverse().find((message) => message.type === type),
  }
}

/** The iframe's document finished loading. */
export function frameLoaded() {
  fireEvent.load(frame())
}

/** The "View in 3D" buttons on the page. */
export const viewButtons = () => screen.queryAllByRole('button', { name: 'View in 3D' })
