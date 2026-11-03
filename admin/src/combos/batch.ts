/** A batch as the owner fills it in: rows in knife order, ticks, the rating fill, batch-wide
 * values and per-row overrides; and the request built from it. */
import type { components } from '../api/schema'
import { fillRatings } from './fill'
import type { FieldErrors } from './form'
import type { Candidates } from './queries'
import {
  CHECKS,
  NO_CONDITIONS,
  checkConditions,
  checkDescription,
  formatRating,
  parseRating,
  type Conditions,
  type ConditionsText,
  type FinishRange,
} from './values'

type Candidate = Candidates['candidates'][number]
type BatchIn = components['schemas']['BatchIn']

export interface RowText {
  ticked: boolean
  /** The rating was typed in this row; otherwise it follows the fill. */
  byHand: boolean
  rating: string
  /** Overrides of the batch-wide values; absent means the batch-wide value. */
  glove?: ConditionsText
  knife?: ConditionsText
  description?: string
}

export interface BatchText {
  top: string
  glove: ConditionsText
  knife: ConditionsText
  description: string
  rows: Record<string, RowText>
}

export const EMPTY_BATCH: BatchText = {
  top: '',
  glove: NO_CONDITIONS,
  knife: NO_CONDITIONS,
  description: '',
  rows: {},
}

export interface Row {
  slug: string
  candidate: Candidate
  text: RowText
  existing: Candidate['existing']
  /** The rating shown in the row. */
  rating: string
  vanilla: boolean
  range: FinishRange
}

const defaultRow = (candidate: Candidate): RowText => ({
  ticked: candidate.existing === null,
  byHand: false,
  rating: '',
})

const ratingValue = (text: string) => {
  const parsed = parseRating(text)
  return parsed.ok ? parsed.value : null
}

/** The rows in the candidates' order, with the fill applied. */
export function batchRows(candidates: Candidate[], text: BatchText): Row[] {
  const rows = candidates.map((candidate) => ({
    candidate,
    text: text.rows[candidate.knife.type_slug] ?? defaultRow(candidate),
  }))
  const filled = fillRatings(
    rows.map(({ text: row }) => ({ included: row.ticked, byHand: row.byHand, value: ratingValue(row.rating) })),
    ratingValue(text.top),
  )
  return rows.map(({ candidate, text: row }, i) => {
    const fill = filled[i]
    return {
      slug: candidate.knife.type_slug,
      candidate,
      text: row,
      existing: candidate.existing,
      rating: row.byHand ? row.rating : fill === null ? '' : formatRating(fill),
      vanilla: candidate.knife.float_min === null || candidate.knife.float_max === null,
      range: { min: candidate.knife.float_min, max: candidate.knife.float_max },
    }
  })
}

/** The range batch-wide knife values are first checked against: the widest a float can be,
 * or none when every knife of the batch is Vanilla. Each row then checks its own finish. */
export function knifeBatchRange(rows: Row[]): FinishRange {
  return rows.length && rows.every((row) => row.vanilla) ? { min: null, max: null } : { min: 0, max: 1 }
}

/** A new row's own values, with batch-wide values where it has no override. */
export function resolved(row: Row, text: BatchText) {
  return {
    glove: row.text.glove ?? text.glove,
    knife: row.text.knife ?? (row.vanilla ? NO_CONDITIONS : text.knife),
    description: row.text.description ?? text.description,
  }
}

export interface BatchCheck {
  /** Batch-wide fields: `top`, `glove.from`, `knife.seeds`, `description`... */
  batch: FieldErrors
  /** Per row, by knife type slug: `rating`, `knife.from`, `description`... */
  rows: Record<string, FieldErrors>
  request?: BatchIn
  /** The knife type of each `create` and `update` item, in the order sent. */
  sent?: { create: string[]; update: string[] }
}

function addConditions(errors: FieldErrors, item: 'glove' | 'knife', checked: { errors: object }) {
  for (const [key, message] of Object.entries(checked.errors)) errors[`${item}.${key}`] = message as string
}

/** Checks every included row and the batch-wide values; builds the request when all pass. */
export function checkBatch(
  rows: Row[],
  text: BatchText,
  glove: { type: string; finish: string; range: FinishRange },
  knifeFinish: string,
  attempted: boolean,
): BatchCheck {
  const batch: FieldErrors = {}
  const ticked = rows.filter((r) => r.text.ticked)
  // The top rating is needed only while some included row follows the fill.
  const needsTop = ticked.some((r) => !r.text.byHand)
  const top = parseRating(text.top)
  if (!top.ok && (top.error !== CHECKS.ratingMissing || (attempted && needsTop))) batch.top = top.error
  addConditions(batch, 'glove', checkConditions(text.glove, glove.range))
  addConditions(batch, 'knife', checkConditions(text.knife, knifeBatchRange(rows)))
  const description = checkDescription(text.description)
  if (!description.ok) batch.description = description.error

  const errors: Record<string, FieldErrors> = {}
  const create: NonNullable<BatchIn['create']> = []
  const update: NonNullable<BatchIn['update']> = []
  const sent = { create: [] as string[], update: [] as string[] }
  for (const row of ticked) {
    const own: FieldErrors = {}
    const rating = parseRating(row.rating)
    // A row without a rating because the top rating is missing is reported once, at the top.
    if (!rating.ok && (row.text.byHand || rating.error !== CHECKS.ratingMissing)) own.rating = rating.error
    const values = resolved(row, text)
    const rowDescription = checkDescription(values.description)
    if (!rowDescription.ok && row.text.description !== undefined) own.description = rowDescription.error
    if (row.existing) {
      if (rating.ok && rowDescription.ok) {
        update.push({ id: row.existing.id, version: row.existing.version, rating: rating.value / 100, description: rowDescription.value })
        sent.update.push(row.slug)
      }
    } else {
      const gloveChecked = checkConditions(values.glove, glove.range)
      const knifeChecked = checkConditions(values.knife, row.range)
      // Batch-wide glove values are reported once, at the batch; a row reports its own.
      if (row.text.glove) addConditions(own, 'glove', gloveChecked)
      addConditions(own, 'knife', knifeChecked)
      if (rating.ok && rowDescription.ok && gloveChecked.value && knifeChecked.value) {
        create.push({
          knife_type: row.slug,
          rating: rating.value / 100,
          description: rowDescription.value,
          glove: gloveChecked.value as Conditions,
          knife: knifeChecked.value as Conditions,
        })
        sent.create.push(row.slug)
      }
    }
    if (Object.keys(own).length) errors[row.slug] = own
  }
  const ok =
    !Object.keys(batch).length &&
    !Object.keys(errors).length &&
    ticked.length > 0 &&
    create.length + update.length === ticked.length
  return {
    batch,
    rows: errors,
    ...(ok
      ? {
          request: { glove: { type_slug: glove.type, finish_slug: glove.finish }, knife_finish: knifeFinish, create, update },
          sent,
        }
      : {}),
  }
}
