import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { COUNTS_PATH, deferred, fakeApi, json, type FakeApi } from '@/test/fakeApi'
import { renderSite } from '@/test/render'

const countRequests = (api: FakeApi) =>
  api.requests.filter((request) => new URL(request.url).pathname === COUNTS_PATH)
/** Lets answered requests settle. */
const settle = () => act(() => new Promise((done) => setTimeout(done, 0)))

/** The desktop dropdown's results (the mobile overlay renders the same list). */
function results(): HTMLElement[] {
  const lists = screen.getAllByRole('list')
  return within(lists[lists.length - 1]).getAllByRole('button')
}
const result = (name: string) => results().find((button) => button.textContent?.startsWith(name))!

async function search(text: string) {
  const user = userEvent.setup()
  await user.click(screen.getAllByRole('button', { name: /search/i }).at(-1)!)
  const inputs = screen.getAllByPlaceholderText('Search knives & gloves...')
  await user.type(inputs[inputs.length - 1], text)
}

function withCounts(): FakeApi {
  const api = fakeApi()
  api.counts({
    gloves: { specialist: { 'crimson-kimono': 3, mogul: 1 } },
    knives: {},
  })
  return api
}

describe('header search counts', () => {
  it('asks for counts only once the search is opened', async () => {
    const { api } = renderSite('/', { api: withCounts() })
    await settle()
    expect(countRequests(api)).toHaveLength(0)
    await search('specialist')
    await settle()
    expect(countRequests(api)).toHaveLength(1)
  })

  it('shows each result’s published combos, and nothing for none', async () => {
    renderSite('/', { api: withCounts() })
    await search('specialist')
    expect(await within(result('Specialist Gloves | Crimson Kimono')).findByText('3 combos')).toBeInTheDocument()
    expect(result('Specialist Gloves | Mogul')).toHaveTextContent(/Mogul 1 combo$/)
    const other = results().find((button) => !/Crimson Kimono|Mogul/.test(button.textContent!))!
    expect(other).not.toHaveTextContent(/combo/)
  })

  it('shows names only while counts load and when they fail', async () => {
    const api = fakeApi()
    const pending = deferred()
    api.reply(pending.reply)
    renderSite('/', { api })
    await search('specialist')
    for (const button of results()) expect(button).not.toHaveTextContent(/combo/)
    await act(async () => pending.resolve(json({ detail: 'boom' }, 500)))
    await settle()
    for (const button of results()) expect(button).not.toHaveTextContent(/combo/)
  })
})
