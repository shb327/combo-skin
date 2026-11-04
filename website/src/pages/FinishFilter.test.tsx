import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { gloveTypes } from '@/data/gloves'
import { knifeTypes } from '@/data/knives'
import { COUNTS_PATH, deferred, fakeApi, type FakeApi } from '@/test/fakeApi'
import { renderSite } from '@/test/render'

const SPECIALIST = gloveTypes.find((t) => t.id === 'specialist')!
const KARAMBIT = knifeTypes.find((t) => t.id === 'karambit')!
// Two finishes out of catalog order, to show the grid keeps the catalog's.
const [FIRST, , , SECOND] = SPECIALIST.finishes
const SPECIALIST_COUNTS = {
  gloves: { specialist: { [SECOND.id]: 2, [FIRST.id]: 5 } },
  knives: {},
}

const finishNames = () =>
  screen
    .getAllByRole('link')
    .filter((link) => link.getAttribute('href')?.endsWith('/combos'))
    .map((link) => within(link).getByRole('heading').textContent)
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
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()

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
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
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
