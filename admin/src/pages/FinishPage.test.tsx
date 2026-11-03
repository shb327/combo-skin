import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { COMBO_MESSAGES } from '../combos/messages'
import { FakeApi, error, json, routeOf } from '../test/fakeApi'
import { renderApp } from '../test/render'

const GLOVES = '/gloves/specialist/crimson-kimono'

function withCombos() {
  const fake = new FakeApi().withSession()
  const s = fake.store
  s.add({
    glove: 'specialist/crimson-kimono',
    knife: 'karambit/doppler-ruby',
    rating: 9.5,
    status: 'published',
    knifeConditions: { float_from: 0, float_to: 0.01 },
    gloveConditions: { seeds: [2, 179, 300, 301] },
  })
  s.add({ glove: 'specialist/crimson-kimono', knife: 'butterfly/doppler-ruby', rating: 9.45 })
  s.add({ glove: 'specialist/crimson-kimono', knife: 'm9-bayonet/doppler-ruby', rating: 9.4, status: 'unpublished' })
  s.add({ glove: 'specialist/crimson-kimono', knife: 'karambit/blue-steel', rating: 8.8 })
  s.add({ glove: 'sport/vice', knife: 'karambit/doppler-ruby', rating: 7 })
  return fake
}

const listed = () =>
  within(screen.getByRole('region', { name: 'Combos' }))
    .getAllByRole('listitem')
    .map((item) => item.getAttribute('aria-label'))

describe('a glove finish page', () => {
  it('lists the combos of the finish with rating, conditions, status and last change', async () => {
    const { fake } = renderApp(GLOVES, withCombos())
    const karambit = await screen.findByRole('listitem', { name: 'Karambit | Doppler (Ruby)' })
    const [request] = fake.to('GET /admin/combos')
    const query = new URL(request.url).searchParams
    expect(Object.fromEntries(query)).toEqual({
      glove_type: 'specialist',
      glove_finish: 'crimson-kimono',
      limit: '500',
      offset: '0',
    })
    expect(karambit).toHaveTextContent('9.50')
    expect(karambit).toHaveTextContent('Gloves seeds 2, 179, 300 (+1) · Knife 0–0.01')
    expect(within(karambit).getByText('Published')).toBeInTheDocument()
    expect(karambit).toHaveTextContent(/Changed .* by placeholder-admin/)
    expect(listed()).toEqual([
      'Karambit | Doppler (Ruby)',
      'Butterfly Knife | Doppler (Ruby)',
      'M9 Bayonet | Doppler (Ruby)',
      'Karambit | Blue Steel',
    ])
  })

  it('counts and filters by status and knife finish, and sorts by last change', async () => {
    const fake = withCombos()
    const { user } = renderApp(GLOVES, fake)
    await screen.findByRole('listitem', { name: 'Karambit | Doppler (Ruby)' })
    const statuses = screen.getByRole('group', { name: 'Status' })
    expect(within(statuses).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'All (4)',
      'Draft (2)',
      'Published (1)',
      'Unpublished (1)',
    ])
    await user.click(within(statuses).getByRole('button', { name: 'Draft (2)' }))
    expect(listed()).toEqual(['Butterfly Knife | Doppler (Ruby)', 'Karambit | Blue Steel'])
    await user.click(within(statuses).getByRole('button', { name: 'All (4)' }))
    await user.selectOptions(screen.getByLabelText('Knife finish'), 'Blue Steel')
    expect(listed()).toEqual(['Karambit | Blue Steel'])
    await user.selectOptions(screen.getByLabelText('Knife finish'), '')
    await user.selectOptions(screen.getByLabelText('Sort by'), 'Last change')
    expect(listed()).toEqual([
      'Karambit | Blue Steel',
      'M9 Bayonet | Doppler (Ruby)',
      'Butterfly Knife | Doppler (Ruby)',
      'Karambit | Doppler (Ruby)',
    ])
  })

  it('loads further pages while the total is larger', async () => {
    const fake = withCombos()
    const [first] = (fake.store.list(new URLSearchParams()) as [number, { items: { id: string }[] }])[1].items
    // A first page of 500 (copies under other ids), then a second page with the last one.
    const page = Array.from({ length: 500 }, (_, i) => ({ ...first, id: `p${String(i).padStart(11, '0')}` }))
    fake.next('GET /admin/combos', json(200, { total: 501, items: page }), json(200, { total: 501, items: [first] }))
    renderApp(GLOVES, fake)
    await waitFor(() => expect(fake.to('GET /admin/combos')).toHaveLength(2))
    const offsets = fake.to('GET /admin/combos').map((r) => new URL(r.url).searchParams.get('offset'))
    expect(offsets).toEqual(['0', '500'])
    await waitFor(() => expect(screen.getByRole('button', { name: 'All (501)' })).toBeInTheDocument())
  })

  it('renders names and descriptions as text', async () => {
    const fake = new FakeApi().withSession()
    const combo = fake.store.add({ glove: 'specialist/crimson-kimono', knife: 'karambit/doppler-ruby', rating: 9 })
    combo.knife.display_name = '<img src=x onerror=alert(1)>'
    combo.description = '<img src=x onerror=alert(1)>'
    renderApp(GLOVES, fake)
    expect(await screen.findByText(/Karambit \| <img src=x onerror=alert\(1\)>/)).toBeInTheDocument()
    expect(document.querySelector('img[src="x"]')).toBeNull()
  })
})

