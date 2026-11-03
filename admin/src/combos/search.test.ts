import { describe, expect, it } from 'vitest'
import { matches, search } from './search'

const finishes = [
  { label: 'Specialist Gloves | Crimson Kimono' },
  { label: 'Specialist Gloves | Fade' },
  { label: 'Butterfly Knife | Doppler (Ruby)' },
  { label: 'Karambit | Doppler (Ruby)' },
  { label: 'Karambit | Doppler (Sapphire)' },
  { label: 'Karambit | Blue Steel' },
]

describe('search', () => {
  it('matches words in any order and letter case', () => {
    expect(search(finishes, 'kimono spec').results).toEqual([finishes[0]])
    expect(search(finishes, 'SPEC kim').results).toEqual([finishes[0]])
    expect(matches('creme', 'Crème Brûlée')).toBe(true)
  })

  it('keeps the order of the entries', () => {
    expect(search(finishes, 'ruby').results).toEqual([finishes[2], finishes[3]])
  })

  it('matches nothing for an empty query', () => {
    expect(search(finishes, '  ').results).toEqual([])
  })

  it('shows at most 50 results', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ label: `Karambit | Finish ${i}` }))
    const found = search(many, 'karambit')
    expect(found.results).toHaveLength(50)
    expect(found.more).toBe(true)
    expect(search(finishes, 'karambit').more).toBe(false)
  })
})
