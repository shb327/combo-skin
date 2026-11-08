import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FakeApi } from '../test/fakeApi'
import { tokenOf } from '../test/fakeCatalog'
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
    expect(await screen.findByText('Saved the default agent. 0 combos get a new screenshot.')).toBeInTheDocument()
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

describe('screenshots after a default agent change', () => {
  it('says how many combos get a new screenshot', async () => {
    const fake = new FakeApi().withSession()
    fake.store.add({ glove: 'specialist/crimson-kimono', knife: 'karambit/doppler-ruby', rating: 9, shot: 'done' })
    fake.store.add({ glove: 'specialist/crimson-kimono', knife: 'butterfly/doppler-ruby', rating: 8, shot: 'done' })
    fake.store.add({ glove: 'specialist/crimson-kimono', knife: 'm9-bayonet/doppler-ruby', rating: 7, shot: 'done', agent: 4613 })
    const { user } = renderApp('/screenshots', fake)
    const current = await screen.findByRole('group', { name: 'Default agent' })
    await within(current).findByText('Lt. Commander Ricksaw | NSWC SEAL')
    await user.type(within(current).getByRole('combobox', { name: 'Find an agent' }), 'darryl')
    await user.keyboard('{ArrowDown}{Enter}')
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('2 combos use the default agent. Their screenshots are drawn again.')
    await user.click(within(dialog).getByRole('button', { name: 'Change default' }))
    expect(await screen.findByText('Saved the default agent. 2 combos get a new screenshot.')).toBeInTheDocument()
  })
})

describe('screenshot workers', () => {
  it('lists workers and creates one, showing its token once', async () => {
    const fake = new FakeApi().withSession()
    fake.store.createWorker({ name: 'mac-studio' }, 'placeholder-admin')
    fake.store.revokeWorker(1)
    const { user } = renderApp('/screenshots', fake)
    const workers = await screen.findByRole('region', { name: 'Screenshot workers' })
    const table = await within(workers).findByRole('table')
    const rows = () => within(table).getAllByRole('row').slice(1)
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Name',
      'Created',
      'Last seen',
      'Revoked',
      'Actions',
    ])
    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toHaveTextContent('mac-studio')
    expect(rows()[0]).toHaveTextContent('Never')
    expect(within(rows()[0]).queryByRole('button', { name: /Revoke/ })).toBeNull()

    await user.type(within(workers).getByRole('textbox', { name: 'Worker name' }), 'render-pc')
    await user.click(within(workers).getByRole('button', { name: 'Create worker' }))
    const token = await within(workers).findByRole('textbox', { name: 'Token for render-pc' })
    expect(token).toHaveValue(tokenOf(2))
    expect(token).toHaveAttribute('readonly')
    expect(within(workers).getByText('Shown once: copy it to the worker now.')).toBeInTheDocument()
    expect(JSON.parse(fake.to('POST /admin/workers')[0].body)).toEqual({ name: 'render-pc' })
    await waitFor(() => expect(rows()).toHaveLength(2))

    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await user.click(within(workers).getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith(tokenOf(2))
    expect(await within(workers).findByText('Copied.')).toBeInTheDocument()

    // The token is in no store: not in the drafts (nothing unsaved), nor in browser storage.
    const leaving = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(leaving)
    expect(leaving.defaultPrevented).toBe(false)
    // The guard rails forbid these everywhere; this test only reads them to prove they stay empty.
    // eslint-disable-next-line no-restricted-globals
    expect(localStorage.length).toBe(0)
    // eslint-disable-next-line no-restricted-globals
    expect(sessionStorage.length).toBe(0)
    // eslint-disable-next-line no-restricted-properties, no-restricted-syntax
    expect(document.cookie).toBe('')

    await user.click(screen.getAllByRole('link', { name: 'Home' })[0])
    await waitFor(() => expect(where()).toBe('/'))
    await user.click(await screen.findByRole('link', { name: 'Change the default agent' }))
    const again = await screen.findByRole('region', { name: 'Screenshot workers' })
    await within(again).findByText('render-pc')
    expect(within(again).queryByRole('textbox', { name: /Token/ })).toBeNull()
    expect(document.body.textContent).not.toContain(tokenOf(2))
  })

  it('says a name is taken', async () => {
    const fake = new FakeApi().withSession()
    fake.store.createWorker({ name: 'render-pc' }, 'placeholder-admin')
    const { user } = renderApp('/screenshots', fake)
    const workers = await screen.findByRole('region', { name: 'Screenshot workers' })
    await user.type(within(workers).getByRole('textbox', { name: 'Worker name' }), 'render-pc')
    await user.click(within(workers).getByRole('button', { name: 'Create worker' }))
    expect(await within(workers).findByRole('alert')).toHaveTextContent('A worker with this name already exists.')
    expect(within(workers).queryByRole('textbox', { name: /Token/ })).toBeNull()
  })

  it('revokes a worker after a confirmation naming it', async () => {
    const fake = new FakeApi().withSession()
    fake.store.createWorker({ name: 'render-pc' }, 'placeholder-admin')
    const { user } = renderApp('/screenshots', fake)
    const workers = await screen.findByRole('region', { name: 'Screenshot workers' })
    await user.click(await within(workers).findByRole('button', { name: 'Revoke render-pc' }))
    let dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Revoke render-pc?')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(fake.to('POST /admin/workers/{id}/revoke')).toHaveLength(0)

    await user.click(within(workers).getByRole('button', { name: 'Revoke render-pc' }))
    dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Revoke' }))
    expect(fake.to('POST /admin/workers/{id}/revoke').map((r) => new URL(r.url).pathname)).toEqual([
      '/admin/workers/1/revoke',
    ])
    await waitFor(() => expect(within(workers).queryByRole('button', { name: 'Revoke render-pc' })).toBeNull())
  })
})

describe('failed screenshots', () => {
  it('are listed with links and asked again in one request', async () => {
    const fake = new FakeApi().withSession()
    const failed = [
      fake.store.add({ glove: 'specialist/crimson-kimono', knife: 'karambit/doppler-ruby', rating: 9, shot: 'failed' }),
      fake.store.add({ glove: 'sport/vice', knife: 'butterfly/doppler-ruby', rating: 8, shot: 'failed', reason: 'timeout' }),
    ]
    fake.store.add({ glove: 'sport/vice', knife: 'karambit/doppler-ruby', rating: 7, shot: 'done' })
    const { user } = renderApp('/screenshots', fake)
    const section = await screen.findByRole('region', { name: 'Failed screenshots' })
    const links = await within(section).findAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual(failed.map((c) => `/combos/${c.id}`))
    expect(section).toHaveTextContent('Drawing this combo took too long.')

    await user.click(within(section).getByRole('button', { name: 'Ask again for all failed' }))
    expect(fake.to('POST /admin/screenshots/request').map((r) => JSON.parse(r.body))).toEqual([
      { ids: failed.map((c) => c.id) },
    ])
    expect(await within(section).findByText('No failed screenshots.')).toBeInTheDocument()
  })
})
