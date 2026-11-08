/** The batch rating fill (spec 010): every included row not set by hand is the batch's step
 * (0.05 unless changed, spec 017) below the included row above it, never below 0; the first one takes the top rating. A row's own rating
 * is used for that row only: the fill passes through it with the value it would otherwise have,
 * its typed rating included (spec 017). In hundredths. */

export interface FillRow {
  included: boolean
  byHand: boolean
  /** The rating typed by hand, or null when it is not a valid rating. */
  value: number | null
  /** The row's own rating, when it has one; null when it is not a valid rating. */
  own?: number | null
}

/** The default step: each next row 0.05 lower. */
export const STEP = 5

/** The rating of each row; null for rows not included or with no rating to show. A null `step`
 * (not a valid step) leaves the rows after the first that follow the fill without a rating. */
export function fillRatings(rows: FillRow[], topRating: number | null, step: number | null = STEP): (number | null)[] {
  let first = true
  let previous: number | null = null
  return rows.map((row) => {
    if (!row.included) return null
    const hasOwn = row.own !== undefined
    let rating: number | null
    // The fill treats a row with an own rating as it would without one, typed value included,
    // so setting, changing or clearing it moves no other row.
    if (row.byHand) rating = row.value
    else if (first) rating = topRating
    else rating = previous === null || step === null ? null : Math.max(0, previous - step)
    first = false
    // An invalid hand value is passed over: the rows below follow the last valid rating.
    previous = rating ?? (row.byHand ? previous : null)
    return hasOwn ? (row.own ?? null) : rating
  })
}
