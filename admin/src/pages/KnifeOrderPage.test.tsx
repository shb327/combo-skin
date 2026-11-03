import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { COMBO_MESSAGES } from '../combos/messages'
import { FakeApi, refusal } from '../test/fakeApi'
import { renderApp } from '../test/render'

const names = () =>
  within(screen.getByRole('list', { name: 'Knife types' }))
    .getAllByRole('listitem')
    .map((item) => item.querySelector('.font-semibold')?.textContent)

describe('the knife order page', () => {
  it('moves knife types with the keyboard and saves the whole order', async () => {
    const fake = new FakeApi().withSession()
    const { user } = renderApp('/knife-order', fake)
    await waitFor(() => expect(names()).toEqual(['Karambit', 'Butterfly Knife', 'M9 Bayonet']))
    expect(screen.queryByRole('button', { name: 'Move Karambit up' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Move M9 Bayonet down' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Save order' })).toBeDisabled()

    screen.getByRole('button', { name: 'Move Karambit down' }).focus()
    await user.keyboard('{Enter}')
    expect(names()).toEqual(['Butterfly Knife', 'Karambit', 'M9 Bayonet'])
    await waitFor(() => expect(screen.getByRole('button', { name: 'Move Karambit down' })).toHaveFocus())
    expect(screen.getByText('Karambit moved to position 2.')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Position of M9 Bayonet'), '1')
    expect(names()).toEqual(['M9 Bayonet', 'Butterfly Knife', 'Karambit'])

    await user.click(screen.getByRole('button', { name: 'Save order' }))
    expect(await screen.findByText('Saved the knife order.')).toBeInTheDocument()
    expect(JSON.parse(fake.to('PUT /admin/knife-order')[0].body)).toEqual({ slugs: ['m9-bayonet', 'butterfly', 'karambit'] })
    expect(screen.getByRole('button', { name: 'Save order' })).toBeDisabled()
  })

  it('moves focus to the other button at the top of the list', async () => {
    const { user } = renderApp('/knife-order', new FakeApi().withSession())
    await user.click(await screen.findByRole('button', { name: 'Move Butterfly Knife up' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Move Butterfly Knife down' })).toHaveFocus())
  })

  it('discards changes', async () => {
    const fake = new FakeApi().withSession()
    const { user } = renderApp('/knife-order', fake)
    await user.click(await screen.findByRole('button', { name: 'Move Karambit down' }))
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(names()).toEqual(['Karambit', 'Butterfly Knife', 'M9 Bayonet'])
    expect(fake.to('PUT /admin/knife-order')).toHaveLength(0)
  })

  it('asks for a reload when the knife types changed', async () => {
    const fake = new FakeApi().withSession()
    fake.next('PUT /admin/knife-order', refusal([['body', 'slugs'], 'knife_order_mismatch']))
    const { user } = renderApp('/knife-order', fake)
    await user.click(await screen.findByRole('button', { name: 'Move Karambit down' }))
    await user.click(screen.getByRole('button', { name: 'Save order' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(COMBO_MESSAGES.orderChanged)
    await user.click(screen.getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(fake.to('GET /admin/knife-order')).toHaveLength(2))
    expect(names()).toEqual(['Karambit', 'Butterfly Knife', 'M9 Bayonet'])
  })
})
