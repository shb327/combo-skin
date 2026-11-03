import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FakeApi, json } from '../test/fakeApi'
import { renderApp, where } from '../test/render'

describe('finding a finish', () => {
  it('loads the glove catalog once and opens a finish with the keyboard alone', async () => {
    const { fake, user } = renderApp('/gloves', new FakeApi().withSession())
    const search = await screen.findByRole('combobox', { name: 'Find gloves' })
    expect(screen.getByRole('listbox', { hidden: true })).toBeInTheDocument()
    expect(fake.to('GET /gloves')).toHaveLength(1)
    expect(fake.to('GET /gloves/{type}')).toHaveLength(2)

    search.focus()
    await user.keyboard('kimono')
    expect(search).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Specialist Gloves | Crimson Kimono'])
    await user.keyboard('{ArrowDown}{Enter}')
    await waitFor(() => expect(where()).toBe('/gloves/specialist/crimson-kimono'))
    expect(await screen.findByRole('heading', { name: 'Specialist Gloves | Crimson Kimono' })).toBeInTheDocument()

    // Back to the search: the catalog is not loaded again.
    await user.click(screen.getAllByRole('link', { name: 'By gloves' })[0])
    await user.type(await screen.findByRole('combobox', { name: 'Find gloves' }), 'vice')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Sport Gloves | Vice'])
    expect(fake.to('GET /gloves')).toHaveLength(1)
    expect(fake.to('GET /gloves/{type}')).toHaveLength(2)
  })

  it('finds knives by words in any order, and moves through results', async () => {
    const { fake, user } = renderApp('/knives', new FakeApi().withSession())
    const search = await screen.findByRole('combobox', { name: 'Find a knife' })
    expect(fake.to('GET /knives/{type}')).toHaveLength(3)
    await user.type(search, 'ruby')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Butterfly Knife | Doppler (Ruby)',
      'Karambit | Doppler (Ruby)',
      'M9 Bayonet | Doppler (Ruby)',
    ])
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(search).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[1].id)
    await user.keyboard('{ArrowUp}{Escape}')
    expect(search).toHaveAttribute('aria-expanded', 'false')
    await user.clear(search)
    await user.type(search, 'RUBY kar')
    await user.keyboard('{ArrowDown}{Enter}')
    await waitFor(() => expect(where()).toBe('/knives/karambit/doppler-ruby'))
    await user.click(screen.getAllByRole('link', { name: 'By knife' })[0])
    await user.type(await screen.findByRole('combobox', { name: 'Find a knife' }), 'blue')
    expect(screen.getAllByRole('option')).toHaveLength(3)
    expect(fake.to('GET /knives')).toHaveLength(1)
    expect(fake.to('GET /knives/{type}')).toHaveLength(3)
  })

  it('shows at most 50 results, and asks for more words', async () => {
    const fake = new FakeApi().withSession()
    const many = Array.from({ length: 60 }, (_, i) => ({
      slug: `finish-${i}`, name: `Finish ${i}`, phase: null, display_name: `Finish ${i}`, paint_index: i,
      paint_codename: null, rarity: { code: 'c', name: 'Covert', color: '#eb4b4b' }, float_min: 0, float_max: 1,
      image_url: 'https://example.com/x.png', active: true,
    }))
    fake.next('GET /knives', json(200, [{ slug: 'karambit', name: 'Karambit', def_index: 507, codename: 'k', finish_count: 60 }]))
    fake.next('GET /knives/{type}', json(200, { slug: 'karambit', name: 'Karambit', def_index: 507, codename: 'k', finish_count: 60, finishes: many }))
    const { user } = renderApp('/knives', fake)
    await user.type(await screen.findByRole('combobox', { name: 'Find a knife' }), 'finish')
    expect(screen.getAllByRole('option')).toHaveLength(50)
    expect(screen.getByText('Type more to narrow the list.')).toBeInTheDocument()
  })
})
