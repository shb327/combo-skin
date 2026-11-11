/** Fixed messages for refusals of combo requests. Server text is never shown. */
import { ApiError, errorMessage, type ErrorCode } from '../api/errors'
import { problemMessage } from './problems'

export const COMBO_MESSAGES = {
  exists: 'These items already have a combo.',
  conflict: 'Someone else changed this combo after you opened it.',
  deleteConflict: 'Someone changed this combo since you loaded it. Check it, then delete again.',
  published: 'Unpublish it first.',
  gone: 'This combo no longer exists.',
  batchChanged: 'Combos changed since you opened this batch.',
  orderChanged: 'The knife types changed. Reload the page.',
  unknownOutcome:
    'Cannot reach the API. Your changes may or may not be saved; they are kept here. Saving again is safe.',
  finishNotFound: 'This finish was not found.',
  retired: 'No longer in the game.',
} as const

export function isCode(failure: unknown, code: ErrorCode): boolean {
  return failure instanceof ApiError && failure.code === code
}

/** The message for a refused combo request as a whole. */
export function comboErrorMessage(failure: unknown): string {
  if (!(failure instanceof ApiError)) return errorMessage(failure)
  switch (failure.code) {
    case 'combo_exists':
      return COMBO_MESSAGES.exists
    case 'version_conflict':
      return COMBO_MESSAGES.conflict
    case 'combo_published':
      return COMBO_MESSAGES.published
    case 'combo_not_found':
      return COMBO_MESSAGES.gone
  }
  if (failure.problems.length) return problemMessage(failure.problems[0].type)
  return errorMessage(failure)
}
