/** A batch as the owner fills it in: rows in knife order, ticks, the rating fill, batch-wide
 * values and per-row overrides; and the request built from it. */
import type { components } from '../api/schema'
import { fillRatings } from './fill'
import type { FieldErrors } from './form'
import { groupLabel, rowKnife } from './patterns'
import type { Candidates } from './queries'
import {
  CHECKS,
  NO_CONDITIONS,
  checkConditions,
  checkDescription,
  DEFAULT_STEP,
  formatRating,
  parseRating,
  parseStep,
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
  /** The row's own rating, for this row only: the fill passes through it. */
  ownRating?: string
  /** Overrides of the batch-wide values; absent means the batch-wide value. */
  glove?: ConditionsText
  knife?: ConditionsText
  description?: string
  /** The row's own screenshot agent; null is its own choice of the default agent. */
  agent?: number | null
  /** Unticked by the form when this batch-wide group was picked: the group's slug (spec 024). */
  untickedFor?: string
}

export interface BatchText {
  top: string
  glove: ConditionsText
  /** A special pattern picked here holds every knife type's seed: see `rowKnife`. */
  knife: ConditionsText
  description: string
  /** The batch-wide screenshot agent; null is the default agent. */
  agent: number | null
  rows: Record<string, RowText>
  /** This batch's knife order, by knife type slug (spec 017); empty is the shared order. */
  order: string[]
  /** Set by "Refill from top", cleared by "Change order": the order controls are hidden. */
  orderLocked: boolean
  /** How much less each next knife following the fill gets, as typed. */
  step: string
}

export const EMPTY_BATCH: BatchText = {
  top: '',
  glove: NO_CONDITIONS,
  knife: NO_CONDITIONS,
  description: '',
  agent: null,
  rows: {},
  order: [],
  orderLocked: false,
  step: DEFAULT_STEP,
}

/** The candidates in the batch's order. Knife types missing from it (a catalog change) follow,
 * in the shared order; slugs no longer listed are left out. */
