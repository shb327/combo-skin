import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FakeApi } from '../test/fakeApi'
import { renderApp } from '../test/render'

function withDrafts() {
  const fake = new FakeApi().withSession()
  for (const knife of ['karambit', 'butterfly', 'm9-bayonet']) {
    fake.store.add({ glove: 'specialist/crimson-kimono', knife: `${knife}/doppler-ruby`, rating: 9 })
  }
  fake.store.add({ glove: 'sport/vice', knife: 'karambit/doppler-ruby', rating: 8, status: 'unpublished' })
  return fake
}

describe('publish all drafts', () => {
  it('shows the draft count and publishes only drafts after confirmation', async () => {
    const fake = withDrafts()
    const { user } = renderApp('/', fake)
    expect(await screen.findByText('3 drafts across all finishes.')).toBeInTheDocument()
    const [count] = fake.to('GET /admin/combos')
    expect(Object.fromEntries(new URL(count.url).searchParams)).toEqual({ status: 'draft', limit: '1' })

    await user.click(screen.getByRole('button', { name: 'Publish all drafts' }))
    let dialog = screen.getByRole('dialog', { name: 'Publish all 3 drafts?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(fake.to('POST /admin/combos/publish')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Publish all drafts' }))
    dialog = screen.getByRole('dialog', { name: 'Publish all 3 drafts?' })
    await user.click(within(dialog).getByRole('button', { name: 'Publish all' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Published 3 drafts.')
    expect(JSON.parse(fake.to('POST /admin/combos/publish')[0].body)).toEqual({ all_drafts: true })
    expect(fake.store.combos.map((c) => c.status)).toEqual(['published', 'published', 'published', 'unpublished'])
    await waitFor(() => expect(screen.getByText('0 drafts across all finishes.')).toBeInTheDocument())
  })
})
