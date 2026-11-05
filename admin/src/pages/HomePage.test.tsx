import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FakeApi, error } from '../test/fakeApi'
import { picture } from '../test/fakeCatalog'
import { renderApp } from '../test/render'

function withDrafts() {
  const fake = new FakeApi().withSession()
  for (const knife of ['karambit', 'butterfly', 'm9-bayonet']) {
    fake.store.add({ glove: 'specialist/crimson-kimono', knife: `${knife}/doppler-ruby`, rating: 9 })
  }
  fake.store.add({ glove: 'sport/vice', knife: 'karambit/doppler-ruby', rating: 8, status: 'unpublished' })
  return fake
}

describe('publish all drafts', () => {
  it('shows the draft count and publishes only drafts after confirmation', async () => {
    const fake = withDrafts()
    const { user } = renderApp('/', fake)
    expect(await screen.findByText('3 drafts across all finishes.')).toBeInTheDocument()
    // The draft count is its own small request, beside the statistics' full list.
    const count = fake.to('GET /admin/combos').find((r) => new URL(r.url).searchParams.has('status'))
    expect(Object.fromEntries(new URL(count?.url ?? '').searchParams)).toEqual({ status: 'draft', limit: '1' })

    await user.click(screen.getByRole('button', { name: 'Publish all drafts' }))
    let dialog = screen.getByRole('dialog', { name: 'Publish all 3 drafts?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(fake.to('POST /admin/combos/publish')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Publish all drafts' }))
    dialog = screen.getByRole('dialog', { name: 'Publish all 3 drafts?' })
    await user.click(within(dialog).getByRole('button', { name: 'Publish all' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Published 3 drafts.')
    expect(JSON.parse(fake.to('POST /admin/combos/publish')[0].body)).toEqual({ all_drafts: true })
    expect(fake.store.combos.map((c) => c.status)).toEqual(['published', 'published', 'published', 'unpublished'])
    await waitFor(() => expect(screen.getByText('0 drafts across all finishes.')).toBeInTheDocument())
  })
})

describe('home', () => {
  it('shows pictures on the two directions, then Drafts, then the knife order', async () => {
    const { fake } = renderApp('/', withDrafts())
    const main = await screen.findByRole('main')
    const gloves = within(main).getByRole('link', { name: /By gloves/ })
    const knives = within(main).getByRole('link', { name: /By knife/ })
    await waitFor(() => expect(gloves.querySelector('img')?.getAttribute('src')).toBe(picture('sport', 'pandoras-box')))
    await waitFor(() => expect(knives.querySelector('img')?.getAttribute('src')).toBe(picture('karambit', 'vanilla')))
    expect(fake.to('GET /gloves/{type}/{finish}')).toHaveLength(1)
    expect(fake.to('GET /knives/{type}/{finish}')).toHaveLength(1)
    const headings = within(main).getAllByRole('heading').map((h) => h.textContent)
    expect(headings).toEqual(['Combos', 'Drafts', 'Knife order', 'Screenshots'])
    const order = within(main).getByRole('link', { name: 'Change the order' })
    expect(order).toHaveAttribute('href', '/knife-order')
    expect(within(main).queryByRole('link', { name: /^Knife order/ })).toBeNull()
  })
})

describe('statistics', () => {
  const figures = () => within(screen.getByRole('region', { name: 'Statistics' })).getAllByRole('listitem').map((f) => f.textContent)

  it('count combos, and glove and knife finishes without a combo, following new combos', async () => {
    const { user } = renderApp('/', withDrafts())
    await waitFor(() =>
      expect(figures()).toEqual([
        '4combos',
        '2 of 4glove finishes without a combo',
        '7 of 10knife finishes without a combo',
      ]),
    )

    // Add a combo on Sport Gloves | Pandora's Box with Butterfly Knife | Blue Steel, then come back.
    window.history.pushState(null, '', '/gloves/sport/pandoras-box/add')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await user.type(await screen.findByRole('combobox', { name: 'Find a knife' }), 'butterfly blue{Enter}')
    await user.type(screen.getByLabelText('Rating'), '8')
    await user.click(screen.getByRole('button', { name: 'Save as draft' }))
    await screen.findByText(/Saved a draft/)
    await user.click(within(screen.getByRole('navigation')).getByRole('link', { name: 'Home' }))
    await waitFor(() =>
      expect(figures()).toEqual([
        '5combos',
        '1 of 4glove finishes without a combo',
        '6 of 10knife finishes without a combo',
      ]),
    )
  })

  it('show an error with Try again when the combos cannot be loaded', async () => {
    const fake = withDrafts()
    fake.next('GET /admin/combos', error(500, 'boom'), error(500, 'boom'), error(500, 'boom'))
    renderApp('/', fake)
    const section = await screen.findByRole('region', { name: 'Statistics' })
    expect(await within(section).findByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
