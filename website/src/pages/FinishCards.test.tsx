import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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
import { expectNoControl, expectNoCount, finishCards } from '@/test/finishPage'
import { renderSite } from '@/test/render'

const SPECIALIST = gloveTypes.find((t) => t.id === 'specialist')!
const KARAMBIT = knifeTypes.find((t) => t.id === 'karambit')!
const KIMONO = item({ type_slug: 'specialist', finish_slug: 'crimson-kimono' })

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
      if (link !== card(many) && link !== card(one)) expectNoCount(link)
    }
    expect(api.requests).toEqual([
      { url: `${ORIGIN}${COUNTS_PATH}`, method: 'GET', credentials: 'omit', redirect: 'error' },
    ])
  })

  /** Every finish of the type, each a link to its combos page, with no count. */
  function expectEveryFinishWithoutCounts(kind: string, type: typeof SPECIALIST) {
    expect(finishCards().map((link) => link.getAttribute('href'))).toEqual(
      type.finishes.map((finish) => `/${kind}/${type.id}/${finish.id}/combos`),
    )
    finishCards().forEach(expectNoCount)
  }

  it.each([
    ['/gloves/specialist', 'gloves', SPECIALIST],
    ['/knives/karambit', 'knives', KARAMBIT],
  ])('%s shows every finish, without counts or the filter, while the counts load', (path, kind, type) => {
    const api = fakeApi()
    api.reply(deferred().reply)
    renderSite(path, { api })
    expectEveryFinishWithoutCounts(kind, type)
    expectNoControl()
  })

  it.each([
    ['no response', (): 'network-error' => 'network-error'],
    ['a 500', () => json({ detail: 'oops' }, 500)],
    ['a count that is not a number', () => json({ gloves: { specialist: { mogul: '2' } }, knives: {} })],
    ['a count of 0', () => json({ gloves: { specialist: { mogul: 0 } }, knives: {} })],
    ['a negative count', () => json({ gloves: { specialist: { mogul: -1 } }, knives: {} })],
    ['a fractional count', () => json({ gloves: { specialist: { mogul: 1.5 } }, knives: {} })],
    ['no knives', () => json({ gloves: { specialist: { mogul: 2 } } })],
    ['a type that is not an object', () => json({ gloves: { specialist: 2 }, knives: {} })],
    ['a list', () => json([])],
  ])('shows every finish quietly after %s', async (_, reply) => {
    const api = fakeApi()
    api.reply(reply(), reply())
    renderSite('/gloves/specialist', { api })
    await waitFor(() => expect(countRequests(api)).toHaveLength(2))
    await settle()
    expectEveryFinishWithoutCounts('gloves', SPECIALIST)
    expectNoControl()
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
    expectNoCount(card('Mogul'))
    expect(countRequests(api)).toHaveLength(1)
  })

  it('keeps the counts\' own age when a combos page updates them', async () => {
    // Only the clock is faked: timers stay real for Testing Library's waits.
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const start = new Date('2026-11-04T12:00:00Z').getTime()
      vi.setSystemTime(start)
      const api = withCounts({ gloves: { specialist: { 'crimson-kimono': 18 } }, knives: {} })
      api.combos('/gloves/specialist/crimson-kimono/combos', combosOf(KIMONO, 19))
      const { navigate } = renderSite('/gloves/specialist', { api })
      expect(await within(card('Crimson Kimono')).findByText('18')).toBeInTheDocument()

      vi.setSystemTime(start + 4 * 60 * 1000)
      act(() => void navigate('/gloves/specialist/crimson-kimono/combos'))
      expect(await screen.findByText('19 combos')).toBeInTheDocument()

      // 5 minutes after the counts loaded, not after the combos page updated them.
      vi.setSystemTime(start + 5 * 60 * 1000 + 1000)
      api.counts({ gloves: { specialist: { 'crimson-kimono': 20 } }, knives: {} })
      act(() => void navigate('/gloves/specialist'))
      await waitFor(() => expect(countRequests(api)).toHaveLength(2))
      expect(await within(card('Crimson Kimono')).findByText('20')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('drops a counts answer that comes after the visitor left the page', async () => {
    const late = deferred()
    const api = fakeApi()
    api.reply(late.reply)
    api.combos('/gloves/specialist/crimson-kimono/combos', combosOf(KIMONO, 19))
    const { navigate, queryClient } = renderSite('/gloves/specialist', { api })
    await waitFor(() => expect(countRequests(api)).toHaveLength(1))

    act(() => void navigate('/gloves/specialist/crimson-kimono/combos'))
    expect(await screen.findByText('19 combos')).toBeInTheDocument()
    expect(api.signals[0].aborted).toBe(true)
    late.resolve(json({ gloves: { specialist: { 'crimson-kimono': 18 } }, knives: {} }))
    await settle()
    expect(queryClient.getQueryData(['combo-counts'])).toBeUndefined()

    api.counts({ gloves: { specialist: { 'crimson-kimono': 19 } }, knives: {} })
    act(() => void navigate('/gloves/specialist'))
    expect(await within(card('Crimson Kimono')).findByText('19')).toBeInTheDocument()
    expect(countRequests(api)).toHaveLength(2)
  })

  it('loads the counts once when the visitor starts on a combos page', async () => {
    // Different numbers, to show the card takes the counts' value.
    const api = withCounts({ gloves: { specialist: { 'crimson-kimono': 7 } }, knives: {} })
    api.combos('/gloves/specialist/crimson-kimono/combos', combosOf(KIMONO, 2))
    const { navigate } = renderSite('/gloves/specialist/crimson-kimono/combos', { api })
    expect(await screen.findByText('2 combos')).toBeInTheDocument()
    expect(countRequests(api)).toHaveLength(0)

    act(() => void navigate('/gloves/specialist'))
    expect(await within(card('Crimson Kimono')).findByText('7')).toBeInTheDocument()
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
    ['/gloves', 'while the counts load', () => deferred().reply],
    ['/gloves', 'after they fail', (): 'network-error' => 'network-error'],
    ['/knives', 'while the counts load', () => deferred().reply],
    ['/knives', 'after they fail', (): 'network-error' => 'network-error'],
  ])('%s shows only "{n} available" %s', async (path, _, reply) => {
    const api = fakeApi()
    api.reply(reply(), reply())
    renderSite(path, { api })
    await waitFor(() => expect(countRequests(api).length).toBeGreaterThan(0))
    await settle()
    for (const type of path === '/gloves' ? gloveTypes : knifeTypes) {
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

describe('finish pictures', () => {
  it('load our copy, keyed from the catalog, on finish cards and the combos page header', async () => {
    const site = renderSite('/gloves/specialist')
    const kimono = SPECIALIST.finishes.find((f) => f.id === 'crimson-kimono')!
    const picture = within(card('Crimson Kimono')).getByRole('img')
    expect(picture).toHaveAttribute('src', `http://localhost:9000/local-images/${kimono.image_key}`)
    expect(kimono.image_key).toMatch(/^catalog\/[0-9a-f]{32}\.png$/)

    act(() => void site.navigate('/gloves/specialist/crimson-kimono/combos'))
    const header = await screen.findByRole('img', { name: 'Specialist Gloves | Crimson Kimono' })
    expect(header).toHaveAttribute('src', `http://localhost:9000/local-images/${kimono.image_key}`)
    expect(header).toHaveAttribute('referrerpolicy', 'no-referrer')
  })
})
