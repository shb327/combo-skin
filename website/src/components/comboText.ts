import type { ComboItem } from '@/api/client'

/** "Karambit | Doppler (Ruby)". */
export function itemName(item: ComboItem): string {
  return `${item.type_name} | ${item.display_name}`
}

/** "0 - 0.01", or null without a range. */
export function floatRange(item: ComboItem): string | null {
  if (item.float_from === null || item.float_to === null) return null
  return `${item.float_from} - ${item.float_to}`
}

/** "2, 179", or null when any pattern goes. */
export function patternSeeds(item: ComboItem): string | null {
  return item.seeds.length > 0 ? item.seeds.join(', ') : null
}
