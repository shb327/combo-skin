/** Typing, checking and showing combo values. Ratings are held as whole hundredths and float
 * values as whole ten-thousandths, so stepping and comparing never drift. */

export const CHECKS = {
  ratingMissing: 'Enter a rating.',
  notANumber: 'Enter a number such as 8.88.',
  ratingRange: 'Rating must be from 0 to 10.',
  ratingDecimals: 'Use at most 2 decimals.',
  floatNotANumber: 'Enter a number such as 0.15.',
  floatDecimals: 'Use at most 4 decimals.',
  bothOrNeither: 'Enter both From and To, or neither.',
  fromBelowTo: 'From must be below To.',
  vanilla: 'Vanilla has no float or pattern.',
  seedValues: 'Seeds are whole numbers from 0 to 1000.',
  seedCount: 'At most 100 seeds.',
  descriptionLength: 'At most 1000 characters.',
  controlCharacters: 'Remove tabs and other control characters.',
} as const

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string }

/** A finish's own float range from the catalog; both null for Vanilla. */
export interface FinishRange {
  min: number | null
  max: number | null
}

/** What the owner typed for one item. */
export interface ConditionsText {
  from: string
  to: string
  seeds: string
}

export interface Conditions {
  float_from: number | null
  float_to: number | null
  seeds: number[]
}

export const NO_CONDITIONS: ConditionsText = { from: '', to: '', seeds: '' }

const NUMBER = /^-?(\d+(\.\d*)?|\.\d+)$/

/** Whole units of 10^-places, or why the text is not a number with that many decimals. */
function parseDecimal(text: string, places: number): Checked<number> | 'places' | 'nan' {
  const clean = text.trim().replace(',', '.')
  if (!NUMBER.test(clean)) return 'nan'
  const negative = clean.startsWith('-')
  const [whole, fraction = ''] = clean.replace('-', '').split('.')
  if (fraction.length > places) return 'places'
  const units = Number(whole || '0') * 10 ** places + Number(fraction.padEnd(places, '0') || '0')
  return { ok: true, value: negative ? -units : units }
}

export function parseRating(text: string): Checked<number> {
  if (!text.trim()) return { ok: false, error: CHECKS.ratingMissing }
  const parsed = parseDecimal(text, 2)
  if (parsed === 'nan') return { ok: false, error: CHECKS.notANumber }
  if (parsed === 'places') return { ok: false, error: CHECKS.ratingDecimals }
  if (!parsed.ok) return parsed
  if (parsed.value < 0 || parsed.value > 1000) return { ok: false, error: CHECKS.ratingRange }
  return parsed
}

export function formatRating(hundredths: number): string {
  return (hundredths / 100).toFixed(2)
}

/** The rating 0.05 up or down from what is typed, kept within 0 and 10. */
export function stepRating(text: string, direction: 1 | -1): string {
  const current = parseRating(text)
  const from = current.ok ? current.value : 0
  return formatRating(Math.min(1000, Math.max(0, from + direction * 5)))
}

/** A float value from the API or the catalog in ten-thousandths, read from its shortest form. */
export function floatUnits(value: number): number {
  const parsed = parseDecimal(String(value), 4)
  return typeof parsed === 'object' && parsed.ok ? parsed.value : Math.round(value * 10000)
}

/** A float value as stored, without trailing zeros. */
export function formatFloat(value: number): string {
  return String(value)
}

function formatBound(value: number): string {
  const text = String(value)
  const decimals = text.includes('.') ? text.split('.')[1].length : 0
  return value.toFixed(Math.max(2, decimals))
}

export function rangeMessage(range: FinishRange): string {
  return `Outside this finish's range, ${formatBound(range.min ?? 0)} to ${formatBound(range.max ?? 0)}.`
}

/** The placeholder for a range field: `0.06 – 0.80`. */
export function rangeHint(range: FinishRange): string {
  return range.min === null || range.max === null
    ? ''
    : `${formatBound(range.min)} – ${formatBound(range.max)}`
}

export function parseSeeds(text: string): Checked<number[]> & { removed?: number } {
  const tokens = text.split(/[\s,]+/).filter(Boolean)
  const seeds: number[] = []
  for (const token of tokens) {
    if (!/^\d{1,4}$/.test(token) || Number(token) > 1000) return { ok: false, error: CHECKS.seedValues }
    seeds.push(Number(token))
  }
  const unique = [...new Set(seeds)].sort((a, b) => a - b)
  if (unique.length > 100) return { ok: false, error: CHECKS.seedCount }
  return { ok: true, value: unique, removed: seeds.length - unique.length }
}

