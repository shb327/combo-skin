import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FakeApi } from '../test/fakeApi'
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
    const [count] = fake.to('GET /admin/combos')
    expect(Object.fromEntries(new URL(count.url).searchParams)).toEqual({ status: 'draft', limit: '1' })

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
    expect(headings).toEqual(['Combos', 'Drafts', 'Knife order'])
    const order = within(main).getByRole('link', { name: 'Change the order' })
    expect(order).toHaveAttribute('href', '/knife-order')
    expect(within(main).queryByRole('link', { name: /^Knife order/ })).toBeNull()
  })
})
