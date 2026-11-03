import { describe, expect, it } from 'vitest'
import { fillRatings, type FillRow } from './fill'

const auto = (included = true): FillRow => ({ included, byHand: false, value: null })
const hand = (value: number | null): FillRow => ({ included: true, byHand: true, value })
const own = (value: number | null, byHand = false): FillRow => ({ included: true, byHand, value: null, own: value })

describe('fillRatings', () => {
  it('steps 0.05 down from the top rating', () => {
    expect(fillRatings([auto(), auto(), auto(), auto()], 950)).toEqual([950, 945, 940, 935])
  })

  it('never goes below 0', () => {
    expect(fillRatings([auto(), auto(), auto(), auto()], 10)).toEqual([10, 5, 0, 0])
  })

  it('follows a row set by hand, even above the row before it', () => {
    expect(fillRatings([auto(), hand(980), auto(), auto()], 950)).toEqual([950, 980, 975, 970])
  })

  it('skips rows that are not included', () => {
    expect(fillRatings([auto(), { ...hand(980), included: false }, auto()], 950)).toEqual([950, null, 945])
  })

  it('changes only rows not set by hand when the top rating changes', () => {
    const rows = [auto(), auto(), hand(900), auto()]
    expect(fillRatings(rows, 950)).toEqual([950, 945, 900, 895])
    expect(fillRatings(rows, 800)).toEqual([800, 795, 900, 895])
  })

  it('keeps a hand-set first row instead of the top rating', () => {
    expect(fillRatings([hand(700), auto()], 950)).toEqual([700, 695])
  })

  it('leaves rows empty without a top rating, and passes over an invalid hand value', () => {
    expect(fillRatings([auto(), auto()], null)).toEqual([null, null])
    expect(fillRatings([auto(), hand(null), auto()], 950)).toEqual([950, null, 945])
  })

  it('uses an own rating for its row only, and fills past it as if it followed', () => {
    expect(fillRatings([own(700), auto(), auto()], 849)).toEqual([700, 844, 839])
    expect(fillRatings([auto(), hand(900), own(100), auto()], 950)).toEqual([950, 900, 100, 890])
    // An own rating replaces a rating typed in the row, which then plays no part.
    expect(fillRatings([own(700, true), auto()], 849)).toEqual([700, 844])
    expect(fillRatings([own(null), auto()], 849)).toEqual([null, 844])
  })

  it('is exact over twenty rows', () => {
    const ratings = fillRatings(Array.from({ length: 20 }, () => auto()), 950)
    expect(ratings[19]).toBe(855)
    expect(ratings.map((r) => ((r ?? 0) / 100).toFixed(2))).toContain('8.55')
  })
})
