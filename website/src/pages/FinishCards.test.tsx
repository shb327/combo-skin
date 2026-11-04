import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { gloveTypes } from '@/data/gloves'
import { knifeTypes } from '@/data/knives'
import {
  COUNTS_PATH,
  ORIGIN,
  combosOf,
  deferred,
  fakeApi,
  item,
  json,
  type FakeApi,
} from '@/test/fakeApi'
import { renderSite } from '@/test/render'

const SPECIALIST = gloveTypes.find((t) => t.id === 'specialist')!
const KARAMBIT = knifeTypes.find((t) => t.id === 'karambit')!
const KIMONO = item({ type_slug: 'specialist', finish_slug: 'crimson-kimono' })
const COUNT = /\d+\s*combos?\b/

const finishCards = () =>
  screen.getAllByRole('link').filter((link) => link.getAttribute('href')?.endsWith('/combos'))
const card = (name: string) =>
  finishCards().find((link) => within(link).getByRole('heading').textContent === name)!
const countRequests = (api: FakeApi) =>
  api.requests.filter((request) => new URL(request.url).pathname === COUNTS_PATH)
const typeCard = (name: string) => screen.getByRole('heading', { name }).closest('div.group')!
/** Lets answered requests settle. */
const settle = () => act(() => new Promise((done) => setTimeout(done, 0)))

function withCounts(counts: Parameters<FakeApi['counts']>[0]): FakeApi {
  const api = fakeApi()
  api.counts(counts)
  return api
}

