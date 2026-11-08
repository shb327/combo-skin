import { describe, expect, it } from 'vitest'
import { ratingBetween } from './order'

describe('ratingBetween', () => {
  it('takes the midpoint between two neighbours, rounded down', () => {
    expect(ratingBetween(879, 862)).toBe(870)
    expect(ratingBetween(864, 862)).toBe(863)
    expect(ratingBetween(1000, 0)).toBe(500)
  })

  it('finds none between neighbours less than 0.02 apart', () => {
    expect(ratingBetween(862, 861)).toBeNull()
    expect(ratingBetween(862, 862)).toBeNull()
  })

  it('goes 0.05 above the first combo, at most 10.00', () => {
    expect(ratingBetween(null, 900)).toBe(905)
    expect(ratingBetween(null, 996)).toBe(1000)
    expect(ratingBetween(null, 1000)).toBeNull()
  })

  it('goes 0.05 below the last combo, at least 0.00', () => {
    expect(ratingBetween(900, null)).toBe(895)
    expect(ratingBetween(3, null)).toBe(0)
    expect(ratingBetween(0, null)).toBeNull()
  })

  it('needs at least one neighbour', () => {
    expect(ratingBetween(null, null)).toBeNull()
  })
})
