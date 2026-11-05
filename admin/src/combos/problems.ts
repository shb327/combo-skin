/** Where a refusal from the API belongs in a form, and the fixed message shown for it. */
import type { Problem } from '../api/errors'

export const REFUSALS = {
  float_outside_finish: "Outside this finish's range.",
  finish_retired: 'This finish is no longer in the game.',
  finish_has_no_float: 'Vanilla has no float or pattern.',
  finish_has_no_pattern: 'Vanilla has no float or pattern.',
  finish_not_found: 'This finish was not found.',
  duplicate_seed: 'A seed is listed twice.',
  duplicate_knife_type: 'This knife type appears twice.',
  combo_not_found: 'This combo no longer exists.',
  combo_not_in_batch: 'This combo is not part of this batch.',
  decimal_max_places: 'Too many decimals.',
  agent_not_found: 'This agent is not in the catalog.',
  agent_retired: 'This agent is no longer in the game.',
} as const

export const REFUSED = 'The API refused this value.'

export function problemMessage(type: string): string {
  return Object.hasOwn(REFUSALS, type) ? REFUSALS[type as keyof typeof REFUSALS] : REFUSED
}

const ITEM_FIELDS: Record<string, string> = {
  float_from: 'float_from',
  float_to: 'float_to',
  seeds: 'seeds',
  type_slug: 'finish',
  finish_slug: 'finish',
}

/** The field a path names inside one combo: `rating`, `description`, `knife.float_from`,
 * `glove.seeds`, `knife.finish`, `knife_type`, `agent`; null when it names none. */
function comboField(path: (string | number)[]): string | null {
  const [first, second] = path
  if (first === 'rating' || first === 'description' || first === 'knife_type') return first
  if (first === 'screenshot_agent') return 'agent'
  if ((first === 'glove' || first === 'knife') && typeof second === 'string' && ITEM_FIELDS[second]) {
    return `${first}.${ITEM_FIELDS[second]}`
  }
  return null
}

/** The field of a single combo form (create or update) a problem points at. */
export function formField(problem: Problem): string | null {
  const [body, ...path] = problem.loc
  return body === 'body' ? comboField(path) : null
}

export interface BatchPlace {
  list: 'create' | 'update'
  /** The row's index in that list, as sent. */
  index: number
  /** The field inside the row, or null for the row as a whole. */
  field: string | null
}

/** The row of a batch, and the field in it, a problem points at; null for the batch as a whole. */
export function batchPlace(problem: Problem): BatchPlace | null {
  const [body, list, index, ...path] = problem.loc
  if (body !== 'body' || (list !== 'create' && list !== 'update') || typeof index !== 'number') return null
  return { list, index, field: comboField(path) }
}
