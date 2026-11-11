import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApi } from '@/api/client'
import { createQueryClient } from '@/api/queries'
import { ComboPictures } from '@/components/ComboPictures'
import { Providers } from '@/Providers'
import { ORIGIN, combo, fakeApi, screenshotOf } from '@/test/fakeApi'
import { renderSite } from '@/test/render'
import {
  VIEWER_ORIGIN,
  frame,
  frameLoaded,
  frames,
  recordPosts,
  send,
  stubDataSaver,
  stubFullscreen,
  stubMatchMedia,
  stubWebGL2,
  viewButtons,
  viewer,
} from '@/test/viewer'
import {
  A,
  A_ID,
  A_NAME,
  B,
  B_ID,
  GLOVES,
  OTHER_PATH,
  PATH,
  RUBY,
  VISIBLE,
  inCard,
  inWindow,
  loadWindowCode,
  open,
  site,
  windowElement,
  windowScreenshot,
} from '@/test/window'
import { READY_MS, STALL_MS } from './messages'
import { viewerUrl } from './params'
import { ViewerHost } from './ViewerHost'

const dialogs = () => document.querySelectorAll('dialog')
const openDialogs = () => document.querySelectorAll('dialog[open]')

beforeAll(loadWindowCode)

afterEach(() => {
  vi.useRealTimers()
})

describe('the button', () => {
  it('shows on every card with WebGL2, and nothing loads before a click', async () => {
    stubWebGL2()
    const postMessage = vi.spyOn(window, 'postMessage')
    await site()
    expect(viewButtons()).toHaveLength(2)
    const button = inCard(0).getByRole('button', { name: 'View in 3D' })
    expect(button).toHaveAccessibleDescription(A_NAME)
    expect(button.parentElement).toHaveClass('absolute', 'top-2', 'right-2')
    expect(button).toHaveClass('text-white/60')
    expect(frames()).toHaveLength(0)
    expect(dialogs()).toHaveLength(0)
    expect(document.body.innerHTML).not.toContain(VIEWER_ORIGIN)
    expect(postMessage).not.toHaveBeenCalled()
  })

  it('does not show without WebGL2', async () => {
    await site()
    expect(viewButtons()).toHaveLength(0)
  })
})

