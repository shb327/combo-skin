import { AgentPicker } from './AgentPicker'
import { ConditionsFields, DescriptionField, RatingField } from './fields'
import { itemErrors, type ComboText, type FieldErrors } from './form'
import { itemChoices } from './patterns'
import { usePatternGroups, type Agent, type Kind } from './queries'
import type { FinishRange } from './values'

/** An item of the combo by its type and finish slugs; null while it is not chosen. */
export type ItemSlugs = Record<Kind, { type: string; finish: string } | null>

/** Rating, both items' conditions with their special patterns, the screenshot agent and the
 * description of one combo. */
export function ComboFields({
  prefix,
  values,
  ranges,
  items,
  errors,
  onChange,
  unknown,
  storedAgent = null,
}: {
  prefix: string
  values: ComboText
  ranges: { glove: FinishRange; knife: FinishRange }
  /** Which groups each item can pick. */
  items: ItemSlugs
  errors: FieldErrors
  onChange(values: ComboText): void
  /** The item not chosen yet: its range is not one finish's, so it is not shown. */
  unknown?: 'glove' | 'knife'
  /** The combo's stored agent, which may be retired and so missing from the list. */
  storedAgent?: Agent | null
}) {
  const groups = usePatternGroups()
  const choices = (kind: Kind) => {
    const item = items[kind]
    return item ? itemChoices(groups.data, kind, item.type, item.finish) : []
  }
  return (
    <>
      <RatingField
        id={`${prefix}-rating`}
        label="Rating"
        className="mt-4"
        value={values.rating}
        error={errors.rating}
        onChange={(rating) => onChange({ ...values, rating })}
      />
      <ConditionsFields
        id={`${prefix}-glove`}
        legend="Gloves"
        value={values.glove}
        range={ranges.glove}
        showRange={unknown !== 'glove'}
        errors={itemErrors(errors, 'glove')}
        special={{ choices: choices('glove') }}
        onChange={(glove) => onChange({ ...values, glove })}
      />
      <ConditionsFields
        id={`${prefix}-knife`}
        legend="Knife"
        value={values.knife}
        range={ranges.knife}
        showRange={unknown !== 'knife'}
        errors={itemErrors(errors, 'knife')}
        special={{ choices: choices('knife') }}
        onChange={(knife) => onChange({ ...values, knife })}
      />
      <AgentPicker
        id={`${prefix}-agent`}
        label="Screenshot agent"
        value={values.agent}
        known={storedAgent}
        error={errors.agent}
        onChange={(agent) => onChange({ ...values, agent })}
      />
      <DescriptionField
        id={`${prefix}-description`}
        value={values.description}
        error={errors.description}
        onChange={(description) => onChange({ ...values, description })}
      />
    </>
  )
}
