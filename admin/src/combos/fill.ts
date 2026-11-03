/** The batch rating fill (spec 010): every included row not set by hand is 0.05 below the
 * included row above it, never below 0; the first one takes the top rating. A row's own rating
 * is used for that row only: the fill passes through it with the value it would otherwise have.
 * In hundredths. */

export interface FillRow {
  included: boolean
  byHand: boolean
  /** The rating typed by hand, or null when it is not a valid rating. */
  value: number | null
  /** The row's own rating, when it has one; null when it is not a valid rating. */
  own?: number | null
}

const STEP = 5

/** The rating of each row; null for rows not included or with no rating to show. */
export function fillRatings(rows: FillRow[], topRating: number | null): (number | null)[] {
  let first = true
  let previous: number | null = null
  return rows.map((row) => {
    if (!row.included) return null
    const hasOwn = row.own !== undefined
    let rating: number | null
    // An own rating replaces a typed one, so a row with one is filled as if never typed in.
    if (row.byHand && !hasOwn) rating = row.value
    else if (first) rating = topRating
    else rating = previous === null ? null : Math.max(0, previous - STEP)
    first = false
    // An invalid hand value is passed over: the rows below follow the last valid rating.
    previous = rating ?? (row.byHand && !hasOwn ? previous : null)
    return hasOwn ? (row.own ?? null) : rating
  })
}
