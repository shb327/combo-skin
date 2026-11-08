import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApi } from '@/api/client'
import { createQueryClient } from '@/api/queries'
import { ComboPictures } from '@/components/ComboPictures'
import { Providers } from '@/Providers'
import { KARAMBIT_RUBY, MOGUL, ORIGIN, combo, fakeApi, item, screenshotOf } from '@/test/fakeApi'
import { renderSite } from '@/test/render'
import {
  VIEWER_ORIGIN,
  frame,
  frameLoaded,
  frames,
  send,
  stubDataSaver,
  stubFullscreen,
  stubMatchMedia,
  stubWebGL2,
  viewButtons,
  viewer,
} from '@/test/viewer'
import { viewerUrl } from './params'
import { READY_MS, STALL_MS } from './messages'

const PATH = '/gloves/specialist/mogul/combos'
const OTHER_PATH = '/gloves/specialist/crimson-kimono/combos'

const M9 = item({
  type_slug: 'm9-bayonet',
  type_name: 'M9 Bayonet',
  finish_slug: 'urban-masked',
  display_name: 'Urban Masked',
  def_index: 508,
  paint_index: 143,
})
const RUBY = { ...KARAMBIT_RUBY, def_index: 507, paint_index: 415 }
const GLOVES = { ...MOGUL, def_index: 5034, paint_index: 10064 }
const A = combo('a', 9.5, GLOVES, RUBY, null, screenshotOf('a'))
const B = combo('b', 8, GLOVES, M9, null, screenshotOf('b'))

async function site(combos = [A, B]) {
  const api = fakeApi()
  api.combos(PATH, combos)
  const result = renderSite(PATH, { api })
  await screen.findAllByRole('article')
  return result
}

const card = (id: 'a' | 'b') => screen.getAllByRole('article')[id === 'a' ? 0 : 1]
const inCard = (id: 'a' | 'b') => within(card(id))
/** Text shown on the card, not its copy in the screen reader announcement. */
const VISIBLE = { ignore: '.sr-only, script, style' }
const screenshotIn = (id: 'a' | 'b') => card(id).querySelector('img[srcset]')

async function open(id: 'a' | 'b' = 'a') {
  await userEvent.click(inCard(id).getByRole('button', { name: 'View in 3D' }))
}

afterEach(() => {
  vi.useRealTimers()
})

describe('the button', () => {
  it('shows on every card with WebGL2, top right in the card box, and nothing loads before a click', async () => {
    stubWebGL2()
    const postMessage = vi.spyOn(window, 'postMessage')
    await site()
    expect(viewButtons()).toHaveLength(2)
    const button = inCard('a').getByRole('button', { name: 'View in 3D' })
    expect(button).toHaveAccessibleDescription('Specialist Gloves | Mogul with Karambit | Doppler (Ruby)')
    expect(button.parentElement).toHaveClass('absolute', 'top-2', 'right-2')
    expect(button).toHaveClass('text-white/60')
    expect(frames()).toHaveLength(0)
    expect(document.body.innerHTML).not.toContain(VIEWER_ORIGIN)
    expect(postMessage).not.toHaveBeenCalled()
  })

  it('does not show without WebGL2', async () => {
    await site()
    expect(viewButtons()).toHaveLength(0)
  })
})

