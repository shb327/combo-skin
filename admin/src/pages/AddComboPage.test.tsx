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
    expect(agent.querySelector('img')?.getAttribute('src')).toMatch(/fake\/agent\/5404$/)
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
