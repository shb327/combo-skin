import { onlineManager } from '@tanstack/react-query'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  KARAMBIT_RUBY,
  MOGUL,
  ORIGIN,
  combo,
  deferred,
  fakeApi,
  item,
  json,
  notFound,
} from '@/test/fakeApi'
import { renderSite } from '@/test/render'

const MOGUL_PATH = '/gloves/specialist/mogul/combos'
const RUBY_PATH = '/knives/karambit/doppler-ruby/combos'

const M9 = item({
  type_slug: 'm9-bayonet',
  type_name: 'M9 Bayonet',
  finish_slug: 'urban-masked',
  display_name: 'Urban Masked',
})
const BUTTERFLY = item({
  type_slug: 'butterfly',
  type_name: 'Butterfly Knife',
  finish_slug: 'fade',
  display_name: 'Fade',
})
const KIMONO = item({
  type_slug: 'specialist',
  type_name: 'Specialist Gloves',
  finish_slug: 'crimson-kimono',
  display_name: 'Crimson Kimono',
})
const PANDORA = item({
  type_slug: 'sport',
  type_name: 'Sport Gloves',
  finish_slug: 'pandoras-box',
  display_name: "Pandora's Box",
})

// The catalog's Vanilla knives have no float range, so no float or pattern to choose.
const BAYONET_VANILLA = item({
  type_slug: 'bayonet',
  type_name: 'Bayonet',
  finish_slug: 'vanilla',
  display_name: 'Vanilla',
  float_min: null,
  float_max: null,
})

const cards = () => screen.queryAllByRole('article')
/** A card's condition rows, as "Glove Pattern: 2, 179". */
const conditions = (card: HTMLElement) =>
  Array.from(card.querySelectorAll('.border-t > div'), (row) => row.textContent)
/** The line under the finish name: the number of combos, or null when there is none. */
const countLine = () =>
  screen.getByRole('heading', { level: 1 }).nextElementSibling?.textContent ?? null
const titles = () => cards().map((card) => within(card).getByRole('heading').textContent)

async function loaded() {
  await waitFor(() => expect(screen.queryByText('Loading combos…')).not.toBeInTheDocument())
}