describe('a knife finish page', () => {
  it('lists the gloves of each combo', async () => {
    renderApp('/knives/karambit/doppler-ruby', withCombos())
    expect(await screen.findByRole('heading', { name: 'Karambit | Doppler (Ruby)' })).toBeInTheDocument()
    expect(await screen.findByRole('listitem', { name: 'Specialist Gloves | Crimson Kimono' })).toBeInTheDocument()
    expect(listed()).toEqual(['Specialist Gloves | Crimson Kimono', 'Sport Gloves | Vice'])
    expect(screen.getByRole('link', { name: 'Add gloves' })).toHaveAttribute('href', '/knives/karambit/doppler-ruby/add')
    expect(screen.queryByLabelText('Knife finish')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Start a batch' })).toBeNull()
  })
})

describe('retired and unknown finishes', () => {
  it('offers nothing to add on a retired finish', async () => {
    renderApp('/gloves/specialist/emerald-web', new FakeApi().withSession())
    expect(await screen.findByText(COMBO_MESSAGES.retired)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Add knife' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Start a batch' })).toBeNull()
  })

  it('says an unknown finish was not found, with a way back', async () => {
    renderApp('/gloves/specialist/nope', new FakeApi().withSession())
    expect(await screen.findByText(COMBO_MESSAGES.finishNotFound)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Back to By gloves' })[0]).toHaveAttribute('href', '/gloves')
  })
})

