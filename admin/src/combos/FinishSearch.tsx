import { useId, useState } from 'react'
import { search } from './search'
import { INPUT } from './styles'

export interface SearchEntry {
  id: string
  label: string
  color?: string
}

/** A combobox over finishes: type words, move with Up and Down, choose with Enter. */
export function FinishSearch<T extends SearchEntry>({
  label,
  entries,
  onSelect,
  autoFocus = false,
  inputId,
}: {
  label: string
  entries: T[]
  onSelect(entry: T): void
  autoFocus?: boolean
  inputId?: string
}) {
  const id = useId()
  const input = inputId ?? `${id}-input`
  const [query, setQuery] = useState('')
  // -1: no option highlighted yet; Enter then takes the first.
  const [active, setActive] = useState(-1)
  const [open, setOpen] = useState(false)
  const { results, more } = search(entries, query)
  const shown = open && query.trim() !== ''
  const optionId = (i: number) => `${id}-option-${i}`

  function choose(entry: T | undefined) {
    if (!entry) return
    onSelect(entry)
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="relative max-w-xl">
      <label htmlFor={input} className="block text-sm">
        {label}
      </label>
      <input
        id={input}
        type="text"
        role="combobox"
        autoComplete="off"
        autoFocus={autoFocus}
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={`${id}-list`}
        aria-activedescendant={shown && active >= 0 && results.length ? optionId(active) : undefined}
        value={query}
        placeholder="For example: crimson kimono"
        className={INPUT}
        onChange={(event) => {
          setQuery(event.target.value)
          setActive(-1)
          setOpen(true)
        }}
        onBlur={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setOpen(true)
            setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActive((i) => Math.max(i - 1, 0))
          } else if (event.key === 'Enter') {
            event.preventDefault()
            if (shown) choose(results[Math.max(active, 0)])
          } else if (event.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      <ul
        id={`${id}-list`}
        role="listbox"
        aria-label={label}
        hidden={!shown}
        className="absolute z-10 mt-1 max-h-80 w-full overflow-auto rounded-md border border-white/15 bg-background"
      >
        {results.map((entry, i) => (
          <li
            key={entry.id}
            id={optionId(i)}
            role="option"
            aria-selected={i === active}
            className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm ${i === active ? 'bg-white/10' : ''}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(entry)}
          >
            {entry.color && (
              <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
            )}
            {entry.label}
          </li>
        ))}
        {more && <li className="px-3 py-2 text-xs text-white/50">Type more to narrow the list.</li>}
        {shown && !results.length && <li className="px-3 py-2 text-sm text-white/60">Nothing found.</li>}
      </ul>
    </div>
  )
}
