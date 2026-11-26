import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { gloveTypes } from '@/data/gloves'
import { knifeTypes } from '@/data/knives'
import { fakeApi, type FakeApi } from '@/test/fakeApi'
import { finishCards } from '@/test/finishPage'
import { renderSite } from '@/test/render'

const SPECIALIST = gloveTypes.find((t) => t.id === 'specialist')!
const KARAMBIT = knifeTypes.find((t) => t.id === 'karambit')!
const COUNTS = {
  gloves: { specialist: { [SPECIALIST.finishes[0].id]: 18 } },
  knives: { karambit: { [KARAMBIT.finishes[0].id]: 2 } },
}

const finishNames = () => finishCards().map((link) => within(link).getByRole('heading').textContent)
const typeNames = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
const card = (name: string) =>
  finishCards().find((link) => within(link).getByRole('heading').textContent === name)!
const typeCard = (name: string) => screen.getByRole('heading', { name }).closest('div.group')!

function withCounts(): FakeApi {
  const api = fakeApi()
  api.counts(COUNTS)
  return api
}

/** No filter of any kind on the page, not even a hidden one. */
function expectNoFilter() {
  expect(screen.queryByRole('checkbox', { hidden: true })).toBeNull()
  expect(screen.queryByText(/has combos/i)).toBeNull()
}

describe('type grids', () => {
  it.each([
    ['/gloves', gloveTypes, SPECIALIST.name, '18 combos'],
    ['/gloves?has=combos', gloveTypes, SPECIALIST.name, '18 combos'],
    ['/knives', knifeTypes, KARAMBIT.name, '2 combos'],
    ['/knives?has=combos', knifeTypes, KARAMBIT.name, '2 combos'],
  ])('%s shows every type with its count, and no filter', async (path, types, name, count) => {
    renderSite(path, { api: withCounts() })
    await waitFor(() => expect(typeCard(name)).toHaveTextContent(new RegExp(`${count}$`)))
    expect(typeNames()).toEqual(types.map((type) => type.name))
    expectNoFilter()
  })
})

describe('finish grids', () => {
  it.each([
    ['/gloves/specialist', SPECIALIST, '18 combos'],
    ['/gloves/specialist?has=combos', SPECIALIST, '18 combos'],
    ['/knives/karambit', KARAMBIT, '2 combos'],
    ['/knives/karambit?has=combos', KARAMBIT, '2 combos'],
  ])('%s shows every finish with its count, and no filter', async (path, type, count) => {
    renderSite(path, { api: withCounts() })
    const counted = type.finishes[0].name
    expect(await within(card(counted)).findByText(count.split(' ')[0])).toBeInTheDocument()
    expect(card(counted)).toHaveTextContent(new RegExp(`${count}$`))
    expect(finishNames()).toEqual(type.finishes.map((finish) => finish.name))
    expectNoFilter()
  })
})