describe('opening the window', () => {
  it('opens one modal window over the page with the combo, its rating and the viewer', async () => {
    stubWebGL2()
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal')
    await site()
    const dialog = await open(0)
    expect(showModal).toHaveBeenCalledTimes(1)
    expect(openDialogs()).toHaveLength(1)
    expect(dialog).toHaveAccessibleName(A_NAME)
    expect(inWindow().getByRole('heading', { name: A_NAME })).toBeInTheDocument()
    expect(inWindow().getByLabelText('Rating 9.5')).toHaveTextContent('9.5')
    // The card keeps its screenshot; the viewer is in the window only.
    expect(inCard(0).getByRole('img', { name: A_NAME })).toBeInTheDocument()
    expect(dialog).toContainElement(frame())
    const iframe = frame()
    expect(iframe.getAttribute('src')).toBe(viewerUrl(VIEWER_ORIGIN, A))
    expect(iframe.getAttribute('src')).toContain('&ui=0&input=game')
    expect(iframe).toHaveAttribute('title', `${A_NAME} in 3D`)
    expect(iframe).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin')
    expect(iframe).not.toHaveAttribute('referrerpolicy')
    expect(iframe).not.toHaveAttribute('allow')
    expect(inWindow().getByRole('button', { name: 'Close' })).toHaveFocus()
    expect(document.documentElement.style.overflow).toBe('hidden')
    expect(windowScreenshot()).toBeInTheDocument()
    expect(inWindow().getByText('Loading 3D view…')).toBeInTheDocument()
    expect(inWindow().getAllByRole('status').map((s) => s.textContent)).toContain('Loading 3D view')
  })

  it('starts the handshake on load, posting to the viewer origin only', async () => {
    stubWebGL2()
    await site()
    await open(0)
    const posts = recordPosts()
    frameLoaded()
    expect(posts.messages()).toHaveLength(1)
    const message = posts.messages()[0] as { type: string; id: string }
    expect(message.type).toBe('cs3d:getState')
    expect(message.id).toMatch(/\S{16,}/)
    expect(posts.targets()).toEqual([VIEWER_ORIGIN])
    // A reply with that id is accepted.
    send({ type: 'cs3d:progress', id: message.id, loaded: 1, total: 4 })
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25')
  })

  it('shows progress, then fades the screenshot out over 200 ms', async () => {
    stubWebGL2()
    await site()
    await open(0)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    viewer.ready2()
    viewer.progress(3, 10)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '30')
    viewer.loaded(null, { actions: ['inspect', 'light', 'heavy'] })
    const fading = windowElement().querySelector('[data-screenshot]')!
    expect(fading).toHaveClass('opacity-0', 'transition-opacity', 'duration-200')
    expect(windowScreenshot()).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(inWindow().getAllByRole('status').map((s) => s.textContent)).toContain('3D view ready')
    act(() => vi.advanceTimersByTime(199))
    expect(windowScreenshot()).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1))
    expect(windowScreenshot()).toBeNull()
  })

  it('removes the screenshot at once when reduced motion is asked for', async () => {
    stubWebGL2()
    stubMatchMedia((query) => query.includes('prefers-reduced-motion'))
    await site()
    await open(0)
    viewer.ready2()
    viewer.loaded()
    expect(windowScreenshot()).toBeNull()
  })

  it('calls the hook once per attempt, when its combo is first drawn', async () => {
    stubWebGL2()
    const onLoaded = vi.fn()
    const api = fakeApi()
    render(
      <Providers api={createApi({ baseUrl: ORIGIN, fetch: api.fetch })} queryClient={createQueryClient()}>
        <MemoryRouter initialEntries={[PATH]}>
          <ViewerHost combos={[A]} onLoaded={onLoaded}>
            <ComboPictures combo={A} />
          </ViewerHost>
        </MemoryRouter>
      </Providers>,
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'View in 3D' }))
    })
    viewer.ready2()
    viewer.loaded()
    expect(onLoaded).toHaveBeenCalledTimes(1)
    expect(onLoaded).toHaveBeenCalledWith({ comboId: A_ID, ms: 2950 })
    viewer.recovering()
    viewer.loaded()
    expect(onLoaded).toHaveBeenCalledTimes(1)
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
    [
      'an error from another origin',
      () =>
        send({ type: 'cs3d:error', id: null, code: 'bad-params', retryable: false }, { origin: 'http://localhost:9999' }),
    ],
  ])('from %s', async (_, event) => {
    stubWebGL2()
    await site()
    await open(0)
    viewer.progress(2, 10)
    event()
    expect(windowScreenshot()).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '20')
    expect(frames()).toHaveLength(1)
  })

  it('ignores progress after the combo is drawn', async () => {
    stubWebGL2()
    stubMatchMedia((query) => query.includes('prefers-reduced-motion'))
    await site()
    await open(0)
    viewer.loaded()
    viewer.progress(1, 10)
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(windowScreenshot()).toBeNull()
  })
})

