import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ApiError } from '../api/errors'
import { useApi } from '../api/useApi'
import { useTitle } from '../components/useTitle'
import { ComboFields } from '../combos/ComboFields'
import { SearchCombobox } from '../combos/SearchCombobox'
import { Picture } from '../combos/Picture'
import { EMPTY_COMBO, checkCombo, problemErrors, summaryEntries, type ComboText, type FieldErrors } from '../combos/form'
import { COMBO_MESSAGES, comboErrorMessage, isCode } from '../combos/messages'
import { SEARCH_EXAMPLE, finishPath } from '../combos/paths'
import { loadCombos, useCatalog, useComboWrites, type CatalogEntry, type Kind } from '../combos/queries'
import { LINK, PRIMARY, SECONDARY } from '../combos/styles'
import { ErrorSummary, QueryState, RestoredNotice, type SummaryEntry } from '../combos/ui'
import { detailLabel, isRetired, useFinishPage } from '../combos/useFinishPage'
import { useDraft } from '../combos/useDrafts'

interface AddValues extends ComboText {
  other: CatalogEntry | null
}

const PREFIX = 'add'
const OTHER_ID = 'add-other'

/** Add one combo to a finish: a knife to gloves, or gloves to a knife. */
export function AddComboPage({ kind }: { kind: Kind }) {
  const otherKind: Kind = kind === 'glove' ? 'knife' : 'glove'
  const title = kind === 'glove' ? 'Add knife' : 'Add gloves'
  useTitle(title)
  const api = useApi()
  const navigate = useNavigate()
  const writes = useComboWrites()
  const { type, finish, data, fallback } = useFinishPage(kind)
  const catalog = useCatalog(otherKind)
  const draft = useDraft<AddValues>(`${kind === 'glove' ? 'add-knife' : 'add-gloves'}:${type}/${finish}`, {
    ...EMPTY_COMBO,
    other: null,
  })
  const [attempted, setAttempted] = useState(false)
  const [serverErrors, setServerErrors] = useState<FieldErrors>({})
  const [summary, setSummary] = useState<SummaryEntry[]>([])
  const [failure, setFailure] = useState<string | null>(null)
  const [existing, setExisting] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!data) return fallback
  const back = finishPath(kind, type, finish)
  if (isRetired(data)) {
    return (
      <section>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-3 rounded-md bg-white/5 px-3 py-2 text-sm">{COMBO_MESSAGES.retired}</p>
        <Link to={back} className={`${LINK} mt-3 inline-block`}>
          Back to {detailLabel(data)}
        </Link>
      </section>
    )
  }

  const values = draft.values
  const own = { min: data.float_min, max: data.float_max }
  // Until the other item is chosen, its values are only checked as floats from 0 to 1.
  const other = values.other ? { min: values.other.floatMin, max: values.other.floatMax } : { min: 0, max: 1 }
  const ranges = kind === 'glove' ? { glove: own, knife: other } : { glove: other, knife: own }
  const checked = checkCombo(values, ranges, attempted)
  const errors: FieldErrors = { ...checked.errors, ...serverErrors }
  const otherKey = `${otherKind}.finish`
  if (attempted && !values.other) errors[otherKey] = otherKind === 'knife' ? 'Choose a knife.' : 'Choose gloves.'

  function change(next: AddValues) {
    setServerErrors({})
    setFailure(null)
    setExisting(null)
    draft.set(() => next)
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setAttempted(true)
    setFailure(null)
    setExisting(null)
    const result = checkCombo(values, ranges, true)
    if (!result.value || !values.other) {
      const all = { ...result.errors, ...(values.other ? {} : { [otherKey]: errors[otherKey] ?? 'Choose one.' }) }
      setSummary(summaryEntries(PREFIX, all, [], { [otherKey]: OTHER_ID }))
      return
    }
    const page = { type_slug: type, finish_slug: finish }
    const picked = { type_slug: values.other.typeSlug, finish_slug: values.other.finishSlug }
    const glove = { ...(kind === 'glove' ? page : picked), ...result.value.glove }
    const knife = { ...(kind === 'glove' ? picked : page), ...result.value.knife }
    setBusy(true)
    setSummary([])
    try {
      await api.request('post', '/admin/combos', {
        body: {
          glove,
          knife,
          rating: result.value.rating,
          description: result.value.description,
          screenshot_agent: values.agent,
        },
      })
      draft.forget()
      await writes()
      navigate(back, { state: { saved: `Saved a draft: ${values.other.label}.` } })
    } catch (error) {
      setBusy(false)
      if (isCode(error, 'combo_exists')) {
        setFailure(COMBO_MESSAGES.exists)
        const [found] = await loadCombos(api, {
          glove_type: glove.type_slug,
          glove_finish: glove.finish_slug,
          knife_type: knife.type_slug,
          knife_finish: knife.finish_slug,
        }).catch(() => [])
        setExisting(found?.id ?? null)
      } else if (error instanceof ApiError && error.problems.length) {
        const { fields, other: rest } = problemErrors(error.problems)
        setServerErrors(fields)
        setSummary(summaryEntries(PREFIX, fields, rest, { [otherKey]: OTHER_ID }))
      } else if (error instanceof ApiError && error.kind === 'network') {
        setFailure(COMBO_MESSAGES.unknownOutcome)
      } else {
        setFailure(comboErrorMessage(error))
      }
    }
  }

  return (
    <section>
      <p className="text-sm">
        <Link to={back} className={LINK}>
          {detailLabel(data)}
        </Link>
      </p>
      <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
      {draft.restored && <RestoredNotice onDiscard={draft.forget} />}
      <ErrorSummary entries={summary} />
      {failure && (
        <p role="alert" className="mt-4 rounded-md bg-red-500/10 px-3 py-2 text-sm">
          {failure}{' '}
          {existing && (
            <Link to={`/combos/${existing}`} className="underline">
              Open it
            </Link>
          )}
        </p>
      )}
      <form method="post" noValidate onSubmit={onSubmit} className="mt-4 max-w-2xl">
        {values.other ? (
          <div>
            <p className="text-sm">{otherKind === 'knife' ? 'Knife' : 'Gloves'}</p>
            <p className="mt-1 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-3">
                <Picture url={values.other.imageUrl} fallback={values.other.fallbackUrl} size="md" />
                <span className="font-semibold">{values.other.label}</span>
              </span>
              <button type="button" className={SECONDARY} onClick={() => change({ ...values, other: null })}>
                Change
              </button>
            </p>
          </div>
        ) : catalog.data ? (
          <>
            <SearchCombobox
              label={otherKind === 'knife' ? 'Find a knife' : 'Find gloves'}
              inputId={OTHER_ID}
              placeholder={SEARCH_EXAMPLE[otherKind]}
              entries={catalog.data}
              onSelect={(entry) => change({ ...values, other: entry })}
            />
            {errors[otherKey] && <p className="mt-1 text-sm text-red-300">{errors[otherKey]}</p>}
          </>
        ) : (
          <QueryState error={catalog.error} onRetry={() => catalog.refetch()} />
        )}
        <ComboFields
          prefix={PREFIX}
          values={values}
          ranges={ranges}
          errors={errors}
          unknown={values.other ? undefined : otherKind}
          onChange={(next) => change({ ...values, ...next })}
        />
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="submit" className={PRIMARY} disabled={busy}>
            Save as draft
          </button>
          <Link to={back} className={SECONDARY}>
            Back
          </Link>
        </div>
      </form>
    </section>
  )
}
