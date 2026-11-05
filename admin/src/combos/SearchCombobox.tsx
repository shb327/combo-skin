import { useId, useState } from 'react'
import { Picture } from './Picture'
import { search } from './search'
import { INPUT } from './styles'

export interface SearchEntry {
  id: string
  label: string
  imageUrl?: string
  /** Entries of one group are listed under its name; consecutive entries share a group. */
  group?: string
}

/** A combobox over finishes or agents: type words, move with Up and Down, choose with Enter.
 * With `openOnFocus`, every entry is listed before anything is typed. */
export function SearchCombobox<T extends SearchEntry>({
  label,
  entries,
  onSelect,
  autoFocus = false,
  inputId,
  placeholder = 'For example: crimson kimono',
  openOnFocus = false,
  error,
}: {
  label: string
  entries: T[]
  onSelect(entry: T): void
  autoFocus?: boolean
  inputId?: string
  placeholder?: string
  openOnFocus?: boolean
  error?: string
}) {
  const id = useId()
  const input = inputId ?? `${id}-input`
  const [query, setQuery] = useState('')
  // -1: no option highlighted yet; Enter then takes the first.
  const [active, setActive] = useState(-1)
  const [open, setOpen] = useState(false)
  const typed = query.trim() !== ''
  const { results, more } = typed ? search(entries, query) : { results: openOnFocus ? entries : [], more: false }
  const shown = open && (typed || openOnFocus)
  const optionId = (i: number) => `${id}-option-${i}`
  const errorId = `${id}-error`

  function choose(entry: T | undefined) {
    if (!entry) return
    onSelect(entry)
    setQuery('')
    setActive(-1)
    setOpen(false)
  }

  function option(entry: T, i: number) {
    return (
      <li
        key={entry.id}
        id={optionId(i)}
        role="option"
        aria-selected={i === active}
        className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm ${i === active ? 'bg-white/10' : ''}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => choose(entry)}
      >
        {entry.imageUrl && <Picture url={entry.imageUrl} size="sm" />}
        {entry.label}
      </li>
    )
  }

  // Runs of entries without a group are plain options; each named group is an ARIA group.
  // Options are drawn only while the list is shown.
  const runs: { group?: string; items: { entry: T; index: number }[] }[] = []
  ;(shown ? results : []).forEach((entry, index) => {
    const last = runs[runs.length - 1]
    if (last && last.group === entry.group) last.items.push({ entry, index })
    else runs.push({ group: entry.group, items: [{ entry, index }] })
  })

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
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        value={query}
        placeholder={placeholder}
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
            // An untouched list chooses nothing: Enter alone must not pick its first entry.
            if (shown && (typed || active >= 0)) choose(results[Math.max(active, 0)])
          } else if (event.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {error && (
        <p id={errorId} className="mt-1 text-sm text-red-300">
          {error}
        </p>
      )}
      <ul
        id={`${id}-list`}
        role="listbox"
        aria-label={label}
        hidden={!shown}
        className="absolute z-10 mt-1 max-h-80 w-full overflow-auto rounded-md border border-white/15 bg-background"
      >
        {runs.map((run, r) =>
          run.group ? (
            <li key={`group-${r}`} role="group" aria-label={run.group}>
              <div aria-hidden="true" className="px-3 pt-2 pb-1 text-xs font-semibold text-white/50">
                {run.group}
              </div>
              <ul role="none">{run.items.map(({ entry, index }) => option(entry, index))}</ul>
            </li>
          ) : (
            run.items.map(({ entry, index }) => option(entry, index))
          ),
        )}
        {shown && more && <li className="px-3 py-2 text-xs text-white/50">Type more to narrow the list.</li>}
        {shown && !results.length && <li className="px-3 py-2 text-sm text-white/60">Nothing found.</li>}
      </ul>
    </div>
  )
}
