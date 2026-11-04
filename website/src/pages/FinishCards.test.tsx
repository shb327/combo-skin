import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { gloveTypes } from '@/data/gloves'
import { knifeTypes } from '@/data/knives'
import { renderSite } from '@/test/render'

describe('finish cards', () => {
  it.each([
    ['/gloves/specialist', gloveTypes.find((t) => t.id === 'specialist')!],
    ['/knives/karambit', knifeTypes.find((t) => t.id === 'karambit')!],
  ])('%s shows every finish without a combo count', (path, type) => {
    const { api } = renderSite(path)
    const links = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.endsWith('/combos'))
    expect(links).toHaveLength(type.finishes.length)
    type.finishes.forEach((finish, index) => {
      expect(within(links[index]).getByRole('heading')).toHaveTextContent(finish.name)
      expect(links[index]).not.toHaveTextContent(/\d+\s*combos?\b/)
    })
    expect(api.requests).toHaveLength(0)
  })

  it('keeps the finish counts on the type cards', () => {
    renderSite('/gloves')
    for (const type of gloveTypes) {
      const card = screen.getByRole('heading', { name: type.name }).closest('div.group')
      expect(card).toHaveTextContent(`${type.finishes.length} available`)
    }
  })
})
