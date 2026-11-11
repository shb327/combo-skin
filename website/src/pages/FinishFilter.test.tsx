import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { gloveTypes } from '@/data/gloves'
import { knifeTypes } from '@/data/knives'
import { COUNTS_PATH, deferred, fakeApi, type FakeApi } from '@/test/fakeApi'
import { expectNoControl, finishCards } from '@/test/finishPage'
import { renderSite } from '@/test/render'

const SPECIALIST = gloveTypes.find((t) => t.id === 'specialist')!
const KARAMBIT = knifeTypes.find((t) => t.id === 'karambit')!
// Two finishes out of catalog order, to show the grid keeps the catalog's.
const [FIRST, , , SECOND] = SPECIALIST.finishes
const SPECIALIST_COUNTS = {
  gloves: { specialist: { [SECOND.id]: 2, [FIRST.id]: 5 } },
  knives: {},
}

const finishNames = () => finishCards().map((link) => within(link).getByRole('heading').textContent)
const filter = () => screen.findByRole('checkbox', { name: 'Has combos' })

function withCounts(counts: Parameters<FakeApi['counts']>[0]): FakeApi {
  const api = fakeApi()
  api.counts(counts)
  return api
}

describe('"Has combos" filter', () => {
  it('is off by default, and hides finishes without combos when turned on', async () => {
    const user = userEvent.setup()
    const site = renderSite('/gloves', { api: withCounts(SPECIALIST_COUNTS) })
    act(() => void site.navigate('/gloves/specialist'))
    const checkbox = await filter()
    expect(checkbox).not.toBeChecked()
    expect(finishNames()).toHaveLength(SPECIALIST.finishes.length)

    await user.click(checkbox)
    expect(checkbox).toBeChecked()
    expect(finishNames()).toEqual([FIRST.name, SECOND.name])
    expect(site.url()).toBe('/gloves/specialist?has=combos')

    await user.click(checkbox)
    expect(finishNames()).toHaveLength(SPECIALIST.finishes.length)
    expect(site.url()).toBe('/gloves/specialist')

    // Toggling added no history entry: one step back is the page before.
    act(() => void site.navigate(-1))
    expect(site.url()).toBe('/gloves')
  })

  it('starts on when the URL asks for it, once the counts load', async () => {
    const { reply, resolve } = deferred()
    const api = fakeApi()
    api.reply(reply)
    renderSite('/knives/karambit?has=combos', { api })
    expect(finishNames()).toHaveLength(KARAMBIT.finishes.length)
    expectNoControl()

    resolve(
      new Response(JSON.stringify({ gloves: {}, knives: { karambit: { fade: 1 } } }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(await filter()).toBeChecked()
    expect(finishNames()).toEqual(['Fade'])
  })

  it('shows every finish when the counts fail, whatever the URL says', async () => {
    const api = fakeApi()
    api.reply('network-error', 'network-error')
    renderSite('/knives/karambit?has=combos', { api })
    await waitFor(() =>
      expect(api.requests.filter((r) => r.url.endsWith(COUNTS_PATH))).toHaveLength(2),
    )
    await act(() => new Promise((done) => setTimeout(done, 0)))
    expect(finishNames()).toHaveLength(KARAMBIT.finishes.length)
    expectNoControl()
  })

  it('ignores any other value of "has"', async () => {
    renderSite('/gloves/specialist?has=yes', { api: withCounts(SPECIALIST_COUNTS) })
    expect(await filter()).not.toBeChecked()
    expect(finishNames()).toHaveLength(SPECIALIST.finishes.length)
  })

  it('stays on after visiting a combos page and coming back', async () => {
    const user = userEvent.setup()
    const api = withCounts(SPECIALIST_COUNTS)
    api.combos(`/gloves/specialist/${FIRST.id}/combos`, [])
    const site = renderSite('/gloves/specialist', { api })
    await user.click(await filter())
    await user.click(screen.getByRole('heading', { name: FIRST.name }))
    expect(await screen.findByText('No combos yet')).toBeInTheDocument()

    act(() => void site.navigate(-1))
    expect(site.url()).toBe('/gloves/specialist?has=combos')
    expect(await filter()).toBeChecked()
    // The combos page found none for the first finish, so only the second is left.
    expect(finishNames()).toEqual([SECOND.name])
  })

  it('offers to show every finish when none of the type has combos', async () => {
    const user = userEvent.setup()
    const site = renderSite('/gloves/specialist?has=combos', {
      api: withCounts({ gloves: { driver: { 'king-snake': 3 } }, knives: {} }),
    })
    expect(
      await screen.findByText('No Specialist Gloves finishes have combos yet.'),
    ).toBeInTheDocument()
    expect(screen.queryAllByRole('link').filter((l) => l.getAttribute('href')?.endsWith('/combos')))
      .toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Show all finishes' }))
    expect(finishNames()).toHaveLength(SPECIALIST.finishes.length)
    expect(await filter()).not.toBeChecked()
    expect(site.url()).toBe('/gloves/specialist')
  })
})

describe('"Has combos" on the type grids', () => {
  const typeNames = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)

  it.each([
    ['/gloves', gloveTypes, { gloves: { specialist: { [FIRST.id]: 5 } }, knives: {} }, 'Specialist Gloves'],
    ['/knives', knifeTypes, { gloves: {}, knives: { karambit: { [KARAMBIT.finishes[0].id]: 2 } } }, 'Karambit'],
  ])('%s hides types without combos, and keeps it in the URL', async (path, types, counts, name) => {
    const user = userEvent.setup()
    const site = renderSite(path, { api: withCounts(counts) })
    const checkbox = await filter()
    expect(checkbox).not.toBeChecked()
    expect(typeNames()).toHaveLength(types.length)

    await user.click(checkbox)
    expect(typeNames()).toEqual([name])
    expect(site.url()).toBe(`${path}?has=combos`)

    // Kept after a type page and Back, and on a fresh load of the URL.
    await user.click(screen.getByRole('link', { name: new RegExp(name) }))
    act(() => void site.navigate(-1))
    expect(site.url()).toBe(`${path}?has=combos`)
    expect(await filter()).toBeChecked()
    expect(typeNames()).toEqual([name])
    site.unmount()
    renderSite(`${path}?has=combos`, { api: withCounts(counts) })
    expect(await filter()).toBeChecked()
    expect(typeNames()).toEqual([name])
  })

  it('says so when no type has combos, with a way to show all', async () => {
    const user = userEvent.setup()
    const site = renderSite('/knives?has=combos', { api: withCounts({ gloves: {}, knives: {} }) })
    expect(await screen.findByText('No knife types have combos yet.')).toBeInTheDocument()
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Show all' }))
    expect(typeNames()).toHaveLength(knifeTypes.length)
    expect(site.url()).toBe('/knives')
  })

  it('is not shown until the counts load, and shows every type if they fail', async () => {
    const api = fakeApi()
    const pending = deferred()
    api.reply(pending.reply)
    renderSite('/gloves?has=combos', { api })
    expect(typeNames()).toHaveLength(gloveTypes.length)
    expectNoControl()
    await act(async () => pending.resolve(new Response('{}', { status: 500 })))
    await waitFor(() => expect(api.requests.filter((r) => new URL(r.url).pathname === COUNTS_PATH)).toHaveLength(2))
    expect(typeNames()).toHaveLength(gloveTypes.length)
    expectNoControl()
  })
})