describe('finish card counts', () => {
  it.each([
    [
      '/gloves/specialist',
      SPECIALIST,
      { gloves: { specialist: { 'crimson-kimono': 18, mogul: 1 } }, knives: {} },
      ['Crimson Kimono', 'Mogul'],
    ],
    [
      '/knives/karambit',
      KARAMBIT,
      { gloves: {}, knives: { karambit: { 'doppler-ruby': 18, fade: 1 } } },
      ['Doppler (Ruby)', 'Fade'],
    ],
  ])('%s shows the count of every finish with combos', async (path, type, counts, [many, one]) => {
    const { api } = renderSite(path, { api: withCounts(counts) })
    expect(await within(card(many)).findByText('18')).toBeInTheDocument()
    expect(card(many)).toHaveTextContent(/18 combos$/)
    expect(card(one)).toHaveTextContent(/1 combo$/)
    expect(finishCards()).toHaveLength(type.finishes.length)
    for (const link of finishCards()) {
      if (link !== card(many) && link !== card(one)) expect(link).not.toHaveTextContent(COUNT)
    }
    expect(api.requests).toEqual([
      { url: `${ORIGIN}${COUNTS_PATH}`, method: 'GET', credentials: 'omit', redirect: 'error' },
    ])
  })

  it('shows every finish, without counts or the filter, while the counts load', () => {
    const api = fakeApi()
    api.reply(deferred().reply)
    renderSite('/gloves/specialist', { api })
    expect(finishCards()).toHaveLength(SPECIALIST.finishes.length)
    for (const link of finishCards()) {
      expect(link).not.toHaveTextContent(COUNT)
      expect(link.getAttribute('href')).toMatch(/^\/gloves\/specialist\/[a-z0-9-]+\/combos$/)
    }
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it.each([
    ['no response', (): 'network-error' => 'network-error'],
    ['a 500', () => json({ detail: 'oops' }, 500)],
    ['a body that is not counts', () => json({ gloves: { specialist: { mogul: 'many' } } })],
    ['a list', () => json([])],
  ])('shows every finish quietly after %s', async (_, reply) => {
    const api = fakeApi()
    api.reply(reply(), reply())
    renderSite('/gloves/specialist', { api })
    await waitFor(() => expect(countRequests(api)).toHaveLength(2))
    await settle()
    expect(finishCards()).toHaveLength(SPECIALIST.finishes.length)
    for (const link of finishCards()) expect(link).not.toHaveTextContent(COUNT)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByText(/could not|error|try again/i)).not.toBeInTheDocument()
  })

  it("shows the number of combos a finish's page listed when coming back to it", async () => {
    const api = withCounts({
      gloves: { specialist: { 'crimson-kimono': 18, mogul: 1 } },
      knives: {},
    })
    api.combos('/gloves/specialist/crimson-kimono/combos', combosOf(KIMONO, 19))
    api.combos('/gloves/specialist/mogul/combos', [])
    const { navigate } = renderSite('/gloves/specialist', { api })
    expect(await within(card('Crimson Kimono')).findByText('18')).toBeInTheDocument()

    act(() => void navigate('/gloves/specialist/crimson-kimono/combos'))
    expect(await screen.findByText('19 combos')).toBeInTheDocument()
    act(() => void navigate('/gloves/specialist/mogul/combos'))
    expect(await screen.findByText('No combos yet')).toBeInTheDocument()
    act(() => void navigate('/gloves/specialist'))

    expect(card('Crimson Kimono')).toHaveTextContent(/19 combos$/)
    expect(card('Mogul')).not.toHaveTextContent(COUNT)
    expect(countRequests(api)).toHaveLength(1)
  })

  it('loads the counts once when the visitor starts on a combos page', async () => {
    const api = withCounts({ gloves: { specialist: { 'crimson-kimono': 2 } }, knives: {} })
    api.combos('/gloves/specialist/crimson-kimono/combos', combosOf(KIMONO, 2))
    const { navigate } = renderSite('/gloves/specialist/crimson-kimono/combos', { api })
    expect(await screen.findByText('2 combos')).toBeInTheDocument()
    expect(countRequests(api)).toHaveLength(0)

    act(() => void navigate('/gloves/specialist'))
    expect(await within(card('Crimson Kimono')).findByText('2')).toBeInTheDocument()
    await settle()
    expect(countRequests(api)).toHaveLength(1)
  })
})

describe('type card counts', () => {
  const finishes = (type: { finishes: { id: string }[] }, ...counts: number[]) =>
    Object.fromEntries(counts.map((count, index) => [type.finishes[index].id, count]))

  it('adds the total of each type with combos to its card', async () => {
    const driver = gloveTypes.find((t) => t.id === 'driver')!
    renderSite('/gloves', {
      api: withCounts({
        gloves: {
          specialist: { ...finishes(SPECIALIST, 18, 1), 'not-in-the-catalog': 5 },
          driver: finishes(driver, 1),
        },
        knives: { karambit: { 'doppler-ruby': 3 } },
      }),
    })
    await waitFor(() => expect(typeCard(SPECIALIST.name)).toHaveTextContent('19 combos'))
    expect(typeCard(SPECIALIST.name)).toHaveTextContent(
      new RegExp(`(^|\\D)${SPECIALIST.finishes.length} available · 19 combos$`),
    )
    expect(typeCard(driver.name)).toHaveTextContent(/ available · 1 combo$/)
    for (const type of gloveTypes) {
      if (type === SPECIALIST || type === driver) continue
      expect(typeCard(type.name)).toHaveTextContent(
        new RegExp(`(^|\\D)${type.finishes.length} available$`),
      )
    }
  })

  it('totals knife types on /knives', async () => {
    renderSite('/knives', {
      api: withCounts({ gloves: {}, knives: { karambit: finishes(KARAMBIT, 2, 3) } }),
    })
    await waitFor(() =>
      expect(typeCard(KARAMBIT.name)).toHaveTextContent(/ available · 5 combos$/),
    )
  })

  it.each([
    ['while the counts load', () => deferred().reply],
    ['after they fail', (): 'network-error' => 'network-error'],
  ])('shows only "{n} available" %s', async (_, reply) => {
    const api = fakeApi()
    api.reply(reply(), reply())
    renderSite('/gloves', { api })
    await waitFor(() => expect(countRequests(api).length).toBeGreaterThan(0))
    await settle()
    for (const type of gloveTypes) {
      expect(typeCard(type.name)).toHaveTextContent(
        new RegExp(`(^|\\D)${type.finishes.length} available$`),
      )
    }
  })

  it('needs no second request on the type page within 5 minutes', async () => {
    const api = withCounts({ gloves: { specialist: finishes(SPECIALIST, 4) }, knives: {} })
    const { navigate } = renderSite('/gloves', { api })
    await waitFor(() => expect(typeCard(SPECIALIST.name)).toHaveTextContent('4 combos'))
    act(() => void navigate('/gloves/specialist'))
    expect(card(SPECIALIST.finishes[0].name)).toHaveTextContent(/4 combos$/)
    await settle()
    expect(countRequests(api)).toHaveLength(1)
  })
})

describe('pages without counts', () => {
  it('the home page, with the header search, sends no request', async () => {
    const { api } = renderSite('/')
    await settle()
    expect(api.requests).toHaveLength(0)
  })

  it('a combos page opened directly sends only its own request', async () => {
    const api = fakeApi()
    api.combos('/gloves/specialist/crimson-kimono/combos', combosOf(KIMONO, 1))
    renderSite('/gloves/specialist/crimson-kimono/combos', { api })
    expect(await screen.findByText('1 combo')).toBeInTheDocument()
    await settle()
    expect(api.requests.map((r) => new URL(r.url).pathname)).toEqual([
      '/gloves/specialist/crimson-kimono/combos',
    ])
  })
})
