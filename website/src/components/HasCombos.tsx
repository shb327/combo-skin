/** The "Has combos" checkbox. It takes its space before the counts load, so the grid does not
 * move when it appears, but is invisible, disabled and hidden from assistive technology. */
export function HasCombosControl({
  loaded,
  filtered,
  onChange,
}: {
  loaded: boolean
  filtered: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <label
      aria-hidden={!loaded}
      style={{ visibility: loaded ? 'visible' : 'hidden' }}
      className="flex shrink-0 items-center gap-2 text-sm md:text-base text-white/60 cursor-pointer select-none"
    >
      <input
        type="checkbox"
        checked={filtered}
        disabled={!loaded}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-white cursor-pointer"
      />
      Has combos
    </label>
  )
}
