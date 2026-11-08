/** Inputs for combo values. Each shows its message next to it and is linked to it for
 * assistive technology. */
import { useState, type ReactNode, type Ref } from 'react'
import { ERROR_TEXT, INPUT } from './styles'
import {
  CHECKS,
  formatRating,
  formatSeeds,
  parseRating,
  parseSeeds,
  rangeHint,
  stepRating,
  type Checked,
  type ConditionsErrors,
  type ConditionsText,
  type FinishRange,
} from './values'

function Message({ id, text }: { id: string; text?: string | null }) {
  return text ? (
    <p id={id} className={ERROR_TEXT}>
      {text}
    </p>
  ) : null
}

export function RatingField({
  id,
  label,
  value,
  error,
  onChange,
  className = '',
  disabled = false,
  inputRef,
  parse = parseRating,
  step = stepRating,
}: {
  id: string
  label: string
  value: string
  error?: string | null
  onChange(value: string): void
  className?: string
  disabled?: boolean
  inputRef?: Ref<HTMLInputElement>
  /** How the value is read when the field is left, and stepped with Up and Down. */
  parse?: (text: string) => Checked<number>
  step?: (text: string, direction: 1 | -1) => string
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm">
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        disabled={disabled}
        placeholder="8.88"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${INPUT} max-w-28 disabled:opacity-60`}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
          event.preventDefault()
          onChange(step(value, event.key === 'ArrowUp' ? 1 : -1))
        }}
        onBlur={() => {
          const parsed = parse(value)
          if (parsed.ok && formatRating(parsed.value) !== value) onChange(formatRating(parsed.value))
        }}
      />
      <Message id={`${id}-error`} text={error} />
    </div>
  )
}

/** Float range and pattern seeds for one item. A finish without a float range takes neither. */
export function ConditionsFields({
  id,
  legend,
  value,
  range,
  errors = {},
  onChange,
  actions,
  showRange = true,
}: {
  id: string
  legend: string
  value: ConditionsText
  range: FinishRange
  errors?: ConditionsErrors
  onChange(value: ConditionsText): void
  actions?: ReactNode
  /** Off when `range` is not one finish's range, as for every knife of a batch. */
  showRange?: boolean
}) {
  const [removed, setRemoved] = useState(0)
  const vanilla = range.min === null || range.max === null
  const hint = showRange ? rangeHint(range) : ''
  const field = (key: keyof ConditionsText, label: string, extra: object = {}) => (
    <div className={key === 'seeds' ? 'w-full sm:flex-1' : 'w-28'}>
      <label htmlFor={`${id}-${key}`} className="block text-sm">
        {label}
      </label>
      <input
        id={`${id}-${key}`}
        type="text"
        autoComplete="off"
        value={value[key]}
        aria-invalid={errors[key] ? true : undefined}
        aria-describedby={errors[key] ? `${id}-${key}-error` : undefined}
        className={INPUT}
        onChange={(event) => onChange({ ...value, [key]: event.target.value })}
        {...extra}
      />
      <Message id={`${id}-${key}-error`} text={errors[key]} />
    </div>
  )
  return (
    <fieldset className="mt-4 rounded-lg border border-white/10 p-3">
      <legend className="px-1 text-sm font-semibold">{legend}</legend>
      {vanilla && !value.from && !value.to && !value.seeds ? (
        <p className="text-sm text-white/60">{CHECKS.vanilla}</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {field('from', 'Float from', { inputMode: 'decimal', placeholder: hint.split(' – ')[0] })}
          {field('to', 'Float to', { inputMode: 'decimal', placeholder: hint.split(' – ')[1] })}
          {field('seeds', 'Pattern seeds', {
            placeholder: 'Any pattern',
            onBlur: () => {
              const parsed = parseSeeds(value.seeds)
              if (!parsed.ok) return
              setRemoved(parsed.removed ?? 0)
              if (formatSeeds(parsed.value) !== value.seeds) onChange({ ...value, seeds: formatSeeds(parsed.value) })
            },
          })}
        </div>
      )}
      {!vanilla && hint && <p className="mt-2 text-xs text-white/50">This finish: {hint}</p>}
      {removed > 0 && (
        <p className="mt-1 text-xs text-white/60">
          {removed === 1 ? '1 duplicate removed' : `${removed} duplicates removed`}
        </p>
      )}
      {actions && <div className="mt-2">{actions}</div>}
    </fieldset>
  )
}

export function DescriptionField({
  id,
  label = 'Description',
  value,
  error,
  onChange,
}: {
  id: string
  label?: string
  value: string
  error?: string | null
  onChange(value: string): void
}) {
  const length = [...value.trim()].length
  return (
    <div className="mt-4">
      <label htmlFor={id} className="block text-sm">
        {label}
      </label>
      <textarea
        id={id}
        rows={3}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-count${error ? ` ${id}-error` : ''}`}
        className={INPUT}
        onChange={(event) => onChange(event.target.value)}
      />
      <p id={`${id}-count`} className="text-xs text-white/50">
        {length}/1000
      </p>
      <Message id={`${id}-error`} text={error} />
    </div>
  )
}