describe('closing', () => {
  it('Close removes the iframe while it is still in the page, restores the page and returns focus', async () => {
    stubWebGL2()
    await site()
    await open(0)
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
    viewer.loaded()
    await userEvent.click(inWindow().getByRole('button', { name: 'Close' }))
    expect(connectedWhenBlanked).toEqual([true])
    expect(iframe.isConnected).toBe(false)
    expect(dialogs()).toHaveLength(0)
    expect(document.documentElement.style.overflow).toBe('')
    expect(inCard(0).getByRole('button', { name: 'View in 3D' })).toHaveFocus()
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

  it.each([
    ['Close', async () => userEvent.click(inWindow().getByRole('button', { name: 'Close' }))],
    ['Escape on its own controls', async () => userEvent.keyboard('{Escape}')],
    ['an Escape forwarded from the view', async () => viewer.key('Escape')],
    ['Back', async (navigate: (to: number) => void) => act(() => navigate(-1))],
  ] as const)('%s blanks the iframe while it is in the page, and later events change nothing', async (_, close) => {
    stubWebGL2()
    const { navigate, url } = await site()
    await open(0)
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
    viewer.ready2()
    viewer.loaded()
    // While open, the page behind is marked so a phone can hide it (index.css).
    expect(document.documentElement).toHaveClass('viewer-open')
    await close(navigate)
    expect(document.documentElement).not.toHaveClass('viewer-open')
    expect(connectedWhenBlanked).toEqual([true])
    expect(iframe.isConnected).toBe(false)
    expect(dialogs()).toHaveLength(0)
    expect(url()).toBe(PATH)
    expect(document.documentElement.style.overflow).toBe('')
    await waitFor(() => expect(inCard(0).getByRole('button', { name: 'View in 3D' })).toHaveFocus())
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
    expect(dialogs()).toHaveLength(0)
  })

  it('closes on Escape from its own controls', async () => {
    stubWebGL2()
    await site()
    await open(0)
    await userEvent.keyboard('{Escape}')
    expect(dialogs()).toHaveLength(0)
    expect(frames()).toHaveLength(0)
    expect(document.documentElement.style.overflow).toBe('')
    expect(inCard(0).getByRole('button', { name: 'View in 3D' })).toHaveFocus()
  })

  it('closes when the browser closes the dialog itself, without a cancel event', async () => {
    stubWebGL2()
    const { url } = await site()
    await open(0)
    const iframe = frame()
    // Chrome may close a modal dialog on Escape without a cancelable cancel event.
    act(() => (windowElement() as HTMLDialogElement).close())
    await waitFor(() => expect(url()).toBe(PATH))
    expect(iframe.isConnected).toBe(false)
    expect(dialogs()).toHaveLength(0)
    expect(document.documentElement.style.overflow).toBe('')
    expect(inCard(0).getByRole('button', { name: 'View in 3D' })).toHaveFocus()
  })

  it('ignores a close event while the dialog is still open', async () => {
    stubWebGL2()
    await site()
    await open(0)
    act(() => {
      windowElement().dispatchEvent(new Event('close'))
    })
    expect(openDialogs()).toHaveLength(1)
    expect(frames()).toHaveLength(1)
  })

  it('closes on an Escape forwarded from inside the 3D view', async () => {
    stubWebGL2()
    await site()
    await open(0)
    const iframe = frame()
    viewer.ready2()
    viewer.loaded()
    viewer.key('Escape')
    expect(iframe.getAttribute('src')).toBe('about:blank')
    expect(dialogs()).toHaveLength(0)
    expect(document.documentElement.style.overflow).toBe('')
    expect(inCard(0).getByRole('button', { name: 'View in 3D' })).toHaveFocus()
  })

  it.each([
    ['another origin', () => viewer.key('Escape', { origin: 'https://evil.example.com' })],
    ['another window', () => viewer.key('Escape', { source: window })],
    ['another key', () => viewer.key('f')],
    ['a key with an id', () => send({ type: 'cs3d:key', id: 'x', key: 'Escape' })],
  ])('ignores a forwarded key from %s', async (_, event) => {
    stubWebGL2()
    await site()
    await open(0)
    viewer.ready2()
    event()
    expect(openDialogs()).toHaveLength(1)
    expect(frames()).toHaveLength(1)
  })

  it('does not close on a forwarded Escape in full screen, where the browser takes it', async () => {
    stubWebGL2()
    stubFullscreen()
    await site()
    await open(0)
    await userEvent.click(inWindow().getByRole('button', { name: 'Full screen' }))
    viewer.key('Escape')
    expect(openDialogs()).toHaveLength(1)
  })

  it('closes on Back, which leaves the address without the window', async () => {
    stubWebGL2()
    const { navigate, url } = await site()
    await open(0)
    expect(url()).toBe(`${PATH}?3d=${A_ID}`)
    act(() => navigate(-1))
    expect(url()).toBe(PATH)
    expect(dialogs()).toHaveLength(0)
    expect(frames()).toHaveLength(0)
    expect(document.documentElement.style.overflow).toBe('')
  })

  it('closes when the visitor goes to another finish', async () => {
    stubWebGL2()
    const api = fakeApi()
    api.combos(PATH, [A, B])
    api.combos(OTHER_PATH, [])
    const { navigate } = renderSite(PATH, { api })
    await screen.findAllByRole('article')
    await open(0)
    act(() => navigate(OTHER_PATH))
    expect(frames()).toHaveLength(0)
    expect(dialogs()).toHaveLength(0)
    expect(document.documentElement.style.overflow).toBe('')
    act(() => navigate(PATH))
    await screen.findAllByRole('article')
    expect(dialogs()).toHaveLength(0)
    expect(viewButtons()).toHaveLength(2)
  })

  it('keeps the same viewer when the page re-renders with a changed combo', async () => {
    stubWebGL2()
    const { queryClient } = await site()
    await open(0)
    const iframe = frame()
    const src = iframe.getAttribute('src')
    viewer.loaded()
    // A refetch with other conditions must not reload the open view.
    const changed = combo(A_ID, 9.5, { ...GLOVES, seeds: [700] }, RUBY, null, screenshotOf(A_ID))
    act(() => queryClient.setQueryData(['combos', 'gloves', 'specialist', 'mogul'], [changed, B]))
    await waitFor(() => expect(inCard(0).getByText('700')).toBeInTheDocument())
    expect(frame()).toBe(iframe)
    expect(iframe.getAttribute('src')).toBe(src)
  })
})

describe('full screen', () => {
  it('puts the whole window’s contents in full screen and back (a dialog itself cannot be)', async () => {
    stubWebGL2()
    const { request, exit } = stubFullscreen()
    await site()
    await open(0)
    await userEvent.click(inWindow().getByRole('button', { name: 'Full screen' }))
    expect(request).toHaveBeenCalledTimes(1)
    const contents = windowElement().querySelector('[data-window]')!
    expect(request.mock.contexts[0]).toBe(contents)
    expect(contents.parentElement).toBe(windowElement())
    for (const part of [
      inWindow().getByRole('heading', { name: A_NAME }),
      frame(),
      inWindow().getByRole('button', { name: 'Inspect' }),
      inWindow().getByRole('button', { name: 'Close' }),
    ]) {
      expect(contents).toContainElement(part)
    }
    await userEvent.click(inWindow().getByRole('button', { name: 'Exit full screen' }))
    expect(exit).toHaveBeenCalledTimes(1)
  })

  it('stays as it is when the browser refuses full screen', async () => {
    stubWebGL2()
    const { request } = stubFullscreen()
    request.mockImplementation(() => Promise.reject(new TypeError('Permissions check failed')))
    await site()
    await open(0)
    await userEvent.click(inWindow().getByRole('button', { name: 'Full screen' }))
    await act(() => Promise.resolve())
    expect(inWindow().getByRole('button', { name: 'Full screen' })).toBeInTheDocument()
    expect(frames()).toHaveLength(1)
  })

  it('has no full-screen control where the browser has none', async () => {
    stubWebGL2()
    await site()
    await open(0)
    expect(inWindow().queryByRole('button', { name: 'Full screen' })).toBeNull()
  })
})

describe('the window’s address', () => {
  it('opening pushes ?3d=<id> without scrolling; Close goes back to the address without it', async () => {
    stubWebGL2()
    const { url } = await site()
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    await open(1)
    expect(url()).toBe(`${PATH}?3d=${B_ID}`)
    expect(scrollTo).not.toHaveBeenCalled()
    await userEvent.click(inWindow().getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(url()).toBe(PATH))
    expect(dialogs()).toHaveLength(0)
  })

  it('a page opened with the address shows the window waiting for Load 3D view', async () => {
    stubWebGL2()
    const { url } = await site({ path: `${PATH}?3d=${A_ID}` })
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAccessibleName(A_NAME)
    expect(windowScreenshot()).toBeInTheDocument()
    expect(frames()).toHaveLength(0)
    expect(inWindow().queryByText('The 3D view downloads about 34 MB.')).toBeNull()
    await userEvent.click(inWindow().getByRole('button', { name: 'Load 3D view' }))
    expect(frames()).toHaveLength(1)
    await userEvent.click(inWindow().getByRole('button', { name: 'Close' }))
    expect(url()).toBe(PATH)
    expect(dialogs()).toHaveLength(0)
  })

  it('Cancel on a linked window closes it and drops the address', async () => {
    stubWebGL2()
    const { url } = await site({ path: `${PATH}?3d=${A_ID}` })
    await screen.findByRole('dialog')
    await userEvent.click(inWindow().getByRole('button', { name: 'Cancel' }))
    expect(dialogs()).toHaveLength(0)
    expect(url()).toBe(PATH)
  })

  it.each([
    ['an id the page does not list', 'zzzzzzzzzzz9'],
    ['something that is not an id', 'NOT-AN-ID'],
  ])('drops %s from the address, with no window', async (_, id) => {
    stubWebGL2()
    const { url } = await site({ path: `${PATH}?3d=${id}` })
    await waitFor(() => expect(url()).toBe(PATH))
    expect(dialogs()).toHaveLength(0)
    expect(frames()).toHaveLength(0)
  })

  it('drops the address without WebGL2', async () => {
    const { url } = await site({ path: `${PATH}?3d=${A_ID}` })
    await waitFor(() => expect(url()).toBe(PATH))
    expect(dialogs()).toHaveLength(0)
  })

  it('has no Copy link: the address bar holds the same link', async () => {
    stubWebGL2()
    await site()
    await open(0)
    expect(inWindow().queryByRole('button', { name: /copy/i })).not.toBeInTheDocument()
  })
})

describe('phones and small screens', () => {
  it('warns about the download once per visit, in the window, and loads nothing before Load 3D view', async () => {
    stubWebGL2()
    stubMatchMedia(true)
    await site()
    await open(0)
    expect(inWindow().getByText('The 3D view downloads about 34 MB.')).toBeInTheDocument()
    expect(frames()).toHaveLength(0)
    await userEvent.click(inWindow().getByRole('button', { name: 'Cancel' }))
    expect(dialogs()).toHaveLength(0)
    expect(inCard(0).getByRole('button', { name: 'View in 3D' })).toHaveFocus()
    await open(0)
    await userEvent.click(inWindow().getByRole('button', { name: 'Load 3D view' }))
    expect(frames()).toHaveLength(1)
    await userEvent.click(inWindow().getByRole('button', { name: 'Close' }))
    await open(1)
    expect(screen.queryByText('The 3D view downloads about 34 MB.')).toBeNull()
    expect(windowElement()).toContainElement(frame())
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    expect(document.cookie).toBe('')
  })

  it('warns on a wide screen when the browser asks to save data', async () => {
    stubWebGL2()
    stubMatchMedia(false)
    stubDataSaver(true)
    await site()
    await open(0)
    expect(inWindow().getByText('The 3D view downloads about 34 MB.')).toBeInTheDocument()
    expect(frames()).toHaveLength(0)
    await userEvent.click(inWindow().getByRole('button', { name: 'Load 3D view' }))
    expect(frames()).toHaveLength(1)
  })

  it('does not warn on a wide screen with a mouse', async () => {
    stubWebGL2()
    stubMatchMedia(false)
    await site()
    await open(0)
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
    await open(0)
    const first = frame()
    viewer.ready2()
    viewer.error(code, true)
    expect(frames()).toHaveLength(0)
    expect(openDialogs()).toHaveLength(1)
    expect(windowScreenshot()).toBeInTheDocument()
    expect(inWindow().getByText(text, VISIBLE)).toBeInTheDocument()
    expect(inWindow().getAllByRole('status').map((s) => s.textContent)).toContain(text)
    expect(inWindow().getByRole('button', { name: 'Try again' })).toHaveFocus()
    await userEvent.click(inWindow().getByRole('button', { name: 'Try again' }))
    expect(frames()).toHaveLength(1)
    expect(frame()).not.toBe(first)
    expect(screen.queryByText(text, VISIBLE)).toBeNull()
  })

  it.each(['bad-params', 'unknown-knife', 'unknown-gloves', 'unknown-knife-finish', 'unknown-gloves-finish'])(
    '%s says the combo cannot be shown and hides only that card’s button',
    async (code) => {
      stubWebGL2()
      await site()
      await open(0)
      viewer.error(code, false)
      expect(inWindow().getByText("This combo can't be shown in 3D.", VISIBLE)).toBeInTheDocument()
      expect(inWindow().queryByRole('button', { name: 'Try again' })).toBeNull()
      await userEvent.click(inWindow().getByRole('button', { name: 'Close' }))
      expect(inCard(0).queryByRole('button', { name: 'View in 3D' })).toBeNull()
      expect(inCard(1).getByRole('button', { name: 'View in 3D' })).toBeInTheDocument()
      // The button is gone: focus stays in the card's box instead of falling to the page.
      expect(document.activeElement).not.toBe(document.body)
      expect(screen.getAllByRole('article')[0]).toContainElement(document.activeElement as HTMLElement)
    },
  )

  it('treats an unknown code by its retryable flag', async () => {
    stubWebGL2()
    await site()
    await open(0)
    viewer.error('something-new', true)
    expect(inWindow().getByText('The 3D view could not be loaded.', VISIBLE)).toBeInTheDocument()
    expect(inWindow().getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('never shows the viewer’s own message', async () => {
    stubWebGL2()
    await site()
    await open(0)
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
    await open(0)
    event()
    expect(inWindow().getByText("3D isn't available in this browser.", VISIBLE)).toBeInTheDocument()
    expect(frames()).toHaveLength(0)
    expect(viewButtons()).toHaveLength(0)
    await userEvent.click(inWindow().getByRole('button', { name: 'Close' }))
    expect(viewButtons()).toHaveLength(0)
  })

  it('remembers the warning, no WebGL2 and combos that cannot be drawn on other finish pages', async () => {
    stubWebGL2()
    stubMatchMedia(true)
    const C = combo('ccccccccccc3', 7, { ...GLOVES, finish_slug: 'crimson-kimono', display_name: 'Crimson Kimono' }, RUBY)
    const api = fakeApi()
    api.combos(PATH, [A, B])
    api.combos(OTHER_PATH, [C])
    const { navigate } = renderSite(PATH, { api })
    await screen.findAllByRole('article')
    await open(0)
    await userEvent.click(inWindow().getByRole('button', { name: 'Load 3D view' }))
    await userEvent.click(inWindow().getByRole('button', { name: 'Close' }))
    await open(1)
    viewer.error('unknown-knife-finish', false)
    await userEvent.click(inWindow().getByRole('button', { name: 'Close' }))
    act(() => navigate(OTHER_PATH))
    await screen.findByRole('button', { name: 'View in 3D' })
    await open(0)
    expect(screen.queryByText('The 3D view downloads about 34 MB.')).toBeNull()
    expect(frames()).toHaveLength(1)
    viewer.error('no-webgl2', false)
    await userEvent.click(inWindow().getByRole('button', { name: 'Close' }))
    act(() => navigate(PATH))
    await screen.findAllByRole('article')
    expect(viewButtons()).toHaveLength(0)
  })
})

describe('time limits', () => {
  it('fails when the viewer never answers', async () => {
    stubWebGL2()
    await site()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await open(0)
    const iframe = frame()
    act(() => vi.advanceTimersByTime(READY_MS - 1))
    expect(frames()).toHaveLength(1)
    act(() => vi.advanceTimersByTime(1))
    expect(frames()).toHaveLength(0)
    expect(inWindow().getByText('The 3D view could not be loaded.', VISIBLE)).toBeInTheDocument()
    expect(inWindow().getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'cs3d:loaded', id: null, ms: 1 },
          origin: VIEWER_ORIGIN,
          source: iframe.contentWindow,
        }),
      )
    })
    expect(inWindow().getByText('The 3D view could not be loaded.', VISIBLE)).toBeInTheDocument()
  })

  it.each([
    ['a handshake reply', () => send({ type: 'cs3d:state', id: null, status: 'loading' })],
    ['a progress event', () => viewer.progress(1, 10)],
  ])('still fails at 15 s without cs3d:ready, after %s', async (_, event) => {
    stubWebGL2()
    await site()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await open(0)
    act(() => vi.advanceTimersByTime(5_000))
    event()
    act(() => vi.advanceTimersByTime(READY_MS - 5_000))
    expect(frames()).toHaveLength(0)
    expect(inWindow().getByText('The 3D view could not be loaded.', VISIBLE)).toBeInTheDocument()
  })

  it('fails when loading stalls after the viewer answered', async () => {
    stubWebGL2()
    await site()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await open(0)
    viewer.ready2()
    act(() => vi.advanceTimersByTime(STALL_MS - 1))
    viewer.progress(5, 10)
    act(() => vi.advanceTimersByTime(STALL_MS - 1))
    expect(frames()).toHaveLength(1)
    act(() => vi.advanceTimersByTime(1))
    expect(frames()).toHaveLength(0)
    expect(inWindow().getByText('The 3D view could not be loaded.', VISIBLE)).toBeInTheDocument()
  })

  it('has no time limit once the combo is drawn, even after late events', async () => {
    stubWebGL2()
    await site()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await open(0)
    viewer.ready2()
    viewer.loaded()
    viewer.progress(10, 10)
    send({ type: 'cs3d:state', id: null, status: 'loaded' })
    viewer.ready2()
    act(() => vi.advanceTimersByTime(STALL_MS * 10))
    expect(frames()).toHaveLength(1)
    expect(screen.queryByText('The 3D view could not be loaded.', VISIBLE)).toBeNull()
  })

  it('times a recovery like a load', async () => {
    stubWebGL2()
    await site()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await open(0)
    viewer.ready2()
    viewer.loaded()
    viewer.recovering()
    act(() => vi.advanceTimersByTime(STALL_MS))
    expect(frames()).toHaveLength(0)
    expect(inWindow().getByText('The 3D view could not be loaded.', VISIBLE)).toBeInTheDocument()
  })

  it('puts the screenshot back while the viewer recovers a lost GPU context', async () => {
    stubWebGL2()
    stubMatchMedia((query) => query.includes('prefers-reduced-motion'))
    await site()
    await open(0)
    viewer.loaded()
    expect(windowScreenshot()).toBeNull()
    viewer.recovering()
    expect(windowScreenshot()).toBeInTheDocument()
    expect(inWindow().getByText('Loading 3D view…')).toBeInTheDocument()
    viewer.loaded()
    expect(windowScreenshot()).toBeNull()
  })
})