describe('opening a view', () => {
  it('adds one sandboxed iframe for the combo, with focus on close and the screenshot on top', async () => {
    stubWebGL2()
    await site()
    await open('a')
    const iframe = frame()
    expect(card('a')).toContainElement(iframe)
    expect(iframe.getAttribute('src')).toBe(viewerUrl(VIEWER_ORIGIN, A))
    expect(iframe).toHaveAttribute('title', 'Specialist Gloves | Mogul with Karambit | Doppler (Ruby) in 3D')
    expect(iframe).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin')
    expect(iframe).not.toHaveAttribute('referrerpolicy')
    expect(iframe).not.toHaveAttribute('allow')
    expect(inCard('a').getByRole('button', { name: 'Close 3D view' })).toHaveFocus()
    expect(screenshotIn('a')).toBeInTheDocument()
    expect(inCard('a').getByText('Loading 3D view…')).toBeInTheDocument()
    expect(inCard('a').getByRole('status')).toHaveTextContent('Loading 3D view')
    expect(inCard('a').queryByRole('button', { name: 'View in 3D' })).toBeNull()
  })

  it('shows progress, then the view, and calls the hook once', async () => {
    stubWebGL2()
    const onLoaded = vi.fn()
    const api = fakeApi()
    render(
      <Providers api={createApi({ baseUrl: ORIGIN, fetch: api.fetch })} queryClient={createQueryClient()}>
        <ComboPictures combo={A} onLoaded={onLoaded} />
      </Providers>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'View in 3D' }))
    viewer.ready()
    viewer.progress(3, 10)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '30')
    viewer.loaded()
    expect(document.querySelector('img[srcset]')).toBeNull()
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('3D view ready')
    expect(onLoaded).toHaveBeenCalledTimes(1)
    expect(onLoaded).toHaveBeenCalledWith({ comboId: 'a', ms: 2950 })
    viewer.loaded()
    expect(onLoaded).toHaveBeenCalledTimes(1)
  })

  it('starts the handshake on load, posting to the viewer origin only', async () => {
    stubWebGL2()
    await site()
    await open('a')
    const post = vi.spyOn(frame().contentWindow!, 'postMessage')
    frameLoaded()
    expect(post).toHaveBeenCalledTimes(1)
    const [message, target] = post.mock.calls[0] as unknown as [{ type: string; id: string }, string]
    expect(message.type).toBe('cs3d:getState')
    expect(message.id).toMatch(/\S{16,}/)
    expect(target).toBe(VIEWER_ORIGIN)
    // A reply with that id is accepted.
    send({ type: 'cs3d:progress', id: message.id, loaded: 1, total: 4 })
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25')
  })
})

describe('events the page ignores', () => {
  it.each([
    ['another origin', () => send({ type: 'cs3d:loaded', id: null, ms: 1 }, { origin: 'https://evil.example.com' })],
    ['another window', () => send({ type: 'cs3d:loaded', id: null, ms: 1 }, { source: window })],
    ['an unknown id', () => send({ type: 'cs3d:loaded', id: 'someone-else', ms: 1 })],
    ['a string', () => send('cs3d:loaded')],
    ['no type', () => send({ id: null, ms: 1 })],
    ['an unknown type', () => send({ type: 'cs3d:captured', id: null })],
    ['an error from another origin', () => send({ type: 'cs3d:error', id: null, code: 'bad-params', retryable: false }, { origin: 'http://localhost:9999' })],
  ])('from %s', async (_, event) => {
    stubWebGL2()
    await site()
    await open('a')
    viewer.progress(2, 10)
    event()
    expect(screenshotIn('a')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '20')
    expect(frames()).toHaveLength(1)
  })

  it('ignores progress after the combo is drawn', async () => {
    stubWebGL2()
    await site()
    await open('a')
    viewer.loaded()
    viewer.progress(1, 10)
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screenshotIn('a')).toBeNull()
  })
})

