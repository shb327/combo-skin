/** Checking one combo's form, shared by the add and edit pages. Field keys are `rating`,
 * `description`, `glove.from`, `knife.seeds`, `other.finish` and so on. */
import type { Problem } from '../api/errors'
import { formField, problemMessage } from './problems'
import type { AdminCombo } from './queries'
import {
  CHECKS,
  NO_CONDITIONS,
  checkConditions,
  checkDescription,
  conditionsText,
  formatRating,
  parseRating,
  type Conditions,
  type ConditionsText,
  type FinishRange,
} from './values'

export interface ComboText {
  rating: string
  glove: ConditionsText
  knife: ConditionsText
  description: string
  /** The screenshot agent's definition index; null is the default agent. */
  agent: number | null
}

export interface ComboValue {
  rating: number
  description: string | null
  glove: Conditions
  knife: Conditions
}

export type FieldErrors = Record<string, string>

export const EMPTY_COMBO: ComboText = {
  rating: '',
  glove: NO_CONDITIONS,
  knife: NO_CONDITIONS,
  description: '',
  agent: null,
}

export const FIELD_LABELS: Record<string, string> = {
  rating: 'Rating',
  description: 'Description',
  'glove.from': 'Gloves float from',
  'glove.to': 'Gloves float to',
  'glove.seeds': 'Gloves pattern seeds',
  'glove.finish': 'Gloves',
  'knife.from': 'Knife float from',
  'knife.to': 'Knife float to',
  'knife.seeds': 'Knife pattern seeds',
  'knife.finish': 'Knife',
  knife_type: 'Knife',
}

export function comboText(combo: AdminCombo): ComboText {
  return {
    rating: formatRating(Math.round(combo.rating * 100)),
    glove: conditionsText(combo.glove),
    knife: conditionsText(combo.knife),
    description: combo.description ?? '',
    agent: combo.screenshot_agent?.def_index ?? null,
  }
}

/** Errors per field; `value` is set when there is none. A missing rating counts only once a
 * save was tried. */
export function checkCombo(
  text: ComboText,
  ranges: { glove: FinishRange; knife: FinishRange },
  attempted: boolean,
): { errors: FieldErrors; value?: ComboValue } {
  const errors: FieldErrors = {}
  const rating = parseRating(text.rating)
  if (!rating.ok && (attempted || rating.error !== CHECKS.ratingMissing)) errors.rating = rating.error
  const items = {} as Record<'glove' | 'knife', Conditions | undefined>
  for (const item of ['glove', 'knife'] as const) {
    const checked = checkConditions(text[item], ranges[item])
    for (const [key, message] of Object.entries(checked.errors)) errors[`${item}.${key}`] = message
    items[item] = checked.value
  }
  const description = checkDescription(text.description)
  if (!description.ok) errors.description = description.error
  if (Object.keys(errors).length || !rating.ok || !description.ok || !items.glove || !items.knife) return { errors }
  return { errors, value: { rating: rating.value / 100, description: description.value, glove: items.glove, knife: items.knife } }
}

const SERVER_KEYS: Record<string, string> = { float_from: 'from', float_to: 'to', seeds: 'seeds', finish: 'finish' }

/** The form field a server path names, in this form's keys. */
export function fieldKey(serverField: string | null): string | null {
  if (!serverField) return null
  const [item, key] = serverField.split('.')
  if (!key) return item
  return `${item}.${SERVER_KEYS[key] ?? key}`
}

/** 422 problems as field errors, and those that name no field. */
export function problemErrors(problems: Problem[]): { fields: FieldErrors; other: string[] } {
  const fields: FieldErrors = {}
  const other: string[] = []
  for (const problem of problems) {
    const key = fieldKey(formField(problem))
    if (key) fields[key] = problemMessage(problem.type)
    else other.push(problemMessage(problem.type))
  }
  return { fields, other }
}

/** Errors for a ConditionsFields component. */
export function itemErrors(errors: FieldErrors, item: 'glove' | 'knife') {
  return { from: errors[`${item}.from`], to: errors[`${item}.to`], seeds: errors[`${item}.seeds`] }
}

/** The id of a field's input, for the error summary. */
export function fieldId(prefix: string, key: string): string {
  return `${prefix}-${key.replace('.', '-')}`
}

/** Summary entries for field errors and other problems. */
export function summaryEntries(prefix: string, errors: FieldErrors, other: string[] = [], ids: Record<string, string> = {}) {
  return [
    ...Object.entries(errors).map(([key, message]) => ({
      target: ids[key] ?? fieldId(prefix, key),
      text: `${FIELD_LABELS[key] ?? key}: ${message}`,
    })),
    ...other.map((text) => ({ target: null, text })),
  ]
}
