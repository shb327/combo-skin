import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COMBO_MESSAGES } from '../combos/messages'
import { FakeApi, error, json, routeOf } from '../test/fakeApi'
import { renderApp, where } from '../test/render'

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
    expect(within(karambit).getByLabelText('Rating for Karambit | Doppler (Ruby)')).toHaveValue('9.50')
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
    // A text query: a role query over 501 combos is slow in jsdom.
    expect(await screen.findByText('All (501)')).toBeInTheDocument()
  })

  it('renders names and descriptions as text', async () => {
    const fake = new FakeApi().withSession()
    const combo = fake.store.add({ glove: 'specialist/crimson-kimono', knife: 'karambit/doppler-ruby', rating: 9 })
    combo.knife.display_name = '<img src=x onerror=alert(1)>'
    combo.description = '<img src=x onerror=alert(1)>'
    renderApp(GLOVES, fake)
    expect(await screen.findByText('Karambit | <img src=x onerror=alert(1)>')).toBeInTheDocument()
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
    await waitFor(() => expect(ratingBox(BUTTERFLY)).toHaveValue('9.46'))
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
    expect(await screen.findByText('Published 1 combo.')).toBeInTheDocument()
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
    expect(await screen.findByText('Published 3 combos.')).toBeInTheDocument()
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

describe('the list view state', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps the sort and filters in the address', async () => {
    const fake = withCombos()
    const { user } = renderApp(`${GLOVES}?sort=updated&status=draft`, fake)
    await screen.findByRole('listitem', { name: 'Karambit | Blue Steel' })
    expect(screen.getByLabelText('Sort by')).toHaveValue('updated')
    expect(within(screen.getByRole('group', { name: 'Status' })).getByRole('button', { name: 'Draft (2)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(listed()).toEqual(['Karambit | Blue Steel', 'Butterfly Knife | Doppler (Ruby)'])

    await user.selectOptions(screen.getByLabelText('Sort by'), 'Rating')
    expect(where()).toBe(`${GLOVES}?status=draft`)
    await user.click(screen.getByRole('button', { name: 'All (4)' }))
    expect(where()).toBe(GLOVES)
    await user.selectOptions(screen.getByLabelText('Knife finish'), 'Blue Steel')
    expect(where()).toBe(`${GLOVES}?knife=blue-steel`)
    await user.click(screen.getByRole('button', { name: 'Draft (2)' }))
    expect(where()).toBe(`${GLOVES}?status=draft&knife=blue-steel`)

    await user.click(within(screen.getByRole('listitem', { name: 'Karambit | Blue Steel' })).getByRole('link', { name: 'Edit' }))
    await waitFor(() => expect(where()).toMatch(/^\/combos\//))
    await user.click(await screen.findByRole('link', { name: 'Back' }))
    await waitFor(() => expect(where()).toBe(`${GLOVES}?status=draft&knife=blue-steel`))
    expect(await screen.findByRole('listitem', { name: 'Karambit | Blue Steel' })).toBeInTheDocument()
    expect(listed()).toEqual(['Karambit | Blue Steel'])
  })

  it.each(['the Back link', "the browser's Back"])('returns to the scroll position with %s', async (how) => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const fake = withCombos()
    const { user } = renderApp(`${GLOVES}?sort=updated`, fake)
    const butterfly = await screen.findByRole('listitem', { name: 'Butterfly Knife | Doppler (Ruby)' })
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(640)
    await user.click(within(butterfly).getByRole('link', { name: 'Edit' }))
    await waitFor(() => expect(where()).toMatch(/^\/combos\//))
    await screen.findByRole('link', { name: 'Back' })
    expect(scrollTo).not.toHaveBeenCalledWith(0, 640)
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(0)
    if (how === 'the Back link') await user.click(screen.getByRole('link', { name: 'Back' }))
    else act(() => window.history.back())
    await waitFor(() => expect(where()).toBe(`${GLOVES}?sort=updated`))
    await screen.findByRole('listitem', { name: 'Butterfly Knife | Doppler (Ruby)' })
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 640))
  })
})

const ratingBox = (name: string) => screen.getByLabelText(`Rating for ${name}`)
const saveButton = (name: string) => screen.getByRole('button', { name: `Save rating for ${name}` })
const BUTTERFLY = 'Butterfly Knife | Doppler (Ruby)'

describe('editing a rating in the list', () => {
  it('saves a changed rating with its Save button or Enter, and nothing else', async () => {
    const fake = withCombos()
    const { user } = renderApp(GLOVES, fake)
    await screen.findByRole('listitem', { name: BUTTERFLY })
    expect(ratingBox(BUTTERFLY)).toHaveValue('9.45')
    expect(saveButton(BUTTERFLY)).toBeDisabled()

    await user.clear(ratingBox(BUTTERFLY))
    await user.type(ratingBox(BUTTERFLY), '8.7')
    expect(saveButton(BUTTERFLY)).toBeEnabled()
    await user.click(saveButton(BUTTERFLY))
    await waitFor(() => expect(fake.to('PUT /admin/combos/{id}')).toHaveLength(1))
    const stored = fake.store.combos[1]
    expect(JSON.parse(fake.to('PUT /admin/combos/{id}')[0].body)).toEqual({
      version: 1,
      rating: 8.7,
      description: null,
      glove: { float_from: null, float_to: null, seeds: [] },
      knife: { float_from: null, float_to: null, seeds: [] },
      screenshot_agent: null,
    })
    expect(routeOf('PUT', new URL(fake.to('PUT /admin/combos/{id}')[0].url).pathname).params).toEqual([stored.id])
    expect(await within(screen.getByRole('listitem', { name: BUTTERFLY })).findByText('Saved')).toBeInTheDocument()

    // The edited combo keeps its place until the list is sorted again.
    await waitFor(() => expect(ratingBox(BUTTERFLY)).toHaveValue('8.70'))
    expect(listed()[1]).toBe(BUTTERFLY)
    await user.click(screen.getByRole('button', { name: 'Sort again' }))
    expect(listed()).toEqual(['Karambit | Doppler (Ruby)', 'M9 Bayonet | Doppler (Ruby)', 'Karambit | Blue Steel', BUTTERFLY])
    expect(screen.queryByRole('button', { name: 'Sort again' })).toBeNull()

    // Enter saves too.
    const m9 = 'M9 Bayonet | Doppler (Ruby)'
    await user.clear(ratingBox(m9))
    await user.type(ratingBox(m9), '9.3{Enter}')
    await waitFor(() => expect(fake.to('PUT /admin/combos/{id}')).toHaveLength(2))
    expect(JSON.parse(fake.to('PUT /admin/combos/{id}')[1].body).rating).toBe(9.3)
  })

  it('saves nothing on leaving the field, and restores the stored rating with Escape', async () => {
    const fake = withCombos()
    const { user } = renderApp(GLOVES, fake)
    await screen.findByRole('listitem', { name: BUTTERFLY })
    await user.clear(ratingBox(BUTTERFLY))
    await user.type(ratingBox(BUTTERFLY), '8.6')
    await user.click(ratingBox('Karambit | Blue Steel'))
    expect(fake.to('PUT /admin/combos/{id}')).toHaveLength(0)
    expect(screen.getByRole('listitem', { name: BUTTERFLY })).toHaveTextContent('Not saved')
    expect(ratingBox(BUTTERFLY)).toHaveValue('8.60')

    // An unsaved rating stays through a filter change.
    await user.click(screen.getByRole('button', { name: 'Draft (2)' }))
    await user.click(screen.getByRole('button', { name: 'All (4)' }))
    expect(ratingBox(BUTTERFLY)).toHaveValue('8.60')

    await user.click(ratingBox(BUTTERFLY))
    await user.keyboard('{Escape}')
    expect(ratingBox(BUTTERFLY)).toHaveValue('9.45')
    expect(saveButton(BUTTERFLY)).toBeDisabled()
    expect(screen.getByRole('listitem', { name: BUTTERFLY })).not.toHaveTextContent('Not saved')

    await user.clear(ratingBox(BUTTERFLY))
    await user.type(ratingBox(BUTTERFLY), '11')
    expect(ratingBox(BUTTERFLY)).toHaveAccessibleDescription('Rating must be from 0 to 10.')
    await user.click(saveButton(BUTTERFLY))
    expect(fake.to('PUT /admin/combos/{id}')).toHaveLength(0)
  })

  it('shows a change made by another admin, then uses theirs or keeps mine', async () => {
    const fake = withCombos()
    const { user } = renderApp(GLOVES, fake)
    await screen.findByRole('listitem', { name: BUTTERFLY })
    fake.store.changeAsAnother(fake.store.combos[1].id, { rating: 9.46 })
    await user.clear(ratingBox(BUTTERFLY))
    await user.type(ratingBox(BUTTERFLY), '8.7')
    await user.click(saveButton(BUTTERFLY))
    const item = screen.getByRole('listitem', { name: BUTTERFLY })
    expect(await within(item).findByText(/Changed by another-admin at .* to 9\.46\./)).toBeInTheDocument()
    expect(saveButton(BUTTERFLY)).toBeDisabled()

    await user.click(within(item).getByRole('button', { name: 'Use theirs' }))
    expect(ratingBox(BUTTERFLY)).toHaveValue('9.46')
    expect(within(item).queryByRole('button', { name: 'Keep mine' })).toBeNull()

    fake.store.changeAsAnother(fake.store.combos[1].id, { rating: 9.44 })
    await user.clear(ratingBox(BUTTERFLY))
    await user.type(ratingBox(BUTTERFLY), '8.7')
    await user.click(saveButton(BUTTERFLY))
    await user.click(await within(item).findByRole('button', { name: 'Keep mine' }))
    expect(ratingBox(BUTTERFLY)).toHaveValue('8.70')
    await user.click(saveButton(BUTTERFLY))
    await waitFor(() => expect(fake.to('PUT /admin/combos/{id}')).toHaveLength(3))
    const last = JSON.parse(fake.to('PUT /admin/combos/{id}')[2].body)
    expect(last).toMatchObject({ version: 3, rating: 8.7 })
    await waitFor(() => expect(fake.store.combos[1].rating).toBe(8.7))
  })
})

/** dnd-kit measures elements; jsdom has no layout, so each combo gets a box by its place. */
function layOutCombos() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const item = this.closest('li')
    const index = item?.parentElement ? Array.from(item.parentElement.children).indexOf(item) : 0
    const top = item ? 1000 + index * 100 : 0
    const height = item ? 90 : 0
    return { x: 0, y: top, top, left: 0, right: 600, bottom: top + height, width: 600, height, toJSON: () => ({}) }
  })
}

