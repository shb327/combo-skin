import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { COMBO_MESSAGES } from '../combos/messages'
import { FakeApi, refusal } from '../test/fakeApi'
import { renderApp, where } from '../test/render'

const BATCH = '/gloves/specialist/crimson-kimono/batch'
const RUBY = `${BATCH}/doppler-ruby`

const row = (name: string) => within(screen.getByRole('list', { name: 'Knives' })).getByRole('listitem', { name })
const rating = (name: string) => screen.getByLabelText(`Rating for ${name}`)

function withKarambit() {
  const fake = new FakeApi().withSession()
  const existing = fake.store.add({
    glove: 'specialist/crimson-kimono',
    knife: 'karambit/doppler-ruby',
    rating: 9.1,
    status: 'published',
    description: 'old',
  })
  return { fake, existing }
}

describe('choosing the knife finish', () => {
  it('lists the batch finish names, searchable, and opens the rows', async () => {
    const { fake, user } = renderApp(BATCH, new FakeApi().withSession())
    expect(await screen.findByRole('link', { name: /Doppler \(Ruby\)/ })).toHaveTextContent('3 knives')
    expect(fake.to('GET /admin/batches/finishes')).toHaveLength(1)
    await user.type(screen.getByLabelText('Find a knife finish'), 'sapph')
    expect(screen.queryByRole('link', { name: /Doppler \(Ruby\)/ })).toBeNull()
    await user.click(screen.getByRole('link', { name: /Doppler \(Sapphire\)/ }))
    await waitFor(() => expect(where()).toBe(`${BATCH}/doppler-sapphire`))
  })
})

