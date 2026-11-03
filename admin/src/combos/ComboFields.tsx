import { ConditionsFields, DescriptionField, RatingField } from './fields'
import { itemErrors, type ComboText, type FieldErrors } from './form'
import type { FinishRange } from './values'

/** Rating, both items' conditions and the description of one combo. */
export function ComboFields({
  prefix,
  values,
  ranges,
  errors,
  onChange,
  unknown,
}: {
  prefix: string
  values: ComboText
  ranges: { glove: FinishRange; knife: FinishRange }
  errors: FieldErrors
  onChange(values: ComboText): void
  /** The item not chosen yet: its range is not one finish's, so it is not shown. */
  unknown?: 'glove' | 'knife'
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
      <DescriptionField
        id={`${prefix}-description`}
        value={values.description}
        error={errors.description}
        onChange={(description) => onChange({ ...values, description })}
      />
    </>
  )
}