export function formatSeeds(seeds: number[]): string {
  return seeds.join(', ')
}

export type ConditionsErrors = Partial<Record<keyof ConditionsText, string>>

/** Checks one item's conditions against its finish; `value` is set when there is no error. */
export function checkConditions(
  text: ConditionsText,
  range: FinishRange,
): { errors: ConditionsErrors; value?: Conditions } {
  const errors: ConditionsErrors = {}
  const from = text.from.trim()
  const to = text.to.trim()
  if (range.min === null || range.max === null) {
    if (from) errors.from = CHECKS.vanilla
    if (to) errors.to = CHECKS.vanilla
    if (text.seeds.trim()) errors.seeds = CHECKS.vanilla
    if (Object.keys(errors).length) return { errors }
    return { errors, value: { float_from: null, float_to: null, seeds: [] } }
  }

  let floatFrom: number | null = null
  let floatTo: number | null = null
  if (from || to) {
    if (!from) errors.from = CHECKS.bothOrNeither
    if (!to) errors.to = CHECKS.bothOrNeither
    const bounds = { from, to }
    const units: Partial<Record<'from' | 'to', number>> = {}
    for (const key of ['from', 'to'] as const) {
      if (!bounds[key]) continue
      const parsed = parseDecimal(bounds[key], 4)
      if (parsed === 'nan') errors[key] = CHECKS.floatNotANumber
      else if (parsed === 'places') errors[key] = CHECKS.floatDecimals
      else if (parsed.ok) units[key] = parsed.value
    }
    const min = floatUnits(range.min)
    const max = floatUnits(range.max)
    if (units.from !== undefined && units.from < min) errors.from = rangeMessage(range)
    if (units.to !== undefined && units.to > max) errors.to = rangeMessage(range)
    if (units.from !== undefined && units.to !== undefined && !errors.from && !errors.to) {
      if (units.from >= units.to) errors.to = CHECKS.fromBelowTo
    }
    if (units.from !== undefined) floatFrom = units.from / 10000
    if (units.to !== undefined) floatTo = units.to / 10000
  }

  const seeds = parseSeeds(text.seeds)
  if (!seeds.ok) errors.seeds = seeds.error
  if (Object.keys(errors).length || !seeds.ok) return { errors }
  return { errors, value: { float_from: floatFrom, float_to: floatTo, seeds: seeds.value } }
}

/** Conditions from the API as the owner would type them. */
export function conditionsText(conditions: Conditions): ConditionsText {
  return {
    from: conditions.float_from === null ? '' : formatFloat(conditions.float_from),
    to: conditions.float_to === null ? '' : formatFloat(conditions.float_to),
    seeds: formatSeeds(conditions.seeds),
  }
}

/** A control character other than a line break, which the API refuses. */
function hasControl(text: string): boolean {
  for (const char of text) {
    const code = char.charCodeAt(0)
    if ((code < 32 && char !== '\n' && char !== '\r') || code === 127) return true
  }
  return false
}

export function checkDescription(text: string): Checked<string | null> {
  const trimmed = text.trim()
  if (hasControl(trimmed)) return { ok: false, error: CHECKS.controlCharacters }
  if ([...trimmed].length > 1000) return { ok: false, error: CHECKS.descriptionLength }
  return { ok: true, value: trimmed || null }
}

/** `Gloves 0.06–0.15 · seeds 2, 179, 300 (+3)`, or `Knife any`. */
export function conditionsSummary(label: string, conditions: Conditions): string {
  const parts: string[] = []
  if (conditions.float_from !== null && conditions.float_to !== null) {
    parts.push(`${formatFloat(conditions.float_from)}–${formatFloat(conditions.float_to)}`)
  }
  if (conditions.seeds.length) {
    const shown = conditions.seeds.slice(0, 3).join(', ')
    const more = conditions.seeds.length - 3
    parts.push(`seeds ${shown}${more > 0 ? ` (+${more})` : ''}`)
  }
  return `${label} ${parts.length ? parts.join(' · ') : 'any'}`
}
