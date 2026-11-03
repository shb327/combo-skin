import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FakeApi } from '../test/fakeApi'
import { renderApp, where } from '../test/render'

describe('finding a finish', () => {
  it('loads the glove catalog once and opens a finish with the keyboard alone', async () => {
    const { fake, user } = renderApp('/gloves', new FakeApi().withSession())
    const search = await screen.findByRole('combobox', { name: 'Find gloves' })
    expect(screen.getByRole('listbox', { hidden: true })).toBeInTheDocument()
    expect(fake.to('GET /gloves')).toHaveLength(1)
    expect(fake.to('GET /gloves/{type}')).toHaveLength(2)

    await user.type(search, 'kimono')
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
    await user.keyboard('{Enter}')
    await waitFor(() => expect(where()).toBe('/knives/karambit/doppler-ruby'))
  })
})