function withRatings() {
  const fake = new FakeApi().withSession()
  const s = fake.store
  s.add({ glove: 'specialist/crimson-kimono', knife: 'karambit/doppler-ruby', rating: 9 })
  s.add({ glove: 'specialist/crimson-kimono', knife: 'butterfly/doppler-ruby', rating: 8.79 })
  s.add({ glove: 'specialist/crimson-kimono', knife: 'm9-bayonet/doppler-ruby', rating: 8.62 })
  s.add({ glove: 'specialist/crimson-kimono', knife: 'karambit/blue-steel', rating: 8.61 })
  return fake
}

describe('dragging a combo to a new place', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('gives it a rating between its new neighbours, with the keyboard', async () => {
    layOutCombos()
    const fake = withRatings()
    const { user } = renderApp(GLOVES, fake)
    await screen.findByRole('listitem', { name: BUTTERFLY })
    const handle = screen.getByRole('button', { name: 'Drag Karambit | Doppler (Ruby)' })
    handle.focus()
    await user.keyboard('[Space]')
    await user.keyboard('[ArrowDown]')
    await user.keyboard('[Space]')
    await waitFor(() => expect(fake.to('PUT /admin/combos/{id}')).toHaveLength(1))
    expect(JSON.parse(fake.to('PUT /admin/combos/{id}')[0].body)).toMatchObject({ version: 1, rating: 8.7 })
    await waitFor(() => expect(ratingBox('Karambit | Doppler (Ruby)')).toHaveValue('8.70'))
    expect(listed()).toEqual([BUTTERFLY, 'Karambit | Doppler (Ruby)', 'M9 Bayonet | Doppler (Ruby)', 'Karambit | Blue Steel'])
  })

  it('refuses a place where no rating fits, and sends nothing', async () => {
    layOutCombos()
    const fake = withRatings()
    const { user } = renderApp(GLOVES, fake)
    await screen.findByRole('listitem', { name: BUTTERFLY })
    const before = listed()
    // Butterfly Knife (8.79) dropped between M9 Bayonet (8.62) and Karambit | Blue Steel (8.61).
    screen.getByRole('button', { name: `Drag ${BUTTERFLY}` }).focus()
    await user.keyboard('[Space]')
    await user.keyboard('[ArrowDown]')
    await user.keyboard('[Space]')
    expect(await screen.findByText('No rating fits between 8.62 and 8.61. Change a rating first.')).toBeInTheDocument()
    expect(fake.to('PUT /admin/combos/{id}')).toHaveLength(0)
    expect(listed()).toEqual(before)
    expect(ratingBox(BUTTERFLY)).toHaveValue('8.79')

    // Picking a combo up again clears the message.
    await user.keyboard('[Space]')
    expect(screen.queryByText(/^No rating fits/)).toBeNull()
    await user.keyboard('[Escape]')
  })

  it('shows the combo in its new place after a rating saved in place kept the order', async () => {
    layOutCombos()
    const fake = withRatings()
    const { user } = renderApp(GLOVES, fake)
    await screen.findByRole('listitem', { name: BUTTERFLY })
    const box = ratingBox('Karambit | Blue Steel')
    await user.clear(box)
    await user.type(box, '8.5{Enter}')
    await waitFor(() => expect(fake.to('PUT /admin/combos/{id}')).toHaveLength(1))
    screen.getByRole('button', { name: 'Drag Karambit | Doppler (Ruby)' }).focus()
    await user.keyboard('[Space]')
    await user.keyboard('[ArrowDown]')
    await user.keyboard('[Space]')
    await waitFor(() => expect(fake.to('PUT /admin/combos/{id}')).toHaveLength(2))
    expect(JSON.parse(fake.to('PUT /admin/combos/{id}')[1].body)).toMatchObject({ rating: 8.7 })
    await waitFor(() => expect(ratingBox('Karambit | Doppler (Ruby)')).toHaveValue('8.70'))
    expect(listed()).toEqual([BUTTERFLY, 'Karambit | Doppler (Ruby)', 'M9 Bayonet | Doppler (Ruby)', 'Karambit | Blue Steel'])
    expect(screen.queryByRole('button', { name: 'Sort again' })).toBeNull()
  })

  it('shows no handle while sorted by last change', async () => {
    renderApp(`${GLOVES}?sort=updated`, withRatings())
    await screen.findByRole('listitem', { name: BUTTERFLY })
    expect(screen.queryByRole('button', { name: /^Drag / })).toBeNull()
  })
})
