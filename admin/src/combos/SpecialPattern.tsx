import { useRef, useState } from 'react'
import type { GroupChoice } from './patterns'
import { ERROR_TEXT, SECONDARY } from './styles'
import type { GroupPick } from './values'

type Focus = 'first' | 'remove' | 'add'

/** "Add special pattern" for one item, or for a batch's knives: a button that opens a list of
 * the groups that exist for it, each a button; the picked group shows as a chip with Remove.
 * Enter or Space opens the list on its first group, Tab moves through it, Escape closes it.
 * `id` is the control's id, for the error summary. Shows nothing while no group can be picked. */
export function SpecialPattern({
  id,
  choices,
  value,
  error,
  onPick,
  onRemove,
}: {
  id: string
  choices: GroupChoice[]
  value?: GroupPick | null
  error?: string
  onPick(choice: GroupChoice): void
  onRemove(): void
}) {
  const [open, setOpen] = useState(false)
  const add = useRef<HTMLButtonElement>(null)
  // The control that takes focus once it is drawn: after opening, picking or removing.
  const pending = useRef<Focus | null>(null)
  const focusOnMount = (kind: Focus) => (element: HTMLButtonElement | null) => {
    if (element && pending.current === kind) {
      pending.current = null
      element.focus()
    }
  }
  const listId = `${id}-list`
  const errorId = `${id}-error`
  const described = error ? errorId : undefined

  let control = null
  if (value) {
    control = (
      <div role="group" aria-label="Special pattern" className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-white/70">Special pattern</span>
        <span className="rounded-full border border-accent px-2 py-0.5 font-semibold text-accent">{value.name}</span>
        <button
          ref={focusOnMount('remove')}
          id={id}
          type="button"
          className={SECONDARY}
          aria-describedby={described}
          onClick={() => {
            pending.current = 'add'
            onRemove()
          }}
        >
          Remove <span className="sr-only">special pattern {value.name}</span>
        </button>
      </div>
    )
  } else if (choices.length) {
    control = (
      <>
        <button
          ref={(element) => {
            add.current = element
            focusOnMount('add')(element)
          }}
          id={id}
          type="button"
          className={SECONDARY}
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-describedby={described}
          onClick={() => {
            pending.current = open ? null : 'first'
            setOpen(!open)
          }}
        >
          Add special pattern
        </button>
        {open && (
          <ul
            id={listId}
            aria-label="Special patterns"
            className="mt-1 max-w-xs rounded-md border border-white/15"
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return
              event.preventDefault()
              setOpen(false)
              add.current?.focus()
            }}
          >
            {choices.map((choice, i) => (
              <li key={choice.pick.slug}>
                <button
                  ref={i === 0 ? focusOnMount('first') : undefined}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-white/10 focus:bg-white/10 focus:outline-none"
                  onClick={() => {
                    pending.current = 'remove'
                    setOpen(false)
                    onPick(choice)
                  }}
                >
                  {choice.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </>
    )
  }
  if (!control && !error) return null
  return (
    <div className="mt-2">
      {control}
      {error && (
        <p id={errorId} className={ERROR_TEXT}>
          {error}
        </p>
      )}
    </div>
  )
}