export function inBatchOrder(candidates: Candidate[], order: string[]): Candidate[] {
  const bySlug = new Map(candidates.map((c) => [c.knife.type_slug, c]))
  const listed = order.flatMap((slug) => bySlug.get(slug) ?? [])
  const placed = new Set(listed.map((c) => c.knife.type_slug))
  return [...listed, ...candidates.filter((c) => !placed.has(c.knife.type_slug))]
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

/** The rows in the batch's order, with the fill applied. */
export function batchRows(candidates: Candidate[], text: BatchText): Row[] {
  const step = parseStep(text.step)
  const rows = inBatchOrder(candidates, text.order).map((candidate) => ({
    candidate,
    text: text.rows[candidate.knife.type_slug] ?? defaultRow(candidate),
  }))
  const filled = fillRatings(
    rows.map(({ text: row }) => ({
      included: row.ticked,
      byHand: row.byHand,
      value: ratingValue(row.rating),
      ...(row.ownRating !== undefined ? { own: ratingValue(row.ownRating) } : {}),
    })),
    ratingValue(text.top),
    step.ok ? step.value : null,
  )
  return rows.map(({ candidate, text: row }, i) => {
    const fill = filled[i]
    return {
      slug: candidate.knife.type_slug,
      candidate,
      text: row,
      existing: candidate.existing,
      // An own rating shows as typed: the row's one box edits it.
      rating:
        row.ownRating !== undefined
          ? row.ownRating
          : row.byHand
            ? row.rating
            : fill === null
              ? ''
              : formatRating(fill),
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

/** The description a row is saved with: its own if set (empty clears it), else the batch-wide
 * one. A combo that already exists keeps its description while the batch-wide one is blank. */
export function rowDescription(row: Row, text: BatchText): string {
  if (row.text.description !== undefined) return row.text.description
  if (row.existing && !text.description.trim()) return row.existing.description ?? ''
  return text.description
}

/** A row's own values, with batch-wide values where it has no override. A batch-wide special
 * pattern gives the row its knife type's own seed. */
export function resolved(row: Row, text: BatchText) {
  return {
    glove: row.text.glove ?? text.glove,
    knife: row.text.knife ?? (row.vanilla ? NO_CONDITIONS : rowKnife(text.knife, row.slug)),
    description: rowDescription(row, text),
    agent: row.text.agent !== undefined ? row.text.agent : text.agent,
  }
}

/** The special pattern a new row is saved with, `Blue Gem · 601`; or, when the batch-wide group
 * does not cover its knife type, `No Blue Gem for this knife`; null for neither. */
export function rowPattern(row: Row, text: BatchText): string | null {
  if (row.existing || row.vanilla) return null
  const knife = resolved(row, text).knife
  if (knife.group) return groupLabel(knife.group.name, knife.seeds)
  if (!row.text.knife && text.knife.group) return `No ${text.knife.group.name} for this knife`
  return null
}

/** A row a batch-wide group decides for: a new combo with a float range and no own knife values. */
const decidedByGroup = (row: Row) => !row.existing && !row.vanilla && row.text.knife === undefined

const knives = (count: number) => `${count} ${count === 1 ? 'knife' : 'knives'}`

/** The batch with new batch-wide knife values. When the group changes, the old one is removed
 * first: the rows it unticked are ticked again. A new group then unticks the ticked rows it has
 * no seed for and marks them, so removing it ticks them again (spec 024). `announcement` says
 * what changed, or is null. */
export function applyGroup(rows: Row[], text: BatchText, knife: ConditionsText): { text: BatchText; announcement: string | null } {
  if ((text.knife.group?.slug ?? null) === (knife.group?.slug ?? null)) return { text: { ...text, knife }, announcement: null }
  const next = { ...text.rows }
  const ticked: string[] = []
  const unticked: string[] = []
  const seeds = knife.group?.seeds
  for (const row of rows) {
    const name = row.candidate.knife.type_name
    let own = row.text
    let back = false
    if (own.untickedFor !== undefined) {
      const rest = { ...own }
      delete rest.untickedFor
      own = row.existing ? rest : { ...rest, ticked: true }
      back = !row.existing
    }
    if (seeds && knife.group && decidedByGroup(row) && own.ticked && seeds[row.slug] === undefined) {
      own = { ...own, ticked: false, untickedFor: knife.group.slug }
      if (!back) unticked.push(name)
    } else if (back) {
      ticked.push(name)
    }
    if (own !== row.text) next[row.slug] = own
  }
  const said = [
    unticked.length && knife.group ? `Unticked ${knives(unticked.length)} with no ${knife.group.name}: ${unticked.join(', ')}.` : '',
    ticked.length ? `Ticked again: ${ticked.join(', ')}.` : '',
  ].filter(Boolean)
  return { text: { ...text, knife, rows: next }, announcement: said.length ? said.join(' ') : null }
}

/** The rows the batch-wide group unticked, in batch order (spec 024). */
export const untickedByGroup = (rows: Row[]) => rows.filter((row) => !row.text.ticked && row.text.untickedFor !== undefined)

/** The line under the batch-wide group naming the knives it unticked, or null. */
export function untickedNote(rows: Row[], text: BatchText): string | null {
  const group = text.knife.group
  const shown = untickedByGroup(rows)
  if (!group || !shown.length) return null
  const names = shown.map((row) => row.candidate.knife.type_name).join(', ')
  return `${knives(shown.length)} with no ${group.name} unticked: ${names}. Tick one to include it with any pattern.`
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
  // The step is needed only while an included row after the first follows the fill.
  const needsStep = ticked.slice(1).some((r) => !r.text.byHand && r.text.ownRating === undefined)
  const step = parseStep(text.step)
  if (!step.ok && (step.error !== CHECKS.stepMissing || (attempted && needsStep))) batch.step = step.error
  addConditions(batch, 'glove', checkConditions(text.glove, glove.range))
  // A batch-wide special pattern has no seeds of its own: each row has its knife type's.
  addConditions(batch, 'knife', checkConditions({ ...text.knife, group: null }, knifeBatchRange(rows)))
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
    if (!rating.ok && (row.text.byHand || row.text.ownRating !== undefined || rating.error !== CHECKS.ratingMissing)) {
      own.rating = rating.error
    }
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
          screenshot_agent: values.agent,
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