describe('a glove finish page', () => {
  it('lists the published combos in the order the API returns them', async () => {
    const api = fakeApi()
    // Not by rating: the page keeps the API's order.
    api.combos(MOGUL_PATH, [
      combo('a', 7.5, MOGUL, M9),
      combo('b', 9.5, MOGUL, KARAMBIT_RUBY),
      combo('c', 8.88, MOGUL, BUTTERFLY),
    ])
    renderSite(MOGUL_PATH, { api })
    await loaded()

    expect(titles()).toEqual([
      'M9 Bayonet | Urban Masked',
      'Karambit | Doppler (Ruby)',
      'Butterfly Knife | Fade',
    ])
    expect(api.requests).toEqual([
      { url: `${ORIGIN}${MOGUL_PATH}`, method: 'GET', credentials: 'omit', redirect: 'error' },
    ])
  })

  it('shows the rating, conditions and description of a combo', async () => {
    const api = fakeApi()
    api.combos(MOGUL_PATH, [
      combo(
        'a',
        8.88,
        { ...MOGUL, seeds: [2, 179] },
        { ...KARAMBIT_RUBY, float_from: 0, float_to: 0.01 },
        'Any ruby works.\nThe darker the better.',
      ),
      combo('b', 9.5, MOGUL, M9),
      combo('c', 7.6, MOGUL, BUTTERFLY),
    ])
    renderSite(MOGUL_PATH, { api })
    await loaded()

    const [first, second, third] = cards()
    expect(within(first).getByRole('heading')).toHaveTextContent('Karambit | Doppler (Ruby)')
    expect(within(first).getByText('8.88')).toHaveStyle({ color: '#00DE12' })
    expect(within(second).getByText('9.5')).toHaveStyle({ color: '#00DE12' })
    expect(within(third).getByText('7.6')).toHaveStyle({ color: '#84cc16' })

    const description = within(first).getByText(/Any ruby works/)
    expect(description.textContent).toBe('Any ruby works.\nThe darker the better.')

    expect(second).not.toHaveTextContent('No description available.')
    expect(second.querySelectorAll('p')).toHaveLength(0)
  })

  it('shows the four conditions in order, with the values a combo sets', async () => {
    const api = fakeApi()
    api.combos(MOGUL_PATH, [
      combo('a', 8, { ...MOGUL, seeds: [2, 179] }, { ...KARAMBIT_RUBY, float_from: 0, float_to: 0.01 }),
    ])
    renderSite(MOGUL_PATH, { api })
    await loaded()

    expect(conditions(cards()[0])).toEqual([
      'Glove Pattern: 2, 179',
      'Knife Pattern: Any',
      'Glove Float: Any',
      'Knife Float: 0 - 0.01',
    ])
  })

  it('says "Any" for every condition a combo leaves open', async () => {
    const api = fakeApi()
    api.combos(MOGUL_PATH, [combo('a', 8, MOGUL, M9)])
    renderSite(MOGUL_PATH, { api })
    await loaded()

    expect(conditions(cards()[0])).toEqual([
      'Glove Pattern: Any',
      'Knife Pattern: Any',
      'Glove Float: Any',
      'Knife Float: Any',
    ])
  })

  it('says "None" for the pattern and float of a Vanilla knife', async () => {
    const api = fakeApi()
    api.combos(MOGUL_PATH, [combo('a', 8, MOGUL, BAYONET_VANILLA)])
    renderSite(MOGUL_PATH, { api })
    await loaded()

    expect(conditions(cards()[0])).toEqual([
      'Glove Pattern: Any',
      'Knife Pattern: None',
      'Glove Float: Any',
      'Knife Float: None',
    ])
  })

  it('shows a description as text, never as HTML', async () => {
    const api = fakeApi()
    api.combos(MOGUL_PATH, [combo('a', 8, MOGUL, M9, '<b>x</b>')])
    renderSite(MOGUL_PATH, { api })
    await loaded()

    const [card] = cards()
    expect(within(card).getByText('<b>x</b>')).toBeInTheDocument()
    expect(card.querySelector('b')).toBeNull()
  })

  it('shows the glove and the knife pictures side by side', async () => {
    const api = fakeApi()
    api.combos(MOGUL_PATH, [
      combo('a', 8, MOGUL, KARAMBIT_RUBY),
      combo('b', 7, MOGUL, { ...M9, image_url: 'https://example.com/m9.png' }),
    ])
    renderSite(MOGUL_PATH, { api })
    await loaded()

    const [first, second] = cards()
    const pictures = within(first).getAllByRole('img')
    expect(pictures.map((p) => p.getAttribute('alt'))).toEqual([
      'Specialist Gloves | Mogul',
      'Karambit | Doppler (Ruby)',
    ])
    expect(pictures.map((p) => p.getAttribute('src'))).toEqual([MOGUL.image_url, KARAMBIT_RUBY.image_url])
    for (const picture of pictures) {
      expect(picture).toHaveAttribute('loading', 'lazy')
      expect(picture).toHaveAttribute('referrerpolicy', 'no-referrer')
    }
    // A picture off the image host is not shown; its half stays empty.
    expect(within(second).getAllByRole('img').map((p) => p.getAttribute('alt'))).toEqual([
      'Specialist Gloves | Mogul',
    ])
  })

  it('says it is loading, then counts the combos', async () => {
    const api = fakeApi()
    const answer = deferred()
    api.reply(answer.reply)
    renderSite(MOGUL_PATH, { api })

    expect(await screen.findByText('Loading combos…')).toBeInTheDocument()
    expect(countLine()).toBeNull()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Specialist Gloves | Mogul')

    answer.resolve(json([combo('a', 8, MOGUL, M9), combo('b', 7, MOGUL, KARAMBIT_RUBY), combo('c', 6, MOGUL, BUTTERFLY)]))
    expect(await screen.findByText('3 combos')).toBeInTheDocument()
    expect(screen.queryByText('Loading combos…')).toBeNull()
  })

  it('says "1 combo" for one', async () => {
    const api = fakeApi()
    api.combos(MOGUL_PATH, [combo('a', 8, MOGUL, M9)])
    renderSite(MOGUL_PATH, { api })
    expect(await screen.findByText('1 combo')).toBeInTheDocument()
  })

  it('says "No combos yet" once when there are none', async () => {
    const api = fakeApi()
    api.combos(MOGUL_PATH, [])
    renderSite(MOGUL_PATH, { api })
    expect(await screen.findByText('No combos yet')).toBeInTheDocument()
    expect(screen.getAllByText(/No combos/)).toHaveLength(1)
    expect(cards()).toHaveLength(0)
  })
})

