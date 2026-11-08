/** Test helpers for "View in 3D": the browser features it checks, and a fake viewer that sends
 * the viewer's events to the page as `message` events from the open iframe. */
import { act, fireEvent, screen } from '@testing-library/react'
import { vi } from 'vitest'

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

/** `matchMedia` answering every query with `matches`. */
export function stubMatchMedia(matches: boolean) {
  const matchMedia = vi.fn((query: string) => ({ matches, media: query }) as MediaQueryList)
  vi.stubGlobal('matchMedia', matchMedia)
  return matchMedia
}

/** `navigator.connection.saveData`. */
export function stubDataSaver(saveData: boolean) {
  Object.defineProperty(navigator, 'connection', { value: { saveData }, configurable: true })
}

/** Full screen on elements, recording what was asked. */
export function stubFullscreen() {
  Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true })
  const request = vi.fn(function (this: Element) {
    Object.defineProperty(document, 'fullscreenElement', { value: this, configurable: true })
    document.dispatchEvent(new Event('fullscreenchange'))
    return Promise.resolve()
  })
  const exit = vi.fn(() => {
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true })
    document.dispatchEvent(new Event('fullscreenchange'))
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

/** The viewer's usual events, with the URL's `id: null`. */
export const viewer = {
  ready: (webgl2 = true) => send({ type: 'cs3d:ready', version: 1, release: 'r1', webgl2 }),
  progress: (loaded: number, total: number, id: string | null = null) =>
    send({ type: 'cs3d:progress', id, loaded, total }),
  loaded: (id: string | null = null) => send({ type: 'cs3d:loaded', id, combo: {}, view: 'fp', release: 'r1', ms: 2950 }),
  error: (code: string, retryable: boolean, message = 'From the viewer.') =>
    send({ type: 'cs3d:error', id: null, code, message, retryable }),
  recovering: () => send({ type: 'cs3d:recovering', id: null, reason: 'context-lost', attempt: 1 }),
}

/** The iframe's document finished loading. */
export function frameLoaded() {
  fireEvent.load(frame())
}

/** The "View in 3D" buttons on the page. */
export const viewButtons = () => screen.queryAllByRole('button', { name: 'View in 3D' })
