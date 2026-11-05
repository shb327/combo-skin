import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { COMBO_MESSAGES } from '../combos/messages'
import { FakeApi, error } from '../test/fakeApi'
import { renderApp, where } from '../test/render'

function withCombo(status: 'draft' | 'published' = 'draft') {
  const fake = new FakeApi().withSession()
  const combo = fake.store.add({
    glove: 'specialist/crimson-kimono',
    knife: 'karambit/doppler-ruby',
    rating: 9.1,
    status,
    description: 'Red',
    knifeConditions: { float_from: 0, float_to: 0.01 },
  })
  return { fake, combo, path: `/combos/${combo.id}` }
}

describe('editing a combo', () => {
  it('shows the pairing, status and history, and saves with the version read', async () => {
    const { fake, combo, path } = withCombo()
    const { user } = renderApp(path, fake)
    expect(await screen.findByRole('heading', { name: 'Edit combo' })).toBeInTheDocument()
    const main = screen.getByRole('main')
    expect(main).toHaveTextContent('Specialist Gloves | Crimson Kimono with Karambit | Doppler (Ruby)')
    expect(main).toHaveTextContent('Draft')
    expect(main).toHaveTextContent('Version 1')
    expect(main).toHaveTextContent(/Created .* by placeholder-admin/)
    expect(main).toHaveTextContent(/Last changed .* by placeholder-admin/)
    // The pairing has no inputs: the only search is the screenshot agent's.
    expect(screen.getAllByRole('combobox').map((input) => input.id)).toEqual(['edit-agent'])
    expect(screen.getByLabelText('Rating')).toHaveValue('9.10')
    expect(within(screen.getByRole('group', { name: 'Knife' })).getByLabelText('Float to')).toHaveValue('0.01')

    await user.clear(screen.getByLabelText('Rating'))
    await user.type(screen.getByLabelText('Rating'), '9.2')
    await user.clear(screen.getByLabelText('Description'))
    await user.type(within(screen.getByRole('group', { name: 'Gloves' })).getByLabelText('Pattern seeds'), '5')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Saved. Version 2.')).toBeInTheDocument()
    const [request] = fake.to('PUT /admin/combos/{id}')
    expect(new URL(request.url).pathname).toBe(`/admin/combos/${combo.id}`)
    expect(JSON.parse(request.body)).toEqual({
      version: 1,
      rating: 9.2,
      description: null,
      glove: { float_from: null, float_to: null, seeds: [5] },
      knife: { float_from: 0, float_to: 0.01, seeds: [] },
      screenshot_agent: null,
    })
    expect(screen.getByRole('main')).toHaveTextContent('Version 2')
  })

  it('shows a conflict with their values and ours, then keeps ours over the new version', async () => {
    const { fake, combo, path } = withCombo()
    const { user } = renderApp(path, fake)
    await user.clear(await screen.findByLabelText('Rating'))
    await user.type(screen.getByLabelText('Rating'), '8')
    fake.store.changeAsAnother(combo.id, { rating: 7.5 })
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(COMBO_MESSAGES.conflict)
    expect(fake.to('GET /admin/combos/{id}')).toHaveLength(2)
    expect(screen.getByRole('main')).toHaveTextContent(/Changed by another-admin at .* \(version 2\)/)
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('row').map((r) => r.textContent)).toEqual(['FieldTheirsYours', 'Rating7.508.00'])

    await user.click(screen.getByRole('button', { name: 'Keep mine' }))
    expect(screen.getByLabelText('Rating')).toHaveValue('8.00')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Saved. Version 3.')).toBeInTheDocument()
    expect(JSON.parse(fake.to('PUT /admin/combos/{id}')[1].body)).toMatchObject({ version: 2, rating: 8 })
  })

  it('takes their values', async () => {
    const { fake, combo, path } = withCombo()
    const { user } = renderApp(path, fake)
    await user.clear(await screen.findByLabelText('Rating'))
    await user.type(screen.getByLabelText('Rating'), '8')
    fake.store.changeAsAnother(combo.id, { rating: 7.5, description: 'Theirs' })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(await screen.findByRole('button', { name: 'Use theirs' }))
    expect(screen.getByLabelText('Rating')).toHaveValue('7.50')
    expect(screen.getByLabelText('Description')).toHaveValue('Theirs')
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('says when the combo no longer exists', async () => {
    const { fake, path } = withCombo()
    fake.next('GET /admin/combos/{id}', error(404, 'combo_not_found'))
    renderApp(path, fake)
    expect(await screen.findByText(COMBO_MESSAGES.gone)).toBeInTheDocument()
  })

  it('says so when a save finds it removed', async () => {
    const { fake, path } = withCombo()
    const { user } = renderApp(path, fake)
    fake.next('PUT /admin/combos/{id}', error(404, 'combo_not_found'))
    await user.click(await screen.findByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(COMBO_MESSAGES.gone)
  })

  it('publishes, unpublishes, and offers delete only when not published', async () => {
    const { fake, combo, path } = withCombo()
    const { user } = renderApp(path, fake)
    await user.click(await screen.findByRole('button', { name: 'Publish' }))
    expect(await screen.findByRole('button', { name: 'Unpublish' })).toBeInTheDocument()
    expect(JSON.parse(fake.to('POST /admin/combos/publish')[0].body)).toEqual({ ids: [combo.id] })
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
    expect(screen.getByText('To delete it, unpublish it first.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Unpublish' }))
    expect(await screen.findByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(JSON.parse(fake.to('POST /admin/combos/unpublish')[0].body)).toEqual({ ids: [combo.id] })
  })

  it('deletes after confirmation and returns to the gloves', async () => {
    const { fake, path } = withCombo()
    const { user } = renderApp(path, fake)
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete this combo?' })
    expect(dialog).toHaveTextContent('Specialist Gloves | Crimson Kimono with Karambit | Doppler (Ruby)')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(where()).toBe('/gloves/specialist/crimson-kimono'))
    expect(await screen.findByText('Deleted the combo.')).toHaveAttribute('role', 'status')
    expect(fake.store.combos).toHaveLength(0)
  })

  it('reads the combo again after a delete refused for a changed combo, so it can be deleted again', async () => {
    const { fake, combo, path } = withCombo()
    const { user } = renderApp(path, fake)
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    fake.store.changeAsAnother(combo.id, { rating: 7.5 })
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(COMBO_MESSAGES.deleteConflict)
    await waitFor(() => expect(screen.getByRole('main')).toHaveTextContent('Version 2'))
    expect(screen.getByLabelText('Rating')).toHaveValue('7.50')
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(fake.store.combos).toHaveLength(0))
  })

  it('offers delete on an unpublished combo, and keeps it when delete is refused', async () => {
    const { fake, path } = withCombo()
    fake.store.combos[0].status = 'unpublished'
    fake.next('DELETE /admin/combos/{id}', error(409, 'combo_published'))
    const { user } = renderApp(path, fake)
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(fake.to('DELETE /admin/combos/{id}')).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(COMBO_MESSAGES.published)
    expect(screen.getByRole('heading', { name: 'Edit combo' })).toBeInTheDocument()
  })

  it('renders the description as text', async () => {
    const { fake, combo, path } = withCombo()
    combo.description = '<img src=x onerror=alert(1)>'
    renderApp(path, fake)
    expect(await screen.findByLabelText('Description')).toHaveValue('<img src=x onerror=alert(1)>')
    expect(document.querySelector('img[src="x"]')).toBeNull()
  })
})

