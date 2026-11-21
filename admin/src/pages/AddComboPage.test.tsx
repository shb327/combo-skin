import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { COMBO_MESSAGES } from '../combos/messages'
import { CHECKS } from '../combos/values'
import { FakeApi, refusal } from '../test/fakeApi'
import { renderApp, where } from '../test/render'

const ADD = '/gloves/specialist/crimson-kimono/add'

async function pickKnife(user: ReturnType<typeof renderApp>['user'], words: string) {
  await user.type(await screen.findByRole('combobox', { name: 'Find a knife' }), words)
  await user.keyboard('{Enter}')
}

describe('adding a knife to gloves', () => {
  it('takes float and pattern values before a knife is picked, without calling it Vanilla', async () => {
    renderApp(ADD, new FakeApi().withSession())
    const knife = within(await screen.findByRole('group', { name: 'Knife' }))
    expect(knife.getByLabelText('Float from')).toBeInTheDocument()
    expect(knife.queryByText('Vanilla has no float or pattern.')).toBeNull()
    expect(knife.queryByText(/This finish/)).toBeNull()
  })

  it('creates one draft and lists it on the finish page', async () => {
    const fake = new FakeApi().withSession()
    const { user } = renderApp('/gloves/specialist/crimson-kimono', fake)
    await user.click(await screen.findByRole('link', { name: 'Add knife' }))
    await pickKnife(user, 'karambit ruby')
    await user.type(screen.getByLabelText('Rating'), '8,88')
    const knife = screen.getByRole('group', { name: 'Knife' })
    await user.type(within(knife).getByLabelText('Float from'), '0')
    await user.type(within(knife).getByLabelText('Float to'), '0.01')
    const gloves = screen.getByRole('group', { name: 'Gloves' })
    await user.type(within(gloves).getByLabelText('Pattern seeds'), '2 1 2')
    await user.tab()
    expect(within(gloves).getByLabelText('Pattern seeds')).toHaveValue('1, 2')
    expect(within(gloves).getByText('1 duplicate removed')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Description'), 'Red on red')
    await user.click(screen.getByRole('button', { name: 'Save as draft' }))

    await waitFor(() => expect(where()).toBe('/gloves/specialist/crimson-kimono'))
    expect(fake.to('POST /admin/combos')).toHaveLength(1)
    const [request] = fake.to('POST /admin/combos')
    expect(request.body).toContain('"rating":8.88')
    expect(JSON.parse(request.body)).toEqual({
      glove: { type_slug: 'specialist', finish_slug: 'crimson-kimono', float_from: null, float_to: null, seeds: [1, 2] },
      knife: { type_slug: 'karambit', finish_slug: 'doppler-ruby', float_from: 0, float_to: 0.01, seeds: [] },
      rating: 8.88,
      description: 'Red on red',
      screenshot_agent: null,
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Saved a draft: Karambit | Doppler (Ruby).')
    const row = await screen.findByRole('listitem', { name: 'Karambit | Doppler (Ruby)' })
    expect(within(row).getByText('Draft')).toBeInTheDocument()
  })

  it('sends nothing with an invalid value, and says what is wrong', async () => {
    const fake = new FakeApi().withSession()
    const { user } = renderApp(ADD, fake)
    await pickKnife(user, 'karambit ruby')
    const knife = screen.getByRole('group', { name: 'Knife' })
    await user.type(within(knife).getByLabelText('Float from'), '0')
    await user.type(within(knife).getByLabelText('Float to'), '0.09')
    expect(within(knife).getByLabelText('Float to')).toHaveAccessibleDescription("Outside this finish's range, 0.00 to 0.08.")
    await user.click(screen.getByRole('button', { name: 'Save as draft' }))
    const summary = await screen.findByRole('alert')
    expect(summary).toHaveTextContent(`Rating: ${CHECKS.ratingMissing}`)
    expect(summary).toHaveTextContent('Knife float to: Outside')
    expect(summary).toHaveFocus()
    expect(screen.getByLabelText('Rating')).toHaveAccessibleDescription(CHECKS.ratingMissing)
    expect(fake.to('POST /admin/combos')).toHaveLength(0)
  })

  it('links to the combo that already exists', async () => {
    const fake = new FakeApi().withSession()
    const existing = fake.store.add({ glove: 'specialist/crimson-kimono', knife: 'karambit/doppler-ruby', rating: 9 })
    const { user } = renderApp(ADD, fake)
    await pickKnife(user, 'karambit ruby')
    await user.type(screen.getByLabelText('Rating'), '9')
    await user.click(screen.getByRole('button', { name: 'Save as draft' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(COMBO_MESSAGES.exists)
    expect(await within(alert).findByRole('link', { name: 'Open it' })).toHaveAttribute('href', `/combos/${existing.id}`)
  })

  it('shows a refusal next to its field', async () => {
    const fake = new FakeApi().withSession()
    fake.next('POST /admin/combos', refusal([['body', 'knife', 'float_to'], 'float_outside_finish']))
    const { user } = renderApp(ADD, fake)
    await pickKnife(user, 'karambit ruby')
    await user.type(screen.getByLabelText('Rating'), '9')
    await user.click(screen.getByRole('button', { name: 'Save as draft' }))
    const knife = screen.getByRole('group', { name: 'Knife' })
    await waitFor(() =>
      expect(within(knife).getByLabelText('Float to')).toHaveAccessibleDescription("Outside this finish's range."),
    )
    expect(screen.getByLabelText('Rating')).toHaveValue('9.00')
  })
})

describe('adding gloves to a knife', () => {
  it('searches gloves and creates the combo', async () => {
    const fake = new FakeApi().withSession()
    const { user } = renderApp('/knives/karambit/doppler-ruby/add', fake)
    await user.type(await screen.findByRole('combobox', { name: 'Find gloves' }), 'vice')
    await user.keyboard('{Enter}')
    await user.type(screen.getByLabelText('Rating'), '7.5')
    await user.click(screen.getByRole('button', { name: 'Save as draft' }))
    await waitFor(() => expect(where()).toBe('/knives/karambit/doppler-ruby'))
    const body = JSON.parse(fake.to('POST /admin/combos')[0].body)
    expect(body.glove).toMatchObject({ type_slug: 'sport', finish_slug: 'vice' })
    expect(body.knife).toMatchObject({ type_slug: 'karambit', finish_slug: 'doppler-ruby' })
    expect(await screen.findByRole('listitem', { name: 'Sport Gloves | Vice' })).toBeInTheDocument()
  })
})

describe('the screenshot agent', () => {
  it('starts at the default agent, and sends a chosen one picked by keyboard', async () => {
    const fake = new FakeApi().withSession()
    const { user } = renderApp(ADD, fake)
    await pickKnife(user, 'karambit ruby')
    const agent = await screen.findByRole('group', { name: 'Screenshot agent' })
    expect(await within(agent).findByText('Lt. Commander Ricksaw | NSWC SEAL')).toBeInTheDocument()
    expect(within(agent).getByText('Default')).toBeInTheDocument()
    expect(within(agent).queryByRole('button', { name: 'Use default' })).toBeNull()

    await user.type(within(agent).getByRole('combobox', { name: 'Find a screenshot agent' }), 'darryl')
    await user.keyboard('{ArrowDown}{Enter}')
    expect(within(agent).getByText('Bloody Darryl The Strapped | The Professionals')).toBeInTheDocument()
    expect(within(agent).queryByText('Default')).toBeNull()
    await user.type(screen.getByLabelText('Rating'), '9')
    await user.click(screen.getByRole('button', { name: 'Save as draft' }))
    await waitFor(() => expect(fake.to('POST /admin/combos')).toHaveLength(1))
    expect(JSON.parse(fake.to('POST /admin/combos')[0].body).screenshot_agent).toBe(4613)
  })

  it('opens on focus with the default first, then the agents grouped by team', async () => {
    const { user } = renderApp(ADD, new FakeApi().withSession())
    const agent = await screen.findByRole('group', { name: 'Screenshot agent' })
    await within(agent).findByText('Default')
    expect(agent.querySelector('img')?.getAttribute('src')).toMatch(/catalog\/fake-agent-5404\.png$/)
    const search = await within(agent).findByRole('combobox', { name: 'Find a screenshot agent' })
    expect(within(agent).queryByRole('option')).toBeNull()
    await user.click(search)
    const list = within(agent).getByRole('listbox')
    expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Default (Lt. Commander Ricksaw | NSWC SEAL)',
      "'Blueberries' Buckshot | NSWC SEAL",
      'Lt. Commander Ricksaw | NSWC SEAL',
      'Bloody Darryl The Strapped | The Professionals',
    ])
    const groups = within(list).getAllByRole('group')
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['Counter-Terrorists', 'Terrorists'])
    expect(within(groups[1]).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Bloody Darryl The Strapped | The Professionals',
    ])
    // Enter without a highlighted option chooses nothing; Down then Enter takes the first.
    await user.keyboard('{Enter}')
    expect(within(agent).getByRole('listbox')).toBeVisible()
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(within(agent).getByText("'Blueberries' Buckshot | NSWC SEAL")).toBeInTheDocument()
    await user.type(search, 'nswc')
    expect(within(agent).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Default (Lt. Commander Ricksaw | NSWC SEAL)',
      "'Blueberries' Buckshot | NSWC SEAL",
      'Lt. Commander Ricksaw | NSWC SEAL',
    ])
  })
})

describe('a special pattern', () => {
  const knifeGroup = () => screen.getByRole('group', { name: 'Knife' })
  const seeds = () => within(knifeGroup()).getByLabelText('Pattern seeds')
  const chip = () => within(knifeGroup()).queryByRole('group', { name: 'Special pattern' })
  const sent = (fake: FakeApi) => JSON.parse(fake.to('POST /admin/combos')[0].body)

  async function pickBlueGem(user: ReturnType<typeof renderApp>['user']) {
    await pickKnife(user, 'karambit case')
    await user.click(within(knifeGroup()).getByRole('button', { name: 'Add special pattern' }))
    await user.click(within(knifeGroup()).getByRole('button', { name: 'Blue Gem · 387' }))
  }

  it('lists the groups of the knife with their seeds, and is not shown without any', async () => {
    const fake = new FakeApi().withSession()
    const { user } = renderApp(ADD, fake)
    await pickKnife(user, 'karambit vanilla')
    expect(within(knifeGroup()).queryByRole('button', { name: 'Add special pattern' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Change' }))
    await pickKnife(user, 'karambit ruby')
    expect(within(knifeGroup()).queryByRole('button', { name: 'Add special pattern' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Change' }))
    await pickKnife(user, 'karambit case')

    const add = await within(knifeGroup()).findByRole('button', { name: 'Add special pattern' })
    expect(add).toHaveAttribute('aria-expanded', 'false')
    // The gloves have no groups.
    expect(within(screen.getByRole('group', { name: 'Gloves' })).queryByRole('button', { name: 'Add special pattern' })).toBeNull()
    // Keyboard: Enter opens the list on its first entry, Tab moves on, Escape closes it.
    add.focus()
    await user.keyboard('{Enter}')
    expect(add).toHaveAttribute('aria-expanded', 'true')
    const list = within(knifeGroup()).getByRole('list', { name: 'Special patterns' })
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual(['Gold Gem · 128', 'Blue Gem · 387', 'Test Pattern · 555'])
    expect(within(list).getByRole('button', { name: 'Gold Gem · 128' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(within(knifeGroup()).queryByRole('list', { name: 'Special patterns' })).toBeNull()
    expect(add).toHaveFocus()
    await user.keyboard('{Enter}')
    await user.tab()
    expect(within(knifeGroup()).getByRole('button', { name: 'Blue Gem · 387' })).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(seeds()).toHaveValue('387')
    expect(chip()).toHaveTextContent('Blue Gem')
    expect(within(knifeGroup()).queryByRole('button', { name: 'Add special pattern' })).toBeNull()
    expect(within(chip() as HTMLElement).getByRole('button', { name: 'Remove special pattern Blue Gem' })).toHaveFocus()
    await user.type(screen.getByLabelText('Rating'), '9')
    await user.click(screen.getByRole('button', { name: 'Save as draft' }))
    await waitFor(() => expect(fake.to('POST /admin/combos')).toHaveLength(1))
    expect(sent(fake).knife).toEqual({
      type_slug: 'karambit',
      finish_slug: 'case-hardened',
      float_from: null,
      float_to: null,
      seeds: [387],
      pattern_group: 'blue-gem',
    })
    expect(sent(fake).glove).not.toHaveProperty('pattern_group')
  })

  it('shows on the page own knife', async () => {
    const { user } = renderApp('/knives/m9-bayonet/case-hardened/add', new FakeApi().withSession())
    const knife = await screen.findByRole('group', { name: 'Knife' })
    await user.click(await within(knife).findByRole('button', { name: 'Add special pattern' }))
    const list = within(knifeGroup()).getByRole('list', { name: 'Special patterns' })
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual(['Gold Gem · 92', 'Blue Gem · 601'])
  })

  it('keeps the seeds on Remove, and sends no group', async () => {
    const fake = new FakeApi().withSession()
    const { user } = renderApp(ADD, fake)
    await pickBlueGem(user)
    await user.click(screen.getByRole('button', { name: 'Remove special pattern Blue Gem' }))
    expect(chip()).toBeNull()
    expect(seeds()).toHaveValue('387')
    expect(within(knifeGroup()).getByRole('button', { name: 'Add special pattern' })).toHaveFocus()
    await user.type(screen.getByLabelText('Rating'), '9')
    await user.click(screen.getByRole('button', { name: 'Save as draft' }))
    await waitFor(() => expect(fake.to('POST /admin/combos')).toHaveLength(1))
    expect(sent(fake).knife.seeds).toEqual([387])
    expect(sent(fake).knife).not.toHaveProperty('pattern_group')
  })

  it('keeps the group when the seeds change, and needs a seed', async () => {
    const fake = new FakeApi().withSession()
    const { user } = renderApp(ADD, fake)
    await pickBlueGem(user)
    await user.type(seeds(), ', 619')
    expect(chip()).toHaveTextContent('Blue Gem')
    await user.clear(seeds())
    expect(chip()).toHaveTextContent('Blue Gem')
    expect(seeds()).toHaveAccessibleDescription('A special pattern needs a seed.')
    await user.type(screen.getByLabelText('Rating'), '9')
    await user.click(screen.getByRole('button', { name: 'Save as draft' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Knife pattern seeds: A special pattern needs a seed.')
    expect(fake.to('POST /admin/combos')).toHaveLength(0)

    await user.type(seeds(), '619')
    await user.click(screen.getByRole('button', { name: 'Save as draft' }))
    await waitFor(() => expect(fake.to('POST /admin/combos')).toHaveLength(1))
    expect(sent(fake).knife).toMatchObject({ seeds: [619], pattern_group: 'blue-gem' })
  })

  it('drops the group when the knife is changed', async () => {
    const fake = new FakeApi().withSession()
    const { user } = renderApp(ADD, fake)
    await pickBlueGem(user)
    await user.click(screen.getByRole('button', { name: 'Change' }))
    await pickKnife(user, 'butterfly case')
    expect(chip()).toBeNull()
    expect(seeds()).toHaveValue('387')
  })

  it.each([
    ['pattern_group_not_found', 'pattern_group', 'This pattern group was not found.'],
    ['pattern_group_not_for_item', 'pattern_group', 'This pattern group is not for this item.'],
  ])('shows %s at the special pattern', async (type, last, message) => {
    const fake = new FakeApi().withSession()
    fake.next('POST /admin/combos', refusal([['body', 'knife', last], type]))
    const { user } = renderApp(ADD, fake)
    await pickBlueGem(user)
    await user.type(screen.getByLabelText('Rating'), '9')
    await user.click(screen.getByRole('button', { name: 'Save as draft' }))
    const remove = screen.getByRole('button', { name: 'Remove special pattern Blue Gem' })
    await waitFor(() => expect(remove).toHaveAccessibleDescription(message))
    expect(screen.getByRole('alert')).toHaveTextContent(`Knife special pattern: ${message}`)
  })

  it('shows pattern_group_needs_seed at the seeds', async () => {
    const fake = new FakeApi().withSession()
    fake.next('POST /admin/combos', refusal([['body', 'knife', 'seeds'], 'pattern_group_needs_seed']))
    const { user } = renderApp(ADD, fake)
    await pickBlueGem(user)
    await user.type(screen.getByLabelText('Rating'), '9')
    await user.click(screen.getByRole('button', { name: 'Save as draft' }))
    await waitFor(() => expect(seeds()).toHaveAccessibleDescription('A special pattern needs a seed.'))
  })

  it('lists no group without a seed for the knife type', async () => {
    const fake = new FakeApi().withSession()
    fake.store.patternGroups[1].seeds = { butterfly: 670 }
    const { user } = renderApp(ADD, fake)
    await pickKnife(user, 'karambit case')
    await user.click(within(knifeGroup()).getByRole('button', { name: 'Add special pattern' }))
    expect(within(knifeGroup()).queryByRole('button', { name: /Blue Gem/ })).toBeNull()
  })

  it('renders a group name as text', async () => {
    const fake = new FakeApi().withSession()
    fake.store.patternGroups[1].name = '<img src=x>'
    const { user } = renderApp(ADD, fake)
    await pickKnife(user, 'karambit case')
    await user.click(within(knifeGroup()).getByRole('button', { name: 'Add special pattern' }))
    await user.click(within(knifeGroup()).getByRole('button', { name: '<img src=x> · 387' }))
    expect(chip()).toHaveTextContent('<img src=x>')
    expect(document.querySelector('img[src="x"]')).toBeNull()
  })
})