describe('a knife finish page', () => {
  it('lists its combos, titled with the gloves', async () => {
    const api = fakeApi()
    api.combos(RUBY_PATH, [
      combo('a', 9, KIMONO, KARAMBIT_RUBY),
      combo('b', 8, MOGUL, KARAMBIT_RUBY),
      combo('c', 8, PANDORA, KARAMBIT_RUBY),
    ])
    renderSite(RUBY_PATH, { api })

    expect(await screen.findByText('3 combos')).toBeInTheDocument()
    expect(titles()).toEqual([
      'Specialist Gloves | Crimson Kimono',
      'Specialist Gloves | Mogul',
      "Sport Gloves | Pandora's Box",
    ])
    expect(api.requests.map((r) => r.url)).toEqual([`${ORIGIN}${RUBY_PATH}`])
  })
})

describe("links to the other item's combos", () => {
  it('takes a glove page card to its knife finish page, inside the site', async () => {
    const api = fakeApi()
    api.combos(MOGUL_PATH, [combo('a', 8, MOGUL, KARAMBIT_RUBY)])
    api.combos(RUBY_PATH, [combo('b', 9, KIMONO, KARAMBIT_RUBY)])
    renderSite(MOGUL_PATH, { api })
    await loaded()

    // The arrow is decoration: the exact name leaves it out.
    const link = within(cards()[0]).getByRole('link', { name: 'See all Karambit | Doppler (Ruby) combos' })
    expect(link).toHaveAttribute('href', RUBY_PATH)
    expect(link).toHaveTextContent('See all Karambit | Doppler (Ruby) combos →')

    // A MemoryRouter page changes only through the router: a plain link would leave it here.
    await userEvent.click(link)
    expect(await screen.findByText('Specialist Gloves | Crimson Kimono')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Karambit | Doppler (Ruby)')
    expect(api.requests.map((r) => new URL(r.url).pathname)).toEqual([MOGUL_PATH, RUBY_PATH])
  })

  it('takes a knife page card to its glove finish page', async () => {
    const api = fakeApi()
    api.combos(RUBY_PATH, [combo('a', 9, KIMONO, KARAMBIT_RUBY)])
    renderSite(RUBY_PATH, { api })
    await loaded()

    const link = within(cards()[0]).getByRole('link', {
      name: 'See all Specialist Gloves | Crimson Kimono combos',
    })
    expect(link).toHaveAttribute('href', '/gloves/specialist/crimson-kimono/combos')
  })

  it('leaves the link out when the site does not know the other finish', async () => {
    const api = fakeApi()
    const retired = item({
      type_slug: 'karambit',
      type_name: 'Karambit',
      finish_slug: 'retired-finish',
      display_name: 'Retired Finish',
      active: false,
    })
    api.combos(MOGUL_PATH, [combo('a', 8.5, MOGUL, retired)])
    renderSite(MOGUL_PATH, { api })
    await loaded()

    const [card] = cards()
    expect(within(card).queryByRole('link')).toBeNull()
    expect(card).not.toHaveTextContent('See all')
    expect(within(card).getByRole('heading')).toHaveTextContent('Karambit | Retired Finish')
    expect(within(card).getByText('8.5')).toBeInTheDocument()
    expect(conditions(card)).toHaveLength(4)
  })
})

describe('failures', () => {
  afterEach(() => {
    onlineManager.setOnline(true)
  })

  it('hides the count when a later refresh fails', async () => {
    const api = fakeApi()
    api.combos(MOGUL_PATH, [combo('a', 8, MOGUL, M9)])
    const site = renderSite(MOGUL_PATH, { api })
    expect(await screen.findByText('1 combo')).toBeInTheDocument()

    api.reply('network-error', 'network-error')
    await act(() => site.queryClient.refetchQueries().catch(() => {}))

    expect(await screen.findByText('Combos could not be loaded.')).toBeInTheDocument()
    expect(countLine()).toBeNull()
    expect(cards()).toHaveLength(0)
  })

  it('says the combos could not be loaded when the browser is offline', async () => {
    onlineManager.setOnline(false)
    const api = fakeApi()
    api.reply('network-error', 'network-error')
    renderSite(MOGUL_PATH, { api })

    expect(await screen.findByText('Combos could not be loaded.')).toBeInTheDocument()
    expect(api.requests).toHaveLength(2)

    api.combos(MOGUL_PATH, [combo('a', 8, MOGUL, M9)])
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('1 combo')).toBeInTheDocument()
  })

  it('says the finish was not found on a 404, without retrying', async () => {
    const api = fakeApi()
    api.reply(notFound())
    renderSite(MOGUL_PATH, { api })

    expect(await screen.findByText('This finish was not found.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(countLine()).toBeNull()
    expect(api.requests).toHaveLength(1)
  })

  it.each([
    ['no response', () => 'network-error' as const],
    ['a 500', () => json({ detail: 'internal' }, 500)],
    ['a body that is not a list', () => json({ items: [] })],
  ])('retries once after %s, then offers to try again', async (_, failure) => {
    const api = fakeApi()
    api.reply(failure(), failure())
    renderSite(MOGUL_PATH, { api })

    expect(await screen.findByText('Combos could not be loaded.')).toBeInTheDocument()
    expect(api.requests).toHaveLength(2)
    expect(countLine()).toBeNull()

    api.combos(MOGUL_PATH, [combo('a', 8, MOGUL, M9)])
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('1 combo')).toBeInTheDocument()
    expect(titles()).toEqual(['M9 Bayonet | Urban Masked'])
    expect(api.requests).toHaveLength(3)
    expect(screen.queryByText('Combos could not be loaded.')).toBeNull()
  })
})

describe('finishes the site does not know', () => {
  it.each(['/gloves/specialist/nope/combos', '/knives/nope/vanilla/combos'])(
    '%s shows "Item not found" and sends no request',
    async (path) => {
      const api = fakeApi()
      renderSite(path, { api })
      expect(screen.getByText('Item not found')).toBeInTheDocument()
      await new Promise((done) => setTimeout(done, 20))
      expect(api.requests).toHaveLength(0)
    },
  )
})

describe('the cache', () => {
  it('shows a page again without a new request when coming back', async () => {
    const api = fakeApi()
    api.combos(MOGUL_PATH, [combo('a', 8, MOGUL, M9)])
    api.combos(RUBY_PATH, [combo('b', 9, KIMONO, KARAMBIT_RUBY)])
    const site = renderSite(MOGUL_PATH, { api })
    expect(await screen.findByText('1 combo')).toBeInTheDocument()

    site.navigate(RUBY_PATH)
    expect(await screen.findByText('Specialist Gloves | Crimson Kimono')).toBeInTheDocument()
    site.navigate(MOGUL_PATH)
    expect(await screen.findByText('M9 Bayonet | Urban Masked')).toBeInTheDocument()
    expect(screen.queryByText('Loading combos…')).toBeNull()
    expect(api.requests.map((r) => new URL(r.url).pathname)).toEqual([MOGUL_PATH, RUBY_PATH])
  })

  it('asks again only once 5 minutes have passed', async () => {
    // Only the clock is faked: timers stay real for Testing Library's waits.
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const start = new Date('2026-11-04T12:00:00Z').getTime()
      vi.setSystemTime(start)
      const api = fakeApi()
      api.combos(MOGUL_PATH, [combo('a', 8, MOGUL, M9)])
      api.combos(RUBY_PATH, [combo('b', 9, KIMONO, KARAMBIT_RUBY)])
      const site = renderSite(MOGUL_PATH, { api })
      expect(await screen.findByText('M9 Bayonet | Urban Masked')).toBeInTheDocument()
      const mogulRequests = () => api.requests.filter((r) => r.url.endsWith(MOGUL_PATH)).length

      site.navigate(RUBY_PATH)
      expect(await screen.findByText('Specialist Gloves | Crimson Kimono')).toBeInTheDocument()
      vi.setSystemTime(start + 4 * 60 * 1000 + 59 * 1000)
      site.navigate(MOGUL_PATH)
      expect(await screen.findByText('M9 Bayonet | Urban Masked')).toBeInTheDocument()
      await new Promise((done) => setTimeout(done, 20))
      expect(mogulRequests()).toBe(1)

      site.navigate(RUBY_PATH)
      expect(await screen.findByText('Specialist Gloves | Crimson Kimono')).toBeInTheDocument()
      vi.setSystemTime(start + 5 * 60 * 1000 + 1000)
      site.navigate(MOGUL_PATH)
      await waitFor(() => expect(mogulRequests()).toBe(2))
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not refetch on window focus', async () => {
    const { createQueryClient } = await import('@/api/queries')
    expect(createQueryClient().getDefaultOptions().queries?.refetchOnWindowFocus).toBe(false)
  })
})
