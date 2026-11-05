import { AgentPicker } from './AgentPicker'
import { ConditionsFields, DescriptionField, RatingField } from './fields'
import { itemErrors, type ComboText, type FieldErrors } from './form'
import type { Agent } from './queries'
import type { FinishRange } from './values'

/** Rating, both items' conditions, the screenshot agent and the description of one combo. */
export function ComboFields({
  prefix,
  values,
  ranges,
  errors,
  onChange,
  unknown,
  storedAgent = null,
}: {
  prefix: string
  values: ComboText
  ranges: { glove: FinishRange; knife: FinishRange }
  errors: FieldErrors
  onChange(values: ComboText): void
  /** The item not chosen yet: its range is not one finish's, so it is not shown. */
  unknown?: 'glove' | 'knife'
  /** The combo's stored agent, which may be retired and so missing from the list. */
  storedAgent?: Agent | null
}) {
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
        onChange={(glove) => onChange({ ...values, glove })}
      />
      <ConditionsFields
        id={`${prefix}-knife`}
        legend="Knife"
        value={values.knife}
        range={ranges.knife}
        showRange={unknown !== 'knife'}
        errors={itemErrors(errors, 'knife')}
        onChange={(knife) => onChange({ ...values, knife })}
      />
      <AgentPicker
        id={`${prefix}-agent`}
        label="Screenshot agent"
        value={values.agent}
        known={storedAgent}
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
