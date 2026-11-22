import { describe, expect, it } from 'vitest'
import { PATTERN_GROUPS } from '../test/fakeCatalog'
import { batchChoices, groupLabel, itemChoices, rowKnife } from './patterns'

const knife = { from: '0', to: '0.5', seeds: '' }

describe('itemChoices', () => {
  it('lists the groups of the item kind, finish and type, with that type seed', () => {
    expect(itemChoices(PATTERN_GROUPS, 'knife', 'karambit', 'case-hardened')).toEqual([
      { label: 'Gold Gem · 128', pick: { slug: 'gold-gem', name: 'Gold Gem' }, seed: 128 },
      { label: 'Blue Gem · 387', pick: { slug: 'blue-gem', name: 'Blue Gem' }, seed: 387 },
      { label: 'Test Pattern · 555', pick: { slug: 'test-pattern', name: 'Test Pattern' }, seed: 555 },
    ])
    expect(itemChoices(PATTERN_GROUPS, 'knife', 'butterfly', 'case-hardened').map((c) => c.label)).toEqual(['Blue Gem · 670'])
  })

  it('lists none for another finish, another kind or no groups', () => {
    expect(itemChoices(PATTERN_GROUPS, 'knife', 'karambit', 'vanilla')).toEqual([])
    expect(itemChoices(PATTERN_GROUPS, 'glove', 'karambit', 'case-hardened')).toEqual([])
    expect(itemChoices(undefined, 'knife', 'karambit', 'case-hardened')).toEqual([])
  })
})

describe('batchChoices', () => {
  it('lists the knife groups of the batch finish, each with every knife seed', () => {
    const choices = batchChoices(PATTERN_GROUPS, 'case-hardened')
    expect(choices.map((c) => c.label)).toEqual(['Gold Gem', 'Blue Gem', 'Test Pattern'])
    expect(choices[1]).toEqual({
      label: 'Blue Gem',
      pick: { slug: 'blue-gem', name: 'Blue Gem', seeds: { karambit: 387, butterfly: 670, 'm9-bayonet': 601 } },
    })
    expect(batchChoices(PATTERN_GROUPS, 'doppler-ruby')).toEqual([])
  })
})

describe('rowKnife', () => {
  const [gold] = batchChoices(PATTERN_GROUPS, 'case-hardened')

  it('gives a knife the group seed of its type', () => {
    expect(rowKnife({ ...knife, group: gold.pick }, 'm9-bayonet')).toEqual({
      ...knife,
      seeds: '92',
      group: { slug: 'gold-gem', name: 'Gold Gem' },
    })
  })

  it('gives a knife the group does not cover any pattern and no group', () => {
    expect(rowKnife({ ...knife, group: gold.pick }, 'butterfly')).toEqual({ ...knife, seeds: '', group: null })
  })

  it('leaves values without a batch-wide group as they are', () => {
    expect(rowKnife({ ...knife, seeds: '5' }, 'butterfly')).toEqual({ ...knife, seeds: '5' })
  })
})

describe('groupLabel', () => {
  it('names the group before its seeds', () => {
    expect(groupLabel('Blue Gem', '601')).toBe('Blue Gem · 601')
    expect(groupLabel('Blue Gem', '3 1')).toBe('Blue Gem · 1, 3')
    expect(groupLabel('Blue Gem', '')).toBe('Blue Gem')
  })
})
