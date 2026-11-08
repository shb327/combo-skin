import { RatingField } from './fields'
import { ERROR_TEXT, SECONDARY } from './styles'
import { formatRating, parseRating } from './values'

/** Where a list rating's save stands. */
export interface RatingState {
  saving?: boolean
  saved?: boolean
  /** A refusal or failure, in the edit page's words. */
  failure?: string
  /** Another admin changed the combo since the list was read. */
  conflict?: { by: string; at: string; rating: number }
}

/** A combo's rating in the list (spec 017): edited in place and saved with its Save button or
 * Enter. Leaving the field keeps the typed value unsaved; Escape restores the stored one. */
export function ListRating({
  id,
  label,
  stored,
  text,
  state,
  onText,
  onSave,
  onUseTheirs,
  onKeepMine,
}: {
  id: string
  label: string
  /** The stored rating, in hundredths. */
  stored: number
  /** The typed value, or undefined when nothing is typed. */
  text: string | undefined
  state: RatingState
  onText(text: string | undefined): void
  onSave(): void
  onUseTheirs(): void
  onKeepMine(): void
}) {
  const parsed = text === undefined ? null : parseRating(text)
  const changed = parsed !== null && !(parsed.ok && parsed.value === stored)
  const conflict = state.conflict
  return (
    <form
      noValidate
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (changed && !state.saving && !conflict) onSave()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && text !== undefined) {
          event.preventDefault()
          onText(undefined)
        }
      }}
    >
      <RatingField
        id={`list-rating-${id}`}
        label={`Rating for ${label}`}
        labelHidden
        value={text ?? formatRating(stored)}
        error={parsed && !parsed.ok ? parsed.error : undefined}
        onChange={onText}
      />
      <button
        type="submit"
        aria-label={`Save rating for ${label}`}
        className={SECONDARY}
        disabled={!changed || state.saving || conflict !== undefined}
      >
        {state.saving ? 'Saving' : 'Save'}
      </button>
      {changed && !state.saving && <span className="text-xs text-amber-200">Not saved</span>}
      {state.saved && !changed && (
        <span role="status" className="text-xs text-accent">
          Saved
        </span>
      )}
      {state.failure && <p className={`${ERROR_TEXT} w-full`}>{state.failure}</p>}
      {conflict && (
        <div className="w-full rounded-md border border-white/15 p-2 text-sm">
          <p>
            Changed by {conflict.by} at {new Date(conflict.at).toLocaleString()} to {formatRating(conflict.rating)}.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={SECONDARY} onClick={onUseTheirs}>
              Use theirs
            </button>
            <button type="button" className={SECONDARY} onClick={onKeepMine}>
              Keep mine
            </button>
          </div>
        </div>
      )}
    </form>
  )
}
