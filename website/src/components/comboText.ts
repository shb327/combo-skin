import type { ComboItem } from '@/api/client'

/** "Karambit | Doppler (Ruby)". */
export function itemName(item: ComboItem): string {
  return `${item.type_name} | ${item.display_name}`
}

/** A finish without a float range (Vanilla) has no float or pattern to choose. */
function hasNoFloat(item: ComboItem): boolean {
  return item.float_min === null
}

/** "0 - 0.01"; "Any" without a range; "None" for a finish that has no float. */
export function floatRange(item: ComboItem): string {
  if (hasNoFloat(item)) return 'None'
  if (item.float_from === null || item.float_to === null) return 'Any'
  return `${item.float_from} - ${item.float_to}`
}

/** "2, 179"; "Any" when any pattern goes; "None" for a finish that has no float. */
export function patternSeeds(item: ComboItem): string {
  if (hasNoFloat(item)) return 'None'
  return item.seeds.length > 0 ? item.seeds.join(', ') : 'Any'
}

/** "combo" or "combos", for a count shown beside it. */
export function comboWord(count: number): string {
  return count === 1 ? 'combo' : 'combos'
}

/** "15 combos", "1 combo", or "No combos yet". */
export function comboCount(count: number): string {
  if (count === 0) return 'No combos yet'
  return `${count} ${comboWord(count)}`
}
