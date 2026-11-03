import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MESSAGES } from '../api/errors'
import { FakeApi, OTHER_USERNAME, USERNAME } from '../test/fakeApi'
import { logIn, renderApp, where } from '../test/render'

afterEach(() => {
  vi.useRealTimers()
})

type User = ReturnType<typeof renderApp>['user']

interface Form {
  name: string
  path: (fake: FakeApi) => string
  fill(user: User): Promise<void>
  /** Checks the filled values are shown. */
  filled(): void
  /** Checks the stored or empty values are shown. */
  stored(): void
  save: string
}

const knifeGroup = () => screen.getByRole('group', { name: 'Knife' })

const FORMS: Form[] = [
  {
    name: 'add',
    path: () => '/gloves/specialist/crimson-kimono/add',
    async fill(user) {
      await user.type(await screen.findByRole('combobox', { name: 'Find a knife' }), 'karambit ruby{Enter}')
      await user.type(screen.getByLabelText('Rating'), '8.88')
      await user.type(within(knifeGroup()).getByLabelText('Pattern seeds'), '12')
    },
    filled() {
      expect(screen.getByText('Karambit | Doppler (Ruby)')).toBeInTheDocument()
      expect(screen.getByLabelText('Rating')).toHaveValue('8.88')
      expect(within(knifeGroup()).getByLabelText('Pattern seeds')).toHaveValue('12')
    },
    stored() {
      expect(screen.getByRole('combobox', { name: 'Find a knife' })).toBeInTheDocument()
      expect(screen.getByLabelText('Rating')).toHaveValue('')
    },
    save: 'Save as draft',
  },
  {
    name: 'batch',
    path: () => '/gloves/specialist/crimson-kimono/batch/doppler-ruby',
    async fill(user) {
      await user.type(await screen.findByLabelText('Top rating'), '9.5')
      await user.click(screen.getByRole('checkbox', { name: 'Include Butterfly Knife' }))
      await user.clear(screen.getByLabelText('Rating for M9 Bayonet'))
      await user.type(screen.getByLabelText('Rating for M9 Bayonet'), '9.9')
      await user.type(within(knifeGroup()).getByLabelText('Float from'), '0')
      await user.type(within(knifeGroup()).getByLabelText('Float to'), '0.02')
      await user.click(screen.getByRole('button', { name: 'Own values for Karambit' }))
      await user.click(screen.getByRole('button', { name: 'Set own description for Karambit' }))
      await user.type(screen.getByLabelText('Description, Karambit only'), 'Own')
    },
    filled() {
      expect(screen.getByLabelText('Top rating')).toHaveValue('9.50')
      expect(screen.getByRole('checkbox', { name: 'Include Butterfly Knife' })).not.toBeChecked()
      expect(screen.getByLabelText('Rating for Karambit')).toHaveValue('9.50')
      expect(screen.getByLabelText('Rating for M9 Bayonet')).toHaveValue('9.90')
      expect(within(knifeGroup()).getByLabelText('Float to')).toHaveValue('0.02')
      expect(screen.getByRole('button', { name: 'Own values for Karambit (description)' })).toBeInTheDocument()
    },
    stored() {
      expect(screen.getByLabelText('Top rating')).toHaveValue('')
      expect(screen.getByRole('checkbox', { name: 'Include Butterfly Knife' })).toBeChecked()
    },
    save: 'Save 2 as drafts',
  },
  {
    name: 'edit',
    path: (fake) =>
      `/combos/${fake.store.add({ glove: 'specialist/crimson-kimono', knife: 'karambit/doppler-ruby', rating: 9 }).id}`,
    async fill(user) {
      await user.clear(await screen.findByLabelText('Rating'))
      await user.type(screen.getByLabelText('Rating'), '7.77')
      await user.type(screen.getByLabelText('Description'), 'Changed')
    },
    filled() {
      expect(screen.getByLabelText('Rating')).toHaveValue('7.77')
      expect(screen.getByLabelText('Description')).toHaveValue('Changed')
    },
    stored() {
      expect(screen.getByLabelText('Rating')).toHaveValue('9.00')
      expect(screen.getByLabelText('Description')).toHaveValue('')
    },
    save: 'Save',
  },
  {
    name: 'knife order',
    path: () => '/knife-order',
    async fill(user) {
      await user.click(await screen.findByRole('button', { name: 'Move Karambit down' }))
    },
    filled() {
      expect(screen.getByLabelText('Position of Karambit')).toHaveValue('1')
    },
    stored() {
      expect(screen.getByLabelText('Position of Karambit')).toHaveValue('0')
    },
    save: 'Save order',
  },
]

