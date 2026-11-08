import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FakeApi } from '../test/fakeApi'
import { renderApp } from '../test/render'

const GLOVES = '/gloves/specialist/crimson-kimono'

function withStates() {
  const fake = new FakeApi().withSession()
  const s = fake.store
  s.add({ glove: 'specialist/crimson-kimono', knife: 'karambit/doppler-ruby', rating: 9, shot: 'none' })
  s.add({ glove: 'specialist/crimson-kimono', knife: 'butterfly/doppler-ruby', rating: 8, shot: 'waiting', rendering: true })
  s.add({ glove: 'specialist/crimson-kimono', knife: 'm9-bayonet/doppler-ruby', rating: 7, shot: 'done' })
  s.add({ glove: 'specialist/crimson-kimono', knife: 'karambit/blue-steel', rating: 6, shot: 'failed', reason: 'asset_missing' })
  s.add({ glove: 'sport/vice', knife: 'karambit/doppler-ruby', rating: 5, shot: 'none', rendering: true })
  return fake
}

const badges = (item: HTMLElement) =>
  within(item)
    .getAllByTestId('screenshot-badge')
    .map((badge) => badge.textContent)

describe('screenshot states', () => {
  it('are shown as text on each combo of a finish page', async () => {
    renderApp(GLOVES, withStates())
    const list = await screen.findByRole('region', { name: 'Combos' })
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(4))
    expect(within(list).getAllByRole('listitem').map(badges)).toEqual([
      ['Screenshot: None'],
      ['Screenshot: Waiting', 'Rendering'],
      ['Screenshot: Done'],
      ['Screenshot: Failed'],
    ])
  })

  it('are counted on Home', async () => {
    renderApp('/', withStates())
    const figures = await screen.findByRole('list', { name: 'Screenshots by state' })
    expect(within(figures).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '2without a screenshot',
      '1waiting for a new one',
      '1done',
      '1failed',
    ])
  })
})

describe('the screenshot on the edit page', () => {
  it('shows the 1280 version and the state, and asks for a new one', async () => {
    const fake = withStates()
    const done = fake.store.combos[2]
    const { user } = renderApp(`/combos/${done.id}`, fake)
    const section = await screen.findByRole('region', { name: 'Screenshot' })
    const image = within(section).getByRole('img')
    expect(image).toHaveAttribute('src', done.screenshot?.images[1].url)
    expect(image).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(within(section).getByTestId('screenshot-badge')).toHaveTextContent('Done')

    await user.click(within(section).getByRole('button', { name: 'Ask for a new screenshot' }))
    expect(await within(section).findByRole('status')).toHaveTextContent('A new screenshot is on its way.')
    expect(fake.to('POST /admin/screenshots/request').map((r) => JSON.parse(r.body))).toEqual([{ ids: [done.id] }])
    await waitFor(() => expect(within(section).getByTestId('screenshot-badge')).toHaveTextContent('Waiting'))
  })

  it('says when there is none yet, and shows no image off our image host', async () => {
    const fake = withStates()
    const none = fake.store.combos[0]
    renderApp(`/combos/${none.id}`, fake)
    const section = await screen.findByRole('region', { name: 'Screenshot' })
    expect(within(section).queryByRole('img')).toBeNull()
    expect(section).toHaveTextContent('No screenshot yet.')
  })

  it.each([
    ['render_failed', 'The viewer could not draw this combo.'],
    ['asset_missing', 'An item or agent is missing from the viewer’s files.'],
    ['timeout', 'Drawing this combo took too long.'],
    ['lease_expired', 'The screenshot worker stopped answering.'],
  ] as const)('gives the fixed text for %s', async (reason, text) => {
    const fake = new FakeApi().withSession()
    const combo = fake.store.add({
      glove: 'specialist/crimson-kimono',
      knife: 'karambit/doppler-ruby',
      rating: 9,
      shot: 'failed',
      reason,
    })
    renderApp(`/combos/${combo.id}`, fake)
    const section = await screen.findByRole('region', { name: 'Screenshot' })
    expect(within(section).getByTestId('screenshot-badge')).toHaveTextContent('Failed')
    expect(section).toHaveTextContent(text)
  })
})
