import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FakeApi, json } from '../test/fakeApi'
import { renderApp } from '../test/render'

function withCombos() {
  const fake = new FakeApi().withSession()
  fake.store.add({ glove: 'specialist/crimson-kimono', knife: 'karambit/doppler-ruby', rating: 9, status: 'published' })
  fake.store.add({ glove: 'specialist/crimson-kimono', knife: 'butterfly/doppler-ruby', rating: 8 })
  fake.store.add({ glove: 'specialist/crimson-kimono', knife: 'm9-bayonet/doppler-ruby', rating: 7 })
  fake.store.add({ glove: 'sport/vice', knife: 'karambit/vanilla', rating: 6 })
  return fake
}

const cards = (name: string) => within(screen.getByRole('list', { name })).getAllByRole('link')

describe('browsing types', () => {
  it('lists the glove types under the search, from the catalog already loaded', async () => {
    const { fake } = renderApp('/gloves', new FakeApi().withSession())
    await screen.findByRole('combobox', { name: 'Find gloves' })
    const types = cards('Glove types')
    expect(types.map((t) => t.textContent)).toEqual(['Specialist Gloves2 finishes', 'Sport Gloves2 finishes'])
    expect(types.map((t) => t.getAttribute('href'))).toEqual(['/gloves/specialist', '/gloves/sport'])
    expect(fake.to('GET /gloves')).toHaveLength(1)
    expect(fake.to('GET /gloves/{type}')).toHaveLength(2)
    expect(document.querySelector('main img')).toBeNull()
  })

  it('lists the knife types', async () => {
    const { fake } = renderApp('/knives', new FakeApi().withSession())
    await screen.findByRole('combobox', { name: 'Find a knife' })
    expect(cards('Knife types').map((t) => t.textContent)).toEqual([
      'Butterfly Knife3 finishes',
      'Karambit4 finishes',
      'M9 Bayonet3 finishes',
    ])
    expect(fake.to('GET /knives/{type}')).toHaveLength(3)
  })
})

describe('a type page', () => {
  it('lists the glove finishes with their range and combo counts, from one request', async () => {
    const { fake } = renderApp('/gloves/specialist', withCombos())
    expect(await screen.findByRole('heading', { name: 'Specialist Gloves' })).toBeInTheDocument()
    await waitFor(() => expect(cards('Finishes')[0]).toHaveTextContent('3 combos · 2 drafts'))
    const finishes = cards('Finishes')
    expect(finishes.map((f) => f.getAttribute('href'))).toEqual([
      '/gloves/specialist/crimson-kimono',
      '/gloves/specialist/fade',
    ])
    expect(finishes[0]).toHaveTextContent('Crimson Kimono')
    expect(finishes[0]).toHaveTextContent('Float 0.06 – 0.80')
    expect(finishes[1]).toHaveTextContent('Fade')
    expect(finishes[1]).toHaveTextContent('No combos yet')
    const [request] = fake.to('GET /admin/combos')
    expect(Object.fromEntries(new URL(request.url).searchParams)).toEqual({ glove_type: 'specialist', limit: '500', offset: '0' })
    expect(fake.to('GET /admin/combos')).toHaveLength(1)
    await waitFor(() => expect(document.title).toBe('Specialist Gloves · Combo Skin admin'))
    expect(document.querySelector('main img')).toBeNull()
  })

  it('lists the knife finishes, Vanilla without a range', async () => {
    renderApp('/knives/karambit', withCombos())
    expect(await screen.findByRole('heading', { name: 'Karambit' })).toBeInTheDocument()
    await waitFor(() => expect(cards('Finishes')[0]).toHaveTextContent('1 combo · 1 draft'))
    const finishes = cards('Finishes')
    expect(finishes.map((f) => f.getAttribute('href'))).toEqual([
      '/knives/karambit/vanilla',
      '/knives/karambit/doppler-ruby',
      '/knives/karambit/doppler-sapphire',
      '/knives/karambit/blue-steel',
    ])
    expect(finishes[0]).toHaveTextContent('No float range')
    expect(finishes[1]).toHaveTextContent('Doppler (Ruby)')
    expect(finishes[1]).toHaveTextContent('1 combo')
    expect(finishes[1]).not.toHaveTextContent('draft')
  })

  it('counts combos over further pages', async () => {
    const fake = withCombos()
    const [first] = fake.store.combos
    const page = Array.from({ length: 500 }, (_, i) => ({ ...first, id: `p${String(i).padStart(11, '0')}` }))
    fake.next('GET /admin/combos', json(200, { total: 501, items: page }), json(200, { total: 501, items: [first] }))
    renderApp('/gloves/specialist', fake)
    await waitFor(() => expect(fake.to('GET /admin/combos')).toHaveLength(2))
    expect(new URL(fake.to('GET /admin/combos')[1].url).searchParams.get('offset')).toBe('500')
    await waitFor(() => expect(cards('Finishes')[0]).toHaveTextContent('501 combos'))
  })

  it('says an unknown type was not found, with a way back', async () => {
    renderApp('/gloves/nope', new FakeApi().withSession())
    expect(await screen.findByText('This type was not found.')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Back to By gloves' })[0]).toHaveAttribute('href', '/gloves')
  })
})

describe('finish pages', () => {
  it.each([
    ['/gloves/specialist/crimson-kimono', 'Specialist Gloves', '/gloves/specialist'],
    ['/knives/karambit/doppler-ruby', 'Karambit', '/knives/karambit'],
  ])('%s links to its type', async (path, type, href) => {
    renderApp(path, new FakeApi().withSession())
    expect(await screen.findByRole('link', { name: type })).toHaveAttribute('href', href)
  })
})
