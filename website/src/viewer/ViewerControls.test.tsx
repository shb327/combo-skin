import { act, cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { combo, fakeApi } from '@/test/fakeApi'
import { renderSite } from '@/test/render'
import {
  ALL_ACTIONS,
  VERTIGO,
  VIEWER_ORIGIN,
  frame,
  frames,
  recordPosts,
  stubFullscreen,
  stubMatchMedia,
  stubWebGL2,
  viewer,
} from '@/test/viewer'
import { A, B, GLOVES, OTHER_PATH, PATH, RUBY, VISIBLE, inWindow, loadWindowCode, open, site, windowElement } from '@/test/window'
import { STALL_MS } from './messages'
import { viewerCombo } from './params'

const MIRAGE = { id: 'de_mirage', name: 'Mirage' }
const DARRYL = 'Bloody Darryl The Strapped | The Professionals'
const DEFAULT = 'Default (Lt. Commander Ricksaw | NSWC SEAL)'

beforeAll(loadWindowCode)

afterEach(() => {
  vi.useRealTimers()
})

/** Opens combo A's window on a version 2 viewer (or `ready` fields) and draws it. Reduced motion,
 * so the screenshot goes at once. */
async function drawn(ready: Record<string, unknown> = {}, actions: string[] | undefined = ALL_ACTIONS) {
  stubWebGL2()
  stubMatchMedia((query) => query.includes('prefers-reduced-motion'))
  const result = await site()
  await open(0)
  const posts = recordPosts()
  viewer.ready2(ready)
  viewer.loaded(null, actions ? { actions } : {})
  return { ...result, posts }
}

const action = (name: string) => inWindow().queryByRole('button', { name })
const mapSelect = () => inWindow().queryByRole('combobox', { name: 'Map' })
const agentButton = () => inWindow().getByRole('button', { name: /^Agent: / })
/** The item fields of combo A, as `cs3d:load` sends them. */
const aFields = () =>
  Object.fromEntries(Object.entries(viewerCombo(A)).filter(([, value]) => value !== undefined))

describe('the game’s actions', () => {
  it('shows Inspect, Light swing and Heavy swing with their keys, disabled until the combo is drawn', async () => {
    stubWebGL2()
    await site()
    await open(0)
    viewer.ready2()
    for (const [name, hint] of [
      ['Inspect', 'F'],
      ['Light swing', 'Left click'],
      ['Heavy swing', 'Right click'],
    ]) {
      expect(action(name)).toBeDisabled()
      expect(within(action(name)!).getByText(hint)).toBeInTheDocument()
    }
    expect(action('Inspect')).toHaveAttribute('aria-keyshortcuts', 'F')
    viewer.loaded(null, { actions: ALL_ACTIONS })
    for (const name of ['Inspect', 'Light swing', 'Heavy swing']) expect(action(name)).toBeEnabled()
  })

  it('posts each action to the viewer’s origin only', async () => {
    const { posts } = await drawn()
    await userEvent.click(action('Inspect')!)
    await userEvent.click(action('Light swing')!)
    await userEvent.click(action('Heavy swing')!)
    const sent = posts.messages()
    expect(sent.map((m) => [m.type, m.attack])).toEqual([
      ['cs3d:inspect', undefined],
      ['cs3d:attack', 'light'],
      ['cs3d:attack', 'heavy'],
    ])
    for (const message of sent) expect(message.id).toMatch(/\S{16,}/)
    expect(new Set(posts.targets())).toEqual(new Set([VIEWER_ORIGIN]))
  })

  it('plays the inspect on F from the window’s controls, not while typing in the agent search', async () => {
    const { posts } = await drawn()
    inWindow().getByRole('button', { name: 'Close' }).focus()
    await userEvent.keyboard('f')
    expect(posts.messages().filter((m) => m.type === 'cs3d:inspect')).toHaveLength(1)
    await userEvent.click(agentButton())
    await userEvent.keyboard('f')
    expect(inWindow().getByRole('combobox', { name: 'Search agents' })).toHaveValue('f')
    expect(posts.messages().filter((m) => m.type === 'cs3d:inspect')).toHaveLength(1)
  })

  it('offers only the actions built for the knife drawn', async () => {
    await drawn({}, ['inspect'])
    expect(action('Inspect')).toBeInTheDocument()
    expect(action('Light swing')).toBeNull()
    expect(action('Heavy swing')).toBeNull()
  })

  it('hides the key hints on a touch-first device, and the buttons still play', async () => {
    stubWebGL2()
    stubMatchMedia((query) => query.includes('hover: none') || query.includes('prefers-reduced-motion'))
    await site()
    await open(0)
    const posts = recordPosts()
    viewer.ready2()
    viewer.loaded(null, { actions: ALL_ACTIONS })
    expect(inWindow().queryByText('F')).toBeNull()
    expect(inWindow().queryByText('Left click')).toBeNull()
    expect(inWindow().queryByText('Right click')).toBeNull()
    await userEvent.click(action('Light swing')!)
    expect(posts.last('cs3d:attack')).toMatchObject({ attack: 'light' })
  })
})

describe('an older viewer', () => {
  it.each([
    ['protocol version 1', () => viewer.ready()],
    ['features that are not a list', () => viewer.ready2({ features: 'attack' })],
  ])('with %s, offers Inspect, Full screen and Close only', async (_, ready) => {
    stubWebGL2()
    stubFullscreen()
    stubMatchMedia((query) => query.includes('prefers-reduced-motion'))
    await site()
    await open(0)
    const posts = recordPosts()
    ready()
    viewer.loaded()
    const names = inWindow()
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'))
    expect(names).toEqual(['Full screen', 'Close', 'Inspect'])
    expect(mapSelect()).toBeNull()
    expect(inWindow().queryByRole('button', { name: /^Agent/ })).toBeNull()
    await userEvent.click(action('Inspect')!)
    expect(posts.last('cs3d:inspect')).toBeDefined()
    await userEvent.click(inWindow().getByRole('button', { name: 'Close' }))
    expect(frames()).toHaveLength(0)
    expect(document.querySelectorAll('dialog')).toHaveLength(0)
  })
})

describe('the map', () => {
  it('lists Vertigo, marked current', async () => {
    await drawn()
    const select = mapSelect() as HTMLSelectElement
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Vertigo'])
    expect(select.value).toBe('de_vertigo')
  })

  it('reloads the same combo on another map, ignoring the earlier load’s events', async () => {
    const { posts } = await drawn({ maps: [VERTIGO, MIRAGE] })
    await userEvent.selectOptions(mapSelect()!, 'de_mirage')
    const load = posts.last('cs3d:load')!
    expect(load).toEqual({ type: 'cs3d:load', id: expect.stringMatching(/\S{16,}/), combo: aFields(), map: 'de_mirage' })
    expect(inWindow().getByText('Loading the map…')).toBeInTheDocument()
    expect(action('Inspect')).toBeDisabled()
    viewer.progress(2, 4, load.id as string)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
    // An event of the URL's load, after the new one started, changes nothing.
    viewer.loaded(null)
    expect(inWindow().getByText('Loading the map…')).toBeInTheDocument()
    viewer.loaded(load.id as string, { map: 'de_mirage', actions: ALL_ACTIONS })
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect((mapSelect() as HTMLSelectElement).value).toBe('de_mirage')
    expect(action('Inspect')).toBeEnabled()
    // Back to the default map: no map in the load.
    await userEvent.selectOptions(mapSelect()!, 'de_vertigo')
    expect(posts.last('cs3d:load')).toEqual({ type: 'cs3d:load', id: expect.any(String), combo: aFields() })
  })

  it('falls back to the default map when the viewer refuses one', async () => {
    const { posts } = await drawn({ maps: [VERTIGO, MIRAGE] })
    await userEvent.selectOptions(mapSelect()!, 'de_mirage')
    const refused = posts.last('cs3d:load')!
    viewer.error('unknown-map', false, 'No such map.', { id: refused.id as string, kept: true })
    const fallback = posts.last('cs3d:load')!
    expect(fallback.id).not.toBe(refused.id)
    expect(fallback).toEqual({ type: 'cs3d:load', id: expect.any(String), combo: aFields() })
    viewer.loaded(fallback.id as string, { map: 'de_vertigo', actions: ALL_ACTIONS })
    expect(inWindow().getByText("That map isn't available.", VISIBLE)).toBeInTheDocument()
    expect((mapSelect() as HTMLSelectElement).value).toBe('de_vertigo')
    expect(frames()).toHaveLength(1)
  })

  it('never lists the studio', async () => {
    await drawn({ maps: [{ id: 'studio', name: 'Studio' }, VERTIGO] })
    expect(within(mapSelect()!).getAllByRole('option').map((o) => o.textContent)).toEqual(['Vertigo'])
  })

  it('shows a map name with markup as plain text', async () => {
    await drawn({ maps: [VERTIGO, { id: 'de_mirage', name: '<b>x</b>' }] })
    expect(within(mapSelect()!).getByRole('option', { name: '<b>x</b>' })).toBeInTheDocument()
    expect(document.querySelector('b')).toBeNull()
  })

  it.each([
    ['an id with a space', [VERTIGO, { id: 'Bad Id', name: 'Bad' }]],
    ['a name of 41 characters', [VERTIGO, { id: 'de_long', name: 'x'.repeat(41) }]],
    ['a name with a control character', [VERTIGO, { id: 'de_ctrl', name: 'Mir\u0001age' }]],
    ['33 entries', Array.from({ length: 33 }, (_, i) => ({ id: `de_${i}`, name: `Map ${i}` }))],
    ['a string instead of a list', 'de_vertigo'],
  ])('has no map menu for %s', async (_, maps) => {
    await drawn({ maps })
    expect(mapSelect()).toBeNull()
  })
})

describe('the agent', () => {
  it('lists the agents both the viewer and the website know, the default first, then by team', async () => {
    await drawn()
    expect(agentButton()).toHaveAccessibleName('Agent: Lt. Commander Ricksaw | NSWC SEAL')
    const before = Array.from(windowElement().querySelectorAll('img')).filter((img) => !agentButton().contains(img))
    expect(before.every((img) => img.closest('[data-screenshot]'))).toBe(true)
    expect(inWindow().queryByRole('listbox')).toBeNull()
    await userEvent.click(agentButton())
    const list = inWindow().getByRole('listbox', { name: 'Agents' })
    const options = within(list).getAllByRole('option')
    expect(options[0]).toHaveTextContent(DEFAULT)
    expect(options).toHaveLength(63)
    const groups = within(list).getAllByRole('group')
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['Counter-Terrorists', 'Terrorists'])
    expect(within(groups[0]).getAllByRole('option')).toHaveLength(28)
    expect(within(groups[1]).getAllByRole('option')).toHaveLength(34)
    expect(within(groups[1]).getByRole('option', { name: DARRYL })).toBeInTheDocument()
    for (const img of list.querySelectorAll('img')) {
      expect(img.getAttribute('src')).toMatch(/^https:\/\/community\.akamai\.steamstatic\.com\//)
      expect(img).toHaveAttribute('referrerpolicy', 'no-referrer')
    }
  })

  it('lists only the agents in both lists', async () => {
    await drawn({ agents: [5404, 4613, 99999] })
    await userEvent.click(agentButton())
    const options = within(inWindow().getByRole('listbox')).getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual([DEFAULT, DARRYL])
  })

  it('chooses an agent by keyboard and loads it; Default loads without an agent', async () => {
    const { posts } = await drawn()
    await userEvent.click(agentButton())
    await userEvent.keyboard('darr')
    await userEvent.keyboard('{ArrowDown}{Enter}')
    const load = posts.last('cs3d:load')!
    expect(load).toEqual({ type: 'cs3d:load', id: expect.any(String), combo: { ...aFields(), agent: '4613' } })
    expect(inWindow().getByText('Loading the agent…')).toBeInTheDocument()
    viewer.loaded(load.id as string, { actions: ALL_ACTIONS })
    expect(agentButton()).toHaveAccessibleName(`Agent: ${DARRYL}`)
    expect(agentButton()).toHaveFocus()
    await userEvent.click(agentButton())
    await userEvent.click(within(inWindow().getByRole('listbox')).getByRole('option', { name: DEFAULT }))
    expect(posts.last('cs3d:load')).toEqual({ type: 'cs3d:load', id: expect.any(String), combo: aFields() })
  })

  it('falls back to the default agent when the viewer refuses one', async () => {
    const { posts } = await drawn()
    await userEvent.click(agentButton())
    await userEvent.click(within(inWindow().getByRole('listbox')).getByRole('option', { name: DARRYL }))
    const refused = posts.last('cs3d:load')!
    viewer.error('unknown-agent', false, 'No such agent.', { id: refused.id as string, kept: true })
    const fallback = posts.last('cs3d:load')!
    expect(fallback).toEqual({ type: 'cs3d:load', id: expect.any(String), combo: aFields() })
    viewer.loaded(fallback.id as string, { actions: ALL_ACTIONS })
    expect(inWindow().getByText("That agent isn't available.", VISIBLE)).toBeInTheDocument()
    expect(agentButton()).toHaveAccessibleName('Agent: Lt. Commander Ricksaw | NSWC SEAL')
    // The card still offers 3D: an agent is not the combo.
    await userEvent.click(inWindow().getByRole('button', { name: 'Close' }))
    expect(screen.getAllByRole('button', { name: 'View in 3D' })).toHaveLength(2)
  })

  it('keeps the view when a change fails with the last scene kept, and Try again sends it again', async () => {
    const { posts } = await drawn()
    await userEvent.click(agentButton())
    await userEvent.click(within(inWindow().getByRole('listbox')).getByRole('option', { name: DARRYL }))
    const failed = posts.last('cs3d:load')!
    viewer.error('assets-unavailable', true, 'x', { id: failed.id as string, kept: true })
    expect(frames()).toHaveLength(1)
    expect(windowElement().querySelector('[data-screenshot]')).toBeNull()
    expect(inWindow().getByText("That agent couldn't be loaded.", VISIBLE)).toBeInTheDocument()
    expect(agentButton()).toHaveAccessibleName('Agent: Lt. Commander Ricksaw | NSWC SEAL')
    await userEvent.click(inWindow().getByRole('button', { name: 'Try again' }))
    const again = posts.last('cs3d:load')!
    expect(again.id).not.toBe(failed.id)
    expect(again).toEqual({ ...failed, id: again.id })
  })

  it('fails like a load when a change of agent stalls', async () => {
    const { posts } = await drawn()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await act(async () => {
      agentButton().click()
    })
    await act(async () => {
      within(inWindow().getByRole('listbox')).getByRole('option', { name: DARRYL }).click()
    })
    expect(posts.last('cs3d:load')).toBeDefined()
    act(() => vi.advanceTimersByTime(STALL_MS - 1))
    expect(frames()).toHaveLength(1)
    act(() => vi.advanceTimersByTime(1))
    expect(frames()).toHaveLength(0)
    expect(inWindow().getByText('The 3D view could not be loaded.', VISIBLE)).toBeInTheDocument()
    expect(inWindow().getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('closes only the agent list on Escape', async () => {
    await drawn()
    await userEvent.click(agentButton())
    await userEvent.keyboard('{Escape}')
    expect(inWindow().queryByRole('listbox')).toBeNull()
    expect(document.querySelectorAll('dialog[open]')).toHaveLength(1)
    expect(agentButton()).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(document.querySelectorAll('dialog')).toHaveLength(0)
  })
})

describe('remembering the choice for the visit', () => {
  it('opens the next window, on any finish page, with the visitor’s agent; a new visit starts from the default', async () => {
    const C = combo('ccccccccccc3', 7, { ...GLOVES, finish_slug: 'crimson-kimono', display_name: 'Crimson Kimono' }, RUBY)
    stubWebGL2()
    stubMatchMedia((query) => query.includes('prefers-reduced-motion'))
    const api = fakeApi()
    api.combos(PATH, [A, B])
    api.combos(OTHER_PATH, [C])
    const { navigate } = renderSite(PATH, { api })
    await screen.findAllByRole('article')
    await open(0)
    const posts = recordPosts()
    viewer.ready2()
    viewer.loaded(null, { actions: ALL_ACTIONS })
    await userEvent.click(agentButton())
    await userEvent.click(within(inWindow().getByRole('listbox')).getByRole('option', { name: DARRYL }))
    viewer.loaded(posts.last('cs3d:load')!.id as string, { actions: ALL_ACTIONS })
    await userEvent.click(inWindow().getByRole('button', { name: 'Close' }))

    await open(1)
    expect(new URL(frame().src).searchParams.get('agent')).toBe('4613')
    viewer.ready2()
    expect(agentButton()).toHaveAccessibleName(`Agent: ${DARRYL}`)
    await userEvent.click(inWindow().getByRole('button', { name: 'Close' }))

    act(() => navigate(OTHER_PATH))
    await screen.findByRole('article')
    await open(0)
    expect(new URL(frame().src).searchParams.get('agent')).toBe('4613')
    await userEvent.click(inWindow().getByRole('button', { name: 'Close' }))
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    expect(document.cookie).toBe('')

    // A reload: the app starts again from scratch.
    cleanup()
    await site()
    await open(0)
    expect(new URL(frame().src).searchParams.has('agent')).toBe(false)
  })
})
