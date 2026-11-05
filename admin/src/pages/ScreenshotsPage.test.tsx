import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FakeApi } from '../test/fakeApi'
import { renderApp, where } from '../test/render'

function withCombos() {
  const fake = new FakeApi().withSession()
  fake.store.add({ glove: 'specialist/crimson-kimono', knife: 'karambit/doppler-ruby', rating: 9 })
  fake.store.add({ glove: 'specialist/crimson-kimono', knife: 'butterfly/doppler-ruby', rating: 8 })
  fake.store.add({ glove: 'specialist/crimson-kimono', knife: 'm9-bayonet/doppler-ruby', rating: 7, agent: 4613 })
  return fake
}

describe('the screenshots page', () => {
  it('is reached from Home', async () => {
    const { user } = renderApp('/', new FakeApi().withSession())
    await user.click(await screen.findByRole('link', { name: 'Change the default agent' }))
    await waitFor(() => expect(where()).toBe('/screenshots'))
    expect(await screen.findByRole('heading', { name: 'Screenshots' })).toBeInTheDocument()
    expect(document.title).toBe('Screenshots · Combo Skin admin')
  })

  it('changes the default agent after a confirmation with the number of combos using it', async () => {
    const fake = withCombos()
    const { user } = renderApp('/screenshots', fake)
    const current = await screen.findByRole('group', { name: 'Default agent' })
    expect(await within(current).findByText('Lt. Commander Ricksaw | NSWC SEAL')).toBeInTheDocument()
    expect(screen.getByText('2 combos use the default agent.')).toBeInTheDocument()
    expect(within(current).queryByRole('button', { name: 'Use default' })).toBeNull()

    await user.type(within(current).getByRole('combobox', { name: 'Find an agent' }), 'default')
    expect(within(current).queryByRole('option', { name: /Default/ })).toBeNull()
    await user.clear(within(current).getByRole('combobox'))
    await user.type(within(current).getByRole('combobox'), 'darryl')
    await user.keyboard('{ArrowDown}{Enter}')
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Make Bloody Darryl The Strapped | The Professionals the default agent?')
    expect(dialog).toHaveTextContent('2 combos use the default agent.')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(fake.to('PUT /admin/screenshot-settings')).toHaveLength(0)
    expect(within(current).getByText('Lt. Commander Ricksaw | NSWC SEAL')).toBeInTheDocument()

    await user.type(within(current).getByRole('combobox'), 'darryl')
    await user.keyboard('{ArrowDown}{Enter}')
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Change default' }))
    expect(await screen.findByText('Saved the default agent.')).toBeInTheDocument()
    expect(JSON.parse(fake.to('PUT /admin/screenshot-settings')[0].body)).toEqual({ default_agent: 4613 })
    expect(within(current).getByText('Bloody Darryl The Strapped | The Professionals')).toBeInTheDocument()
  })

  it('shows a retired default agent by name and picture', async () => {
    const fake = new FakeApi().withSession()
    fake.store.defaultAgent = 5305
    renderApp('/screenshots', fake)
    const current = await screen.findByRole('group', { name: 'Default agent' })
    expect(await within(current).findByText('Operator | FBI SWAT')).toBeInTheDocument()
    expect(within(current).getByText('No longer in the game')).toBeInTheDocument()
    expect(current.querySelector('img')?.getAttribute('src')).toMatch(/fake\/agent\/5305$/)
  })
})
