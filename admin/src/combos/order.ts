/** Placing a combo between others of a finish's list by giving it a rating (spec 017). Ratings
 * are in hundredths, from 0 to 10.00; the list is sorted from the highest rating down. */

const MAX = 1000
const END_STEP = 5

/** The rating for a combo dropped below `above` and over `below` (null at either end of the
 * list): the midpoint rounded down; 0.05 over the first combo or under the last one. Null when
 * no rating fits. */
export function ratingBetween(above: number | null, below: number | null): number | null {
  if (above !== null && below !== null) return above - below >= 2 ? Math.floor((above + below) / 2) : null
  if (below !== null) return below < MAX ? Math.min(MAX, below + END_STEP) : null
  if (above !== null) return above > 0 ? Math.max(0, above - END_STEP) : null
  return null
}
