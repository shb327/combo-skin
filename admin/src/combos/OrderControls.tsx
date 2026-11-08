import type { MoveAction, useMoveFocus } from './moves'
import { SECONDARY } from './styles'

/** Move up, Move down and a position list for one item of an ordered list, as on the knife
 * order page and in a batch. */
export function OrderControls({
  slug,
  name,
  index,
  count,
  focus,
  onMove,
}: {
  slug: string
  name: string
  index: number
  count: number
  focus: ReturnType<typeof useMoveFocus>
  onMove(to: number, action?: MoveAction): void
}) {
  return (
    <>
      {index > 0 && (
        <button
          type="button"
          ref={focus.button(slug, 'up')}
          aria-label={`Move ${name} up`}
          className={SECONDARY}
          onClick={() => onMove(index - 1, 'up')}
        >
          Up
        </button>
      )}
      {index < count - 1 && (
        <button
          type="button"
          ref={focus.button(slug, 'down')}
          aria-label={`Move ${name} down`}
          className={SECONDARY}
          onClick={() => onMove(index + 1, 'down')}
        >
          Down
        </button>
      )}
      <label className="sr-only" htmlFor={`position-${slug}`}>
        Position of {name}
      </label>
      <select
        id={`position-${slug}`}
        value={index}
        className="rounded-md border border-white/15 bg-background px-2 py-1 text-sm"
        onChange={(event) => onMove(Number(event.target.value))}
      >
        {Array.from({ length: count }, (_, position) => (
          <option key={position} value={position}>
            {position + 1}
          </option>
        ))}
      </select>
    </>
  )
}