describe.each(FORMS)('the $name form', (form) => {
  it('comes back with its values after the session ends and the same admin logs in', async () => {
    const fake = new FakeApi().withSession()
    const path = form.path(fake)
    const { user } = renderApp(path, fake)
    await form.fill(user)
    fake.loggedIn = false
    await user.click(screen.getByRole('button', { name: form.save }))
    expect(await screen.findByText(MESSAGES.sessionEnded)).toBeInTheDocument()
    expect(where()).toBe(`/login?next=${encodeURIComponent(path)}`)

    await logIn(user)
    await waitFor(() => expect(where()).toBe(path))
    expect(await screen.findByText('Restored unsaved changes.')).toBeInTheDocument()
    form.filled()

    await user.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.queryByText('Restored unsaved changes.')).toBeNull()
    form.stored()
  })
})

describe('unsaved changes', () => {
  it('come back after the session expires', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const fake = new FakeApi()
    fake.expiresAt = new Date(Date.now() + 10 * 60_000).toISOString()
    fake.withSession()
    const { user } = renderApp('/gloves/specialist/crimson-kimono/add', fake, { fakeTimers: true })
    await FORMS[0].fill(user)
    fake.loggedIn = false
    await act(async () => vi.advanceTimersByTime(11 * 60_000))
    expect(await screen.findByText(MESSAGES.sessionEnded)).toBeInTheDocument()
    fake.expiresAt = new Date(Date.now() + 60 * 60_000).toISOString()
    await logIn(user)
    expect(await screen.findByText('Restored unsaved changes.')).toBeInTheDocument()
    FORMS[0].filled()
  })

  it('stay when leaving the form and coming back, and go after a save', async () => {
    const { user } = renderApp('/gloves/specialist/crimson-kimono/add', new FakeApi().withSession())
    await FORMS[0].fill(user)
    await user.click(within(screen.getByRole('navigation')).getByRole('link', { name: 'Home' }))
    expect(await screen.findByRole('heading', { name: 'Combos' })).toBeInTheDocument()
    window.history.back()
    await waitFor(() => expect(where()).toBe('/gloves/specialist/crimson-kimono/add'))
    expect(await screen.findByText('Restored unsaved changes.')).toBeInTheDocument()
    FORMS[0].filled()

    await user.click(screen.getByRole('button', { name: 'Save as draft' }))
    await waitFor(() => expect(where()).toBe('/gloves/specialist/crimson-kimono'))
    await user.click(await screen.findByRole('link', { name: 'Add knife' }))
    expect(await screen.findByRole('combobox', { name: 'Find a knife' })).toBeInTheDocument()
    expect(screen.queryByText('Restored unsaved changes.')).toBeNull()
    FORMS[0].stored()
  })

  it('are not shown to another admin', async () => {
    const fake = new FakeApi().withSession()
    const path = '/gloves/specialist/crimson-kimono/add'
    const { user } = renderApp(path, fake)
    await FORMS[0].fill(user)
    fake.loggedIn = false
    await user.click(screen.getByRole('button', { name: 'Save as draft' }))
    await logIn(user, OTHER_USERNAME)
    await waitFor(() => expect(where()).toBe(path))
    expect(await screen.findByText(OTHER_USERNAME)).toBeInTheDocument()
    expect(await screen.findByRole('combobox', { name: 'Find a knife' })).toBeInTheDocument()
    expect(screen.queryByText('Restored unsaved changes.')).toBeNull()
    FORMS[0].stored()
  })

  it('make logout ask first, and go with the logout', async () => {
    const fake = new FakeApi().withSession()
    const path = '/gloves/specialist/crimson-kimono/add'
    const { user } = renderApp(path, fake)
    await FORMS[0].fill(user)
    await user.click(screen.getByRole('button', { name: 'Log out' }))
    const dialog = screen.getByRole('dialog', { name: 'Log out and discard unsaved changes?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(fake.to('POST /admin/logout')).toHaveLength(0)
    expect(screen.getByText(USERNAME)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Log out' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Log out' }))
    expect(await screen.findByLabelText('Username')).toBeInTheDocument()
    expect(fake.to('POST /admin/logout')).toHaveLength(1)
    await logIn(user)
    window.history.pushState(null, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(await screen.findByRole('combobox', { name: 'Find a knife' })).toBeInTheDocument()
    expect(screen.queryByText('Restored unsaved changes.')).toBeNull()
  })

  it('make the browser warn before a reload', async () => {
    const { user } = renderApp('/gloves/specialist/crimson-kimono/add', new FakeApi().withSession())
    await screen.findByRole('combobox', { name: 'Find a knife' })
    const before = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(before)
    expect(before.defaultPrevented).toBe(false)
    await FORMS[0].fill(user)
    const after = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(after)
    expect(after.defaultPrevented).toBe(true)
  })
})