describe('closing', () => {
  it('removes the iframe after pointing it at about:blank, and returns focus', async () => {
    stubWebGL2()
    await site()
    await open('a')
    const iframe = frame()
    viewer.loaded()
    await userEvent.click(inCard('a').getByRole('button', { name: 'Close 3D view' }))
    expect(iframe.getAttribute('src')).toBe('about:blank')
    expect(frames()).toHaveLength(0)
    expect(screenshotIn('a')).toBeInTheDocument()
    expect(inCard('a').getByRole('button', { name: 'View in 3D' })).toHaveFocus()
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'cs3d:error', id: null, code: 'context-lost', retryable: true },
          origin: VIEWER_ORIGIN,
          source: iframe.contentWindow,
        }),
      )
    })
    expect(screen.queryByText(/graphics card/)).toBeNull()
  })

  it('points the iframe at about:blank while it is still in the page', async () => {
    stubWebGL2()
    await site()
    await open('a')
    const iframe = frame()
    const connectedWhenBlanked: boolean[] = []
    const setter = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src')!.set!
    Object.defineProperty(iframe, 'src', {
      configurable: true,
      get: () => iframe.getAttribute('src') ?? '',
      set(value: string) {
        if (value === 'about:blank') connectedWhenBlanked.push(iframe.isConnected)
        setter.call(iframe, value)
      },
    })
    await userEvent.click(inCard('a').getByRole('button', { name: 'Close 3D view' }))
    expect(connectedWhenBlanked).toEqual([true])
    expect(iframe.isConnected).toBe(false)
  })

  it('keeps the same viewer when the combo is fetched again while open', async () => {
    stubWebGL2()
    const api = fakeApi()
    const queryClient = createQueryClient()
    const props = { api: createApi({ baseUrl: ORIGIN, fetch: api.fetch }), queryClient }
    const { rerender } = render(
      <Providers {...props}>
        <ComboPictures combo={A} />
      </Providers>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'View in 3D' }))
    const iframe = frame()
    const src = iframe.getAttribute('src')
    viewer.loaded()
    const changed = combo('a', 9.5, { ...GLOVES, seeds: [700] }, RUBY, null, screenshotOf('a'))
    rerender(
      <Providers {...props}>
        <ComboPictures combo={changed} />
      </Providers>,
    )
    expect(frame()).toBe(iframe)
    expect(iframe.getAttribute('src')).toBe(src)
  })

  it('closes on Escape from its controls', async () => {
    stubWebGL2()
    await site()
    await open('a')
    await userEvent.keyboard('{Escape}')
    expect(frames()).toHaveLength(0)
    expect(inCard('a').getByRole('button', { name: 'View in 3D' })).toHaveFocus()
  })

  it('keeps one view on the page: opening another card closes the first', async () => {
    stubWebGL2()
    await site()
    await open('a')
    const first = frame()
    await open('b')
    expect(frames()).toHaveLength(1)
    expect(first.isConnected).toBe(false)
    expect(card('b')).toContainElement(frame())
    expect(inCard('b').getByRole('button', { name: 'Close 3D view' })).toHaveFocus()
    expect(inCard('a').getByRole('button', { name: 'View in 3D' })).toBeInTheDocument()
  })

  it('closes when the visitor goes to another finish', async () => {
    stubWebGL2()
    const api = fakeApi()
    api.combos(PATH, [A, B])
    api.combos(OTHER_PATH, [])
    const { navigate } = renderSite(PATH, { api })
    await screen.findAllByRole('article')
    await open('a')
    expect(frames()).toHaveLength(1)
    act(() => navigate(OTHER_PATH))
    expect(frames()).toHaveLength(0)
    act(() => navigate(PATH))
    await screen.findAllByRole('article')
    expect(frames()).toHaveLength(0)
    expect(viewButtons()).toHaveLength(2)
  })

  it('offers full screen on the box when the browser allows it', async () => {
    stubWebGL2()
    const { request, exit } = stubFullscreen()
    await site()
    await open('a')
    await userEvent.click(inCard('a').getByRole('button', { name: 'Full screen' }))
    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.contexts[0]).toBe(frame().parentElement)
    await userEvent.click(inCard('a').getByRole('button', { name: 'Exit full screen' }))
    expect(exit).toHaveBeenCalledTimes(1)
  })

  it('leaves full screen by what the document says, even before the change event', async () => {
    stubWebGL2()
    const { request, exit } = stubFullscreen({ events: false })
    await site()
    await open('a')
    await userEvent.click(inCard('a').getByRole('button', { name: 'Full screen' }))
    expect(request).toHaveBeenCalledTimes(1)
    await userEvent.click(await inCard('a').findByRole('button', { name: 'Exit full screen' }))
    expect(exit).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('stays as it is when the browser refuses full screen', async () => {
    stubWebGL2()
    const { request } = stubFullscreen()
    request.mockImplementation(() => Promise.reject(new TypeError('Permissions check failed')))
    await site()
    await open('a')
    await userEvent.click(inCard('a').getByRole('button', { name: 'Full screen' }))
    await act(() => Promise.resolve())
    expect(inCard('a').getByRole('button', { name: 'Full screen' })).toBeInTheDocument()
    expect(frames()).toHaveLength(1)
  })

  it('has no full-screen control where the browser has none', async () => {
    stubWebGL2()
    await site()
    await open('a')
    expect(inCard('a').queryByRole('button', { name: 'Full screen' })).toBeNull()
  })
})