describe('managing combos from the list', () => {
  it('reloads the list after a delete refused for a changed combo, so it can be deleted again', async () => {
    const fake = withCombos()
    const { user } = renderApp(GLOVES, fake)
    const butterfly = await screen.findByRole('listitem', { name: 'Butterfly Knife | Doppler (Ruby)' })
    fake.store.changeAsAnother(fake.store.combos[1].id, { rating: 9.46 })
    await user.click(within(butterfly).getByRole('button', { name: 'Delete' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(COMBO_MESSAGES.deleteConflict)
    await waitFor(() => expect(butterfly).toHaveTextContent('9.46'))
    await user.click(within(butterfly).getByRole('button', { name: 'Delete' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByRole('listitem', { name: 'Butterfly Knife | Doppler (Ruby)' })).toBeNull())
    const versions = fake.to('DELETE /admin/combos/{id}').map((r) => new URL(r.url).searchParams.get('version'))
    expect(versions).toEqual(['1', '2'])
  })

  it('publishes only the selected combos that are shown', async () => {
    const fake = withCombos()
    const { user } = renderApp(GLOVES, fake)
    await screen.findByRole('listitem', { name: 'Karambit | Doppler (Ruby)' })
    await user.click(screen.getByRole('checkbox', { name: 'Select Butterfly Knife | Doppler (Ruby)' }))
    await user.selectOptions(screen.getByLabelText('Knife finish'), 'Blue Steel')
    await user.click(screen.getByRole('checkbox', { name: 'Select Karambit | Blue Steel' }))
    await user.click(screen.getByRole('button', { name: 'Publish selected (1)' }))
    await waitFor(() => expect(fake.to('POST /admin/combos/publish')).toHaveLength(1))
    expect(JSON.parse(fake.to('POST /admin/combos/publish')[0].body)).toEqual({ ids: [fake.store.combos[3].id] })
  })

  it('publishes and unpublishes one combo', async () => {
    const fake = withCombos()
    const { user } = renderApp(GLOVES, fake)
    const butterfly = await screen.findByRole('listitem', { name: 'Butterfly Knife | Doppler (Ruby)' })
    await user.click(within(butterfly).getByRole('button', { name: 'Publish' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Published 1 combo.')
    const [publish] = fake.to('POST /admin/combos/publish')
    expect(JSON.parse(publish.body)).toEqual({ ids: [fake.store.combos[1].id] })
    await waitFor(() => expect(within(butterfly).getByText('Published')).toBeInTheDocument())

    const karambit = screen.getByRole('listitem', { name: 'Karambit | Doppler (Ruby)' })
    await user.click(within(karambit).getByRole('button', { name: 'Unpublish' }))
    await waitFor(() => expect(within(karambit).getByText('Unpublished')).toBeInTheDocument())
    expect(JSON.parse(fake.to('POST /admin/combos/unpublish')[0].body)).toEqual({ ids: [fake.store.combos[0].id] })
  })

  it('publishes a selection in one request, and selects all shown', async () => {
    const fake = withCombos()
    const { user } = renderApp(GLOVES, fake)
    await screen.findByRole('listitem', { name: 'Karambit | Doppler (Ruby)' })
    for (const name of ['Butterfly Knife | Doppler (Ruby)', 'M9 Bayonet | Doppler (Ruby)', 'Karambit | Blue Steel']) {
      await user.click(screen.getByRole('checkbox', { name: `Select ${name}` }))
    }
    await user.click(screen.getByRole('button', { name: 'Publish selected (3)' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Published 3 combos.')
    expect(fake.to('POST /admin/combos/publish')).toHaveLength(1)
    expect(new Set(JSON.parse(fake.to('POST /admin/combos/publish')[0].body).ids)).toEqual(
      new Set(fake.store.combos.slice(1, 4).map((c) => c.id)),
    )

    await user.selectOptions(screen.getByLabelText('Knife finish'), 'Doppler (Ruby)')
    await user.click(screen.getByRole('checkbox', { name: 'Select all shown' }))
    expect(screen.getByRole('button', { name: 'Unpublish selected (3)' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Unpublish selected (3)' }))
    await waitFor(() => expect(fake.to('POST /admin/combos/unpublish')).toHaveLength(1))
    expect(new Set(JSON.parse(fake.to('POST /admin/combos/unpublish')[0].body).ids)).toEqual(
      new Set(fake.store.combos.slice(0, 3).map((c) => c.id)),
    )
  })

  it('deletes a draft after confirmation, and offers no delete for a published combo', async () => {
    const fake = withCombos()
    const { user } = renderApp(GLOVES, fake)
    const karambit = await screen.findByRole('listitem', { name: 'Karambit | Doppler (Ruby)' })
    expect(within(karambit).queryByRole('button', { name: 'Delete' })).toBeNull()
    const m9 = screen.getByRole('listitem', { name: 'M9 Bayonet | Doppler (Ruby)' })
    expect(within(m9).getByText('Unpublished')).toBeInTheDocument()
    expect(within(m9).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(within(m9).getByRole('button', { name: 'Publish' })).toBeInTheDocument()

    const butterfly = screen.getByRole('listitem', { name: 'Butterfly Knife | Doppler (Ruby)' })
    await user.click(within(butterfly).getByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete this combo?' })
    expect(dialog).toHaveTextContent('Specialist Gloves | Crimson Kimono with Butterfly Knife | Doppler (Ruby)')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(fake.to('DELETE /admin/combos/{id}')).toHaveLength(0)

    await user.click(within(butterfly).getByRole('button', { name: 'Delete' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByRole('listitem', { name: 'Butterfly Knife | Doppler (Ruby)' })).toBeNull())
    const [request] = fake.to('DELETE /admin/combos/{id}')
    expect(new URL(request.url).searchParams.get('version')).toBe('1')
    expect(routeOf('DELETE', new URL(request.url).pathname).params).toEqual(['c00000000002'])
  })

  it.each([
    [error(409, 'combo_published'), COMBO_MESSAGES.published],
    [error(409, 'version_conflict'), COMBO_MESSAGES.deleteConflict],
    [error(404, 'combo_not_found'), COMBO_MESSAGES.gone],
  ])('keeps the combo listed when delete is refused (%#)', async (reply, message) => {
    const fake = withCombos()
    fake.next('DELETE /admin/combos/{id}', reply)
    const { user } = renderApp(GLOVES, fake)
    const butterfly = await screen.findByRole('listitem', { name: 'Butterfly Knife | Doppler (Ruby)' })
    await user.click(within(butterfly).getByRole('button', { name: 'Delete' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('listitem', { name: 'Butterfly Knife | Doppler (Ruby)' })).toBeInTheDocument()
  })
})