describe('the screenshot agent of a combo', () => {
  it('shows the default agent, saves a chosen one, and goes back to the default', async () => {
    const { fake, path } = withCombo()
    const { user } = renderApp(path, fake)
    const agent = await screen.findByRole('group', { name: 'Screenshot agent' })
    expect(await within(agent).findByText('Lt. Commander Ricksaw | NSWC SEAL')).toBeInTheDocument()
    expect(within(agent).getByText('Default')).toBeInTheDocument()

    await user.type(within(agent).getByRole('combobox', { name: 'Find a screenshot agent' }), 'buckshot')
    await user.keyboard('{ArrowDown}{Enter}')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Saved. Version 2.')).toBeInTheDocument()
    expect(JSON.parse(fake.to('PUT /admin/combos/{id}')[0].body).screenshot_agent).toBe(4619)
    expect(within(agent).getByText("'Blueberries' Buckshot | NSWC SEAL")).toBeInTheDocument()

    await user.click(within(agent).getByRole('button', { name: 'Use default' }))
    expect(within(agent).getByText('Default')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Saved. Version 3.')).toBeInTheDocument()
    expect(JSON.parse(fake.to('PUT /admin/combos/{id}')[1].body).screenshot_agent).toBeNull()
  })

  it('keeps a retired agent the combo already has', async () => {
    const fake = new FakeApi().withSession()
    const combo = fake.store.add({
      glove: 'specialist/crimson-kimono',
      knife: 'karambit/doppler-ruby',
      rating: 9,
      agent: 5305,
    })
    const { user } = renderApp(`/combos/${combo.id}`, fake)
    const agent = await screen.findByRole('group', { name: 'Screenshot agent' })
    expect(await within(agent).findByText('Operator | FBI SWAT')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Saved. Version 2.')).toBeInTheDocument()
    expect(JSON.parse(fake.to('PUT /admin/combos/{id}')[0].body).screenshot_agent).toBe(5305)
  })
})