describe('phones and small screens', () => {
  it('warns about the download once per visit, and loads nothing before Load 3D view', async () => {
    stubWebGL2()
    stubMatchMedia(true)
    await site()
    await open('a')
    expect(inCard('a').getByText('The 3D view downloads about 34 MB.')).toBeInTheDocument()
    expect(frames()).toHaveLength(0)
    expect(inCard('a').getByRole('button', { name: 'Load 3D view' })).toHaveFocus()
    await userEvent.click(inCard('a').getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('The 3D view downloads about 34 MB.')).toBeNull()
    expect(inCard('a').getByRole('button', { name: 'View in 3D' })).toHaveFocus()
    await open('a')
    await userEvent.click(inCard('a').getByRole('button', { name: 'Load 3D view' }))
    expect(frames()).toHaveLength(1)
    await open('b')
    expect(screen.queryByText('The 3D view downloads about 34 MB.')).toBeNull()
    expect(card('b')).toContainElement(frame())
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    expect(document.cookie).toBe('')
  })

  it('warns on a wide screen when the browser asks to save data', async () => {
    stubWebGL2()
    stubMatchMedia(false)
    stubDataSaver(true)
    await site()
    await open('a')
    expect(inCard('a').getByText('The 3D view downloads about 34 MB.')).toBeInTheDocument()
    expect(frames()).toHaveLength(0)
    await userEvent.click(inCard('a').getByRole('button', { name: 'Cancel' }))
    expect(frames()).toHaveLength(0)
    await open('a')
    await userEvent.click(inCard('a').getByRole('button', { name: 'Load 3D view' }))
    expect(frames()).toHaveLength(1)
    await open('b')
    expect(screen.queryByText('The 3D view downloads about 34 MB.')).toBeNull()
    expect(card('b')).toContainElement(frame())
  })

  it('remembers the visit on other finish pages: the warning, no WebGL2, combos it cannot draw', async () => {
    stubWebGL2()
    stubMatchMedia(true)
    const C = combo('c', 7, { ...KARAMBIT_RUBY, type_slug: 'specialist', type_name: 'Specialist Gloves', finish_slug: 'crimson-kimono', display_name: 'Crimson Kimono', def_index: 5034, paint_index: 10033 }, RUBY, null, screenshotOf('c'))
    const api = fakeApi()
    api.combos(PATH, [A, B])
    api.combos(OTHER_PATH, [C])
    const { navigate } = renderSite(PATH, { api })
    await screen.findAllByRole('article')
    // Accept the download once, and learn that combo b cannot be drawn.
    await open('a')
    await userEvent.click(inCard('a').getByRole('button', { name: 'Load 3D view' }))
    await open('b')
    viewer.error('unknown-knife-finish', false)
    act(() => navigate(OTHER_PATH))
    await screen.findByRole('button', { name: 'View in 3D' })
    await userEvent.click(screen.getByRole('button', { name: 'View in 3D' }))
    expect(screen.queryByText('The 3D view downloads about 34 MB.')).toBeNull()
    expect(frames()).toHaveLength(1)
    viewer.error('no-webgl2', false)
    act(() => navigate(PATH))
    await screen.findAllByRole('article')
    expect(viewButtons()).toHaveLength(0)
  })

  it('remembers on other pages which combos cannot be drawn', async () => {
    stubWebGL2()
    const api = fakeApi()
    api.combos(PATH, [A, B])
    api.combos(OTHER_PATH, [])
    const { navigate } = renderSite(PATH, { api })
    await screen.findAllByRole('article')
    await open('b')
    viewer.error('bad-params', false)
    act(() => navigate(OTHER_PATH))
    act(() => navigate(PATH))
    await screen.findAllByRole('article')
    expect(inCard('a').getByRole('button', { name: 'View in 3D' })).toBeInTheDocument()
    expect(inCard('b').queryByRole('button', { name: 'View in 3D' })).toBeNull()
  })

  it('does not warn on a wide screen with a mouse', async () => {
    stubWebGL2()
    stubMatchMedia(false)
    await site()
    await open('a')
    expect(frames()).toHaveLength(1)
  })
})

