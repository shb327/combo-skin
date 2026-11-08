import { describe, expect, it } from 'vitest'
import { fillRatings, type FillRow } from './fill'

const auto = (included = true): FillRow => ({ included, byHand: false, value: null })
const hand = (value: number | null): FillRow => ({ included: true, byHand: true, value })
const own = (value: number | null): FillRow => ({ included: true, byHand: false, value: null, own: value })

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
    expect(fillRatings([own(null), auto()], 849)).toEqual([null, 844])
  })

  it('keeps a typed rating carrying on down when the row gets an own rating', () => {
    // Butterfly Knife typed 9, then given its own 7: M9 Bayonet stays at 8.95.
    expect(fillRatings([auto(), hand(900), auto()], 849)).toEqual([849, 900, 895])
    expect(fillRatings([auto(), { ...hand(900), own: 700 }, auto()], 849)).toEqual([849, 700, 895])
  })

  it('changes no other row when an own rating is set, changed or cleared', () => {
    const rows: FillRow[] = [
      auto(),
      hand(980),
      auto(false),
      auto(),
      hand(null),
      auto(),
      { ...hand(500), included: false },
      hand(20),
      auto(),
      auto(),
    ]
    for (const top of [950, null]) {
      const before = fillRatings(rows, top)
      rows.forEach((row, index) => {
        for (const value of [700, 0, null]) {
          const withOwn = rows.map((r, i) => (i === index ? { ...r, own: value } : r))
          const after = fillRatings(withOwn, top)
          after.forEach((rating, i) => {
            if (i !== index) expect(rating).toBe(before[i])
          })
          expect(after[index]).toBe(row.included ? value : null)
        }
      })
    }
  })

  it('is exact over twenty rows', () => {
    const ratings = fillRatings(Array.from({ length: 20 }, () => auto()), 950)
    expect(ratings[19]).toBe(855)
    expect(ratings.map((r) => ((r ?? 0) / 100).toFixed(2))).toContain('8.55')
  })
})