describe('the batch rows', () => {
  it('lists every knife type in knife order, new ones ticked and the existing one not', async () => {
    const { fake } = withKarambit()
    renderApp(RUBY, fake)
    expect(await screen.findByRole('heading', { name: 'Specialist Gloves | Crimson Kimono with Doppler (Ruby)' })).toBeInTheDocument()
    const [request] = fake.to('GET /admin/batches/candidates')
    expect(Object.fromEntries(new URL(request.url).searchParams)).toEqual({
      glove_type: 'specialist',
      glove_finish: 'crimson-kimono',
      knife_finish: 'doppler-ruby',
    })
    const rows = within(screen.getByRole('list', { name: 'Knives' })).getAllByRole('listitem')
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual(['Karambit', 'Butterfly Knife', 'M9 Bayonet'])
    expect(screen.getByRole('checkbox', { name: 'Update Karambit' })).not.toBeChecked()
    expect(row('Karambit')).toHaveTextContent('Already exists')
    expect(row('Karambit')).toHaveTextContent('Published')
    expect(row('Karambit')).toHaveTextContent('now 9.10')
    expect(row('Karambit')).toHaveTextContent('Description now: old')
    expect(screen.getByRole('checkbox', { name: 'Include Butterfly Knife' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Include M9 Bayonet' })).toBeChecked()
  })

  it('fills ratings 0.05 apart, follows hand-set rows, and keeps the order', async () => {
    const { user } = renderApp(RUBY, new FakeApi().withSession())
    await user.type(await screen.findByLabelText('Top rating'), '9.5')
    expect(rating('Karambit')).toHaveValue('9.50')
    expect(rating('Butterfly Knife')).toHaveValue('9.45')
    expect(rating('M9 Bayonet')).toHaveValue('9.40')

    await user.clear(rating('Butterfly Knife'))
    await user.type(rating('Butterfly Knife'), '9.8')
    expect(rating('M9 Bayonet')).toHaveValue('9.75')

    await user.click(screen.getByRole('checkbox', { name: 'Include Butterfly Knife' }))
    expect(rating('M9 Bayonet')).toHaveValue('9.45')
    await user.click(screen.getByRole('checkbox', { name: 'Include Butterfly Knife' }))

    await user.clear(screen.getByLabelText('Top rating'))
    await user.type(screen.getByLabelText('Top rating'), '8')
    expect(rating('Karambit')).toHaveValue('8.00')
    expect(rating('Butterfly Knife')).toHaveValue('9.80')
    expect(rating('M9 Bayonet')).toHaveValue('9.75')

    await user.click(screen.getByRole('button', { name: 'Refill from top' }))
    expect(rating('Butterfly Knife')).toHaveValue('7.95')
    const rows = within(screen.getByRole('list', { name: 'Knives' })).getAllByRole('listitem')
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual(['Karambit', 'Butterfly Knife', 'M9 Bayonet'])
  })

  it('applies batch-wide values, overrides per row, and checks each row against its finish', async () => {
    const fake = new FakeApi().withSession()
    const { user } = renderApp(`${BATCH}/blue-steel`, fake)
    await user.type(await screen.findByLabelText('Top rating'), '9')
    const everyKnife = screen.getByRole('group', { name: 'Knife' })
    await user.type(within(everyKnife).getByLabelText('Float from'), '0')
    await user.type(within(everyKnife).getByLabelText('Float to'), '0.5')
    await user.type(within(screen.getByRole('group', { name: 'Gloves' })).getByLabelText('Pattern seeds'), '7')
    await user.type(screen.getByLabelText('Description'), 'Steel')

    // M9 Bayonet's Blue Steel starts at 0.06: the batch-wide range does not fit it.
    expect(row('M9 Bayonet')).toHaveTextContent("Knife float from: Outside this finish's range, 0.06 to 0.80.")
    await user.click(screen.getByRole('button', { name: 'Save 3 as drafts' }))
    expect(fake.to('POST /admin/batches')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Own values for M9 Bayonet' }))
    await user.click(screen.getByRole('button', { name: 'Set own knife values for M9 Bayonet' }))
    const own = screen.getByRole('group', { name: 'Knife, M9 Bayonet only' })
    await user.clear(within(own).getByLabelText('Float from'))
    await user.type(within(own).getByLabelText('Float from'), '0.06')
    expect(row('M9 Bayonet')).not.toHaveTextContent('Outside')

    await user.click(screen.getByRole('button', { name: 'Save 3 as drafts' }))
    await waitFor(() => expect(fake.to('POST /admin/batches')).toHaveLength(1))
    const body = JSON.parse(fake.to('POST /admin/batches')[0].body)
    const glove = { float_from: null, float_to: null, seeds: [7] }
    expect(body).toEqual({
      glove: { type_slug: 'specialist', finish_slug: 'crimson-kimono' },
      knife_finish: 'blue-steel',
      create: [
        { knife_type: 'karambit', rating: 9, description: 'Steel', glove, knife: { float_from: 0, float_to: 0.5, seeds: [] } },
        { knife_type: 'butterfly', rating: 8.95, description: 'Steel', glove, knife: { float_from: 0, float_to: 0.5, seeds: [] } },
        { knife_type: 'm9-bayonet', rating: 8.9, description: 'Steel', glove, knife: { float_from: 0.06, float_to: 0.5, seeds: [] } },
      ],
      update: [],
    })
  })

  it('clears an override back to the batch-wide value, and takes no knife values on Vanilla', async () => {
    const fake = new FakeApi().withSession()
    const { user } = renderApp(`${BATCH}/vanilla`, fake)
    await user.type(await screen.findByLabelText('Top rating'), '5')
    expect(within(screen.getByRole('group', { name: 'Knife' })).getByText('Vanilla has no float or pattern.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Own values for Karambit' }))
    expect(screen.queryByRole('button', { name: 'Set own knife values for Karambit' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Set own description for Karambit' }))
    await user.type(screen.getByLabelText('Description, Karambit only'), 'Plain')
    await user.click(screen.getByRole('button', { name: 'Clear own description for Karambit' }))
    await user.click(screen.getByRole('button', { name: 'Save 3 as drafts' }))
    await waitFor(() => expect(fake.to('POST /admin/batches')).toHaveLength(1))
    const { create } = JSON.parse(fake.to('POST /admin/batches')[0].body)
    expect(create.map((c: { description: string | null }) => c.description)).toEqual([null, null, null])
    expect(create[0].knife).toEqual({ float_from: null, float_to: null, seeds: [] })
  })
})

describe('saving a batch', () => {
  it('creates the ticked rows, updates the chosen existing one, and publishes the new ones', async () => {
    const { fake, existing } = withKarambit()
    const { user } = renderApp(RUBY, fake)
    await user.click(await screen.findByRole('checkbox', { name: 'Update Karambit' }))
    expect(row('Karambit')).toHaveTextContent('Description now: old · after saving: none')
    await user.type(screen.getByLabelText('Top rating'), '9.5')
    await user.type(screen.getByLabelText('Description'), 'Ruby')
    expect(row('Karambit')).toHaveTextContent('after saving: Ruby')
    await user.click(screen.getByRole('checkbox', { name: 'Include M9 Bayonet' }))
    await user.click(screen.getByRole('button', { name: 'Save 2 as drafts' }))

    expect(await screen.findByText('Saved 1 new combo as drafts and updated 1.')).toBeInTheDocument()
    const body = JSON.parse(fake.to('POST /admin/batches')[0].body)
    expect(body.create.map((c: { knife_type: string; rating: number }) => [c.knife_type, c.rating])).toEqual([['butterfly', 9.45]])
    expect(screen.queryByText(/Description now/)).toBeNull()
    expect(body.update).toEqual([{ id: existing.id, version: 1, rating: 9.5, description: 'Ruby' }])
    const saved = screen.getByRole('list', { name: 'Saved' })
    expect(saved).toHaveTextContent('Butterfly Knife | Doppler (Ruby)9.45Created')
    expect(saved).toHaveTextContent('Karambit | Doppler (Ruby)9.50Updated')

    await user.click(screen.getByRole('button', { name: 'Publish these 1 new combo' }))
    expect(await screen.findByText('Published 1 combo.')).toBeInTheDocument()
    const created = fake.store.combos.find((c) => c.knife.type_slug === 'butterfly')
    expect(JSON.parse(fake.to('POST /admin/combos/publish')[0].body)).toEqual({ ids: [created?.id] })
  })

  it('sends nothing with no row ticked', async () => {
    const { user } = renderApp(RUBY, new FakeApi().withSession())
    for (const name of ['Karambit', 'Butterfly Knife', 'M9 Bayonet']) {
      await user.click(await screen.findByRole('checkbox', { name: `Include ${name}` }))
    }
    expect(screen.getByRole('button', { name: 'Save 0 as drafts' })).toBeDisabled()
  })

  it('shows a refusal on the row it points at and keeps every value', async () => {
    const fake = new FakeApi().withSession()
    fake.next('POST /admin/batches', refusal([['body', 'create', 1, 'knife', 'float_to'], 'float_outside_finish']))
    const { user } = renderApp(RUBY, fake)
    await user.type(await screen.findByLabelText('Top rating'), '9.5')
    // With Butterfly Knife unticked, the second row sent is M9 Bayonet.
    await user.click(screen.getByRole('checkbox', { name: 'Include Butterfly Knife' }))
    await user.click(screen.getByRole('button', { name: 'Save 2 as drafts' }))
    await waitFor(() => expect(row('M9 Bayonet')).toHaveTextContent("Knife float to: Outside this finish's range."))
    expect(row('Butterfly Knife')).not.toHaveTextContent('Outside')
    expect(screen.getByRole('alert')).toHaveTextContent('M9 Bayonet, knife float to')
    expect(screen.getByLabelText('Top rating')).toHaveValue('9.50')
    expect(rating('M9 Bayonet')).toHaveValue('9.45')
  })

  it('reloads the rows when combos changed, keeping the owner values', async () => {
    const fake = new FakeApi().withSession()
    const { user } = renderApp(RUBY, fake)
    await user.type(await screen.findByLabelText('Top rating'), '9.5')
    await user.clear(rating('Butterfly Knife'))
    await user.type(rating('Butterfly Knife'), '9.9')
    // Another admin adds Butterfly Knife meanwhile.
    fake.store.add({ glove: 'specialist/crimson-kimono', knife: 'butterfly/doppler-ruby', rating: 7, by: 'another-admin' })
    await user.click(screen.getByRole('button', { name: 'Save 3 as drafts' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(COMBO_MESSAGES.batchChanged)
    await waitFor(() => expect(row('Butterfly Knife')).toHaveTextContent('Already exists'))
    expect(fake.to('GET /admin/batches/candidates')).toHaveLength(2)
    expect(screen.getByRole('checkbox', { name: 'Update Butterfly Knife' })).not.toBeChecked()
    await user.click(screen.getByRole('checkbox', { name: 'Update Butterfly Knife' }))
    expect(rating('Butterfly Knife')).toHaveValue('9.90')
    expect(rating('Karambit')).toHaveValue('9.50')
  })
})