describe('errors', () => {
  it.each([
    ['assets-unavailable', 'The 3D view could not be loaded.'],
    ['context-lost', 'Your graphics card stopped the 3D view.'],
  ])('%s shows the screenshot, its text and Try again, which opens a new iframe', async (code, text) => {
    stubWebGL2()
    await site()
    await open('a')
    const first = frame()
    viewer.ready()
    viewer.error(code, true)
    expect(frames()).toHaveLength(0)
    expect(screenshotIn('a')).toBeInTheDocument()
    expect(inCard('a').getByText(text, VISIBLE)).toBeInTheDocument()
    expect(inCard('a').getByRole('status')).toHaveTextContent(text)
    expect(inCard('a').getByRole('button', { name: 'Try again' })).toHaveFocus()
    await userEvent.click(inCard('a').getByRole('button', { name: 'Try again' }))
    expect(frames()).toHaveLength(1)
    expect(frame()).not.toBe(first)
    expect(screen.queryByText(text, VISIBLE)).toBeNull()
  })

  it.each(['bad-params', 'unknown-knife', 'unknown-gloves', 'unknown-knife-finish', 'unknown-gloves-finish'])(
    '%s says the combo cannot be shown and hides only that card’s button',
    async (code) => {
      stubWebGL2()
      await site()
      await open('a')
      viewer.error(code, false)
      expect(inCard('a').getByText("This combo can't be shown in 3D.", VISIBLE)).toBeInTheDocument()
      expect(inCard('a').queryByRole('button', { name: 'Try again' })).toBeNull()
      await userEvent.click(inCard('a').getByRole('button', { name: 'Dismiss' }))
      expect(inCard('a').queryByRole('button', { name: 'View in 3D' })).toBeNull()
      expect(inCard('b').getByRole('button', { name: 'View in 3D' })).toBeInTheDocument()
      // The button is gone: focus stays in the card's box instead of falling to the page.
      expect(document.activeElement).not.toBe(document.body)
      expect(card('a')).toContainElement(document.activeElement as HTMLElement)
    },
  )

  it('treats an unknown code by its retryable flag', async () => {
    stubWebGL2()
    await site()
    await open('a')
    viewer.error('something-new', true)
    expect(inCard('a').getByText('The 3D view could not be loaded.', VISIBLE)).toBeInTheDocument()
    expect(inCard('a').getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('never shows the viewer’s own message', async () => {
    stubWebGL2()
    await site()
    await open('a')
    viewer.error('assets-unavailable', true, '<b>x</b> from the viewer')
    expect(document.body.textContent).not.toContain('from the viewer')
    expect(document.querySelector('b')).toBeNull()
  })

  it.each([
    ['cs3d:error no-webgl2', () => viewer.error('no-webgl2', false)],
    ['cs3d:ready without WebGL2', () => viewer.ready(false)],
  ])('%s hides every card’s button', async (_, event) => {
    stubWebGL2()
    await site()
    await open('a')
    event()
    expect(inCard('a').getByText("3D isn't available in this browser.", VISIBLE)).toBeInTheDocument()
    expect(frames()).toHaveLength(0)
    expect(viewButtons()).toHaveLength(0)
    await userEvent.click(inCard('a').getByRole('button', { name: 'Dismiss' }))
    expect(viewButtons()).toHaveLength(0)
  })
})

describe('time limits', () => {
  it('fails when the viewer never answers', async () => {
    stubWebGL2()
    await site()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fireEvent.click(inCard('a').getByRole('button', { name: 'View in 3D' }))
    const iframe = frame()
    act(() => vi.advanceTimersByTime(READY_MS - 1))
    expect(frames()).toHaveLength(1)
    act(() => vi.advanceTimersByTime(1))
    expect(frames()).toHaveLength(0)
    expect(inCard('a').getByText('The 3D view could not be loaded.', VISIBLE)).toBeInTheDocument()
    expect(inCard('a').getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'cs3d:loaded', id: null, ms: 1 },
          origin: VIEWER_ORIGIN,
          source: iframe.contentWindow,
        }),
      )
    })
    expect(inCard('a').getByText('The 3D view could not be loaded.', VISIBLE)).toBeInTheDocument()
  })

  it.each([
    ['a handshake reply', () => send({ type: 'cs3d:state', id: null, status: 'loading' })],
    ['a progress event', () => viewer.progress(1, 10)],
  ])('still fails at 15 s without cs3d:ready, after %s', async (_, event) => {
    stubWebGL2()
    await site()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fireEvent.click(inCard('a').getByRole('button', { name: 'View in 3D' }))
    act(() => vi.advanceTimersByTime(5_000))
    event()
    act(() => vi.advanceTimersByTime(READY_MS - 5_000))
    expect(frames()).toHaveLength(0)
    expect(inCard('a').getByText('The 3D view could not be loaded.', VISIBLE)).toBeInTheDocument()
  })

  it('fails when loading stalls after the viewer answered', async () => {
    stubWebGL2()
    await site()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fireEvent.click(inCard('a').getByRole('button', { name: 'View in 3D' }))
    viewer.ready()
    act(() => vi.advanceTimersByTime(STALL_MS - 1))
    viewer.progress(5, 10)
    act(() => vi.advanceTimersByTime(STALL_MS - 1))
    expect(frames()).toHaveLength(1)
    act(() => vi.advanceTimersByTime(1))
    expect(frames()).toHaveLength(0)
    expect(inCard('a').getByText('The 3D view could not be loaded.', VISIBLE)).toBeInTheDocument()
  })

  it('has no time limit once the combo is drawn, even after late events', async () => {
    stubWebGL2()
    await site()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fireEvent.click(inCard('a').getByRole('button', { name: 'View in 3D' }))
    viewer.ready()
    viewer.loaded()
    viewer.progress(10, 10)
    send({ type: 'cs3d:state', id: null, status: 'loaded' })
    viewer.ready()
    act(() => vi.advanceTimersByTime(STALL_MS * 10))
    expect(frames()).toHaveLength(1)
    expect(screen.queryByText('The 3D view could not be loaded.', VISIBLE)).toBeNull()
  })

  it('times a recovery like a load', async () => {
    stubWebGL2()
    await site()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fireEvent.click(inCard('a').getByRole('button', { name: 'View in 3D' }))
    viewer.ready()
    viewer.loaded()
    viewer.recovering()
    act(() => vi.advanceTimersByTime(STALL_MS))
    expect(frames()).toHaveLength(0)
    expect(inCard('a').getByText('The 3D view could not be loaded.', VISIBLE)).toBeInTheDocument()
  })

  it('puts the screenshot back while the viewer recovers a lost GPU context', async () => {
    stubWebGL2()
    await site()
    await open('a')
    viewer.loaded()
    expect(screenshotIn('a')).toBeNull()
    viewer.recovering()
    expect(screenshotIn('a')).toBeInTheDocument()
    expect(inCard('a').getByText('Loading 3D view…')).toBeInTheDocument()
    viewer.loaded()
    expect(screenshotIn('a')).toBeNull()
  })
})
