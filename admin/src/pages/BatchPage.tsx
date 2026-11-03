import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { ApiError } from '../api/errors'
import { useApi } from '../api/useApi'
import type { components } from '../api/schema'
import { useTitle } from '../components/useTitle'
import { EMPTY_BATCH, batchRows, checkBatch, knifeBatchRange, type BatchText, type Row, type RowText } from '../combos/batch'
import { ConditionsFields, DescriptionField, RatingField } from '../combos/fields'
import { FIELD_LABELS, fieldKey, itemErrors, type FieldErrors } from '../combos/form'
import { COMBO_MESSAGES, comboErrorMessage, isCode } from '../combos/messages'
import { finishPath } from '../combos/paths'
import { batchPlace, problemMessage } from '../combos/problems'
import { finishLabel, useBatchFinishes, useCandidates, useComboWrites } from '../combos/queries'
import { INPUT, LINK, PRIMARY, SECONDARY } from '../combos/styles'
import { ErrorSummary, QueryState, RestoredNotice, StatusBadge, type SummaryEntry } from '../combos/ui'
import { detailLabel, isRetired, useFinishPage } from '../combos/useFinishPage'
import { useDraft } from '../combos/useDrafts'
import { search } from '../combos/search'
import { NO_CONDITIONS, formatRating } from '../combos/values'

type Saved = components['schemas']['BatchSaved']

const rowId = (slug: string) => `batch-row-${slug}`
const label = (key: string) => (key === 'row' ? 'Row' : (FIELD_LABELS[key] ?? key))

/** Batch: one pair of gloves, one knife finish name, every knife type that has it. */
export function BatchPage() {
  useTitle('Batch')
  const { knifeFinish } = useParams()
  const { type, finish, data, fallback } = useFinishPage('glove')
  if (!data) return fallback
  const back = finishPath('glove', type, finish)
  if (isRetired(data)) {
    return (
      <section>
        <h1 className="text-2xl font-semibold">Batch</h1>
        <p className="mt-3 rounded-md bg-white/5 px-3 py-2 text-sm">{COMBO_MESSAGES.retired}</p>
      </section>
    )
  }
  return (
    <section>
      <p className="text-sm">
        <Link to={back} className={LINK}>
          {detailLabel(data)}
        </Link>
      </p>
      {knifeFinish ? (
        <BatchRows
          type={type}
          finish={finish}
          knifeFinish={knifeFinish}
          gloveLabel={detailLabel(data)}
          gloveRange={{ min: data.float_min, max: data.float_max }}
          back={back}
        />
      ) : (
        <KnifeFinishChoice back={back} gloveLabel={detailLabel(data)} />
      )}
    </section>
  )
}

function KnifeFinishChoice({ back, gloveLabel }: { back: string; gloveLabel: string }) {
  const finishes = useBatchFinishes()
  const [query, setQuery] = useState('')
  if (!finishes.data) return <QueryState error={finishes.error} onRetry={() => finishes.refetch()} />
  const entries = finishes.data.map((f) => ({ ...f, label: f.display_name }))
  const shown = query.trim() ? search(entries, query, entries.length).results : entries
  return (
    <>
      <h1 className="mt-1 text-2xl font-semibold">Batch for {gloveLabel}</h1>
      <p className="mt-2 text-white/70">Choose the knife finish. Every knife type that has it will be listed.</p>
      <div className="mt-4 max-w-md">
        <label htmlFor="batch-finish-filter" className="block text-sm">
          Find a knife finish
        </label>
        <input
          id="batch-finish-filter"
          type="search"
          autoComplete="off"
          autoFocus
          value={query}
          placeholder="For example: ruby"
          className={INPUT}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <ul className="mt-4 grid max-w-2xl gap-2 sm:grid-cols-2">
        {shown.map((f) => (
          <li key={f.slug}>
            <Link to={`${back}/batch/${f.slug}`} className="block rounded-md border border-white/10 px-3 py-2 hover:border-accent">
              <span className="font-semibold">{f.display_name}</span>
              <span className="ml-2 text-sm text-white/60">
                {f.knife_types} {f.knife_types === 1 ? 'knife' : 'knives'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {!shown.length && <p className="mt-4 text-white/60">Nothing found.</p>}
    </>
  )
}

function BatchRows({
  type,
  finish,
  knifeFinish,
  gloveLabel,
  gloveRange,
  back,
}: {
  type: string
  finish: string
  knifeFinish: string
  gloveLabel: string
  gloveRange: { min: number | null; max: number | null }
  back: string
}) {
  const api = useApi()
  const writes = useComboWrites()
  const candidates = useCandidates(type, finish, knifeFinish)
  const draft = useDraft<BatchText>(`batch:${type}/${finish}/${knifeFinish}`, EMPTY_BATCH)
  const [attempted, setAttempted] = useState(false)
  const [serverErrors, setServerErrors] = useState<Record<string, FieldErrors>>({})
  const [summary, setSummary] = useState<SummaryEntry[]>([])
  const [failure, setFailure] = useState<string | null>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [saved, setSaved] = useState<Saved | null>(null)
  const [published, setPublished] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!candidates.data) return <QueryState error={candidates.error} onRetry={() => candidates.refetch()} />
  const knifeName = candidates.data.knife_finish.display_name ?? knifeFinish
  const heading = `${gloveLabel} with ${knifeName}`

  if (saved) {
    return (
      <SavedBatch
        heading={heading}
        saved={saved}
        back={back}
        gloveLabel={gloveLabel}
        published={published}
        busy={busy}
        onPublish={async () => {
          setBusy(true)
          setFailure(null)
          try {
            const { data } = await api.request('post', '/admin/combos/publish', {
              body: { ids: saved.created.map((c) => c.id) },
            })
            setPublished(`Published ${data?.changed ?? 0} combos.`)
            await writes()
          } catch (error) {
            setFailure(comboErrorMessage(error))
          } finally {
            setBusy(false)
          }
        }}
        failure={failure}
      />
    )
  }

  const text = draft.values
  const rows = batchRows(candidates.data.candidates, text)
  const glove = { type, finish, range: gloveRange }
  const checked = checkBatch(rows, text, glove, knifeFinish, attempted)
  const rowErrors = (slug: string): FieldErrors => ({ ...checked.rows[slug], ...serverErrors[slug] })
  const included = rows.filter((r) => r.text.ticked)

  function change(next: (current: BatchText) => BatchText) {
    setServerErrors({})
    setFailure(null)
    draft.set(next)
  }
  const changeRow = (row: Row, patch: Partial<RowText>) =>
    change((current) => ({ ...current, rows: { ...current.rows, [row.slug]: { ...row.text, ...patch } } }))

  function toggleOpen(slug: string) {
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  function summaryFor(batch: FieldErrors, perRow: Record<string, FieldErrors>, other: string[] = []) {
    const names = new Map(rows.map((r) => [r.slug, r.candidate.knife.type_name]))
    return [
      ...Object.entries(batch).map(([key, message]) => ({
        target: key === 'top' ? 'batch-top' : `batch-${key.replace('.', '-')}`,
        text: `${key === 'top' ? 'Top rating' : `Every knife, ${label(key).toLowerCase()}`}: ${message}`,
      })),
      ...Object.entries(perRow).flatMap(([slug, errors]) =>
        Object.entries(errors).map(([key, message]) => ({
          target: key === 'rating' ? `${rowId(slug)}-rating` : rowId(slug),
          text: `${names.get(slug)}, ${label(key).toLowerCase()}: ${message}`,
        })),
      ),
      ...other.map((t) => ({ target: null, text: t })),
    ]
  }

  async function save() {
    if (busy) return
    setAttempted(true)
    setFailure(null)
    const result = checkBatch(rows, text, glove, knifeFinish, true)
    if (!result.request || !result.sent) {
      setSummary(summaryFor(result.batch, result.rows))
      return
    }
    const sent = result.sent
    setBusy(true)
    setSummary([])
    try {
      const { data } = await api.request('post', '/admin/batches', { body: result.request })
      draft.forget()
      setSaved(data ?? { created: [], updated: [] })
      await writes()
    } catch (error) {
      if (isCode(error, 'combo_exists') || isCode(error, 'version_conflict')) {
        setFailure(COMBO_MESSAGES.batchChanged)
        const fresh = await candidates.refetch()
        // Knife types that now have a combo become "already exists", unticked; values stay.
        const now = new Set((fresh.data?.candidates ?? []).filter((c) => c.existing).map((c) => c.knife.type_slug))
        draft.set((current) => {
          const next = { ...current.rows }
          for (const row of rows) {
            if (sent.create.includes(row.slug) && now.has(row.slug)) next[row.slug] = { ...row.text, ticked: false }
          }
          return { ...current, rows: next }
        })
      } else if (error instanceof ApiError && error.problems.length) {
        const perRow: Record<string, FieldErrors> = {}
        const other: string[] = []
        for (const problem of error.problems) {
          const place = batchPlace(problem)
          const slug = place ? sent[place.list][place.index] : undefined
          if (!place || !slug) {
            other.push(problemMessage(problem.type))
            continue
          }
          perRow[slug] = { ...perRow[slug], [fieldKey(place.field) ?? 'row']: problemMessage(problem.type) }
        }
        setServerErrors(perRow)
        setSummary(summaryFor({}, perRow, other))
      } else if (error instanceof ApiError && error.kind === 'network') {
        setFailure(COMBO_MESSAGES.unknownOutcome)
        candidates.refetch()
      } else {
        setFailure(comboErrorMessage(error))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h1 className="mt-1 text-2xl font-semibold">{heading}</h1>
      <p className="mt-1 text-sm">
        <Link to={`${back}/batch`} className={LINK}>
          Choose another knife finish
        </Link>
      </p>
      {draft.restored && <RestoredNotice onDiscard={draft.forget} />}
      <ErrorSummary entries={summary} />
      {failure && (
        <p role="alert" className="mt-4 rounded-md bg-red-500/10 px-3 py-2 text-sm">
          {failure}
        </p>
      )}

      <fieldset className="mt-6 max-w-3xl rounded-lg border border-white/10 p-4">
        <legend className="px-1 font-semibold">Every knife</legend>
        <div className="flex flex-wrap items-end gap-3">
          <RatingField
            id="batch-top"
            label="Top rating"
            value={text.top}
            error={checked.batch.top}
            onChange={(top) => change((current) => ({ ...current, top }))}
          />
          <button
            type="button"
            className={`${SECONDARY} mb-0.5`}
            onClick={() =>
              change((current) => ({
                ...current,
                rows: Object.fromEntries(rows.map((r) => [r.slug, { ...r.text, byHand: false, rating: '' }])),
              }))
            }
          >
            Refill from top
          </button>
        </div>
        <p className="mt-1 text-xs text-white/50">Each next knife gets 0.05 less, never below 0.</p>
        <ConditionsFields
          id="batch-glove"
          legend="Gloves"
          value={text.glove}
          range={gloveRange}
          errors={itemErrors(checked.batch, 'glove')}
          onChange={(value) => change((current) => ({ ...current, glove: value }))}
        />
        <ConditionsFields
          id="batch-knife"
          legend="Knife"
          value={text.knife}
          range={knifeBatchRange(rows)}
          showRange={false}
          errors={itemErrors(checked.batch, 'knife')}
          onChange={(value) => change((current) => ({ ...current, knife: value }))}
        />
        <DescriptionField
          id="batch-description"
          value={text.description}
          error={checked.batch.description}
          onChange={(description) => change((current) => ({ ...current, description }))}
        />
      </fieldset>

      {rows.length ? (
        <ol className="mt-6 max-w-3xl space-y-3" aria-label="Knives">
          {rows.map((row) => (
            <BatchRow
              key={row.slug}
              row={row}
              batch={text}
              gloveRange={gloveRange}
              errors={rowErrors(row.slug)}
              open={open.has(row.slug)}
              onToggleOpen={() => toggleOpen(row.slug)}
              onChange={(patch) => changeRow(row, patch)}
            />
          ))}
        </ol>
      ) : (
        <p className="mt-6 text-white/60">No knife has this finish.</p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="button" className={PRIMARY} disabled={busy || !included.length} onClick={save}>
          Save {included.length} as drafts
        </button>
        <Link to={back} className={SECONDARY}>
          Back
        </Link>
      </div>
    </>
  )
}

function BatchRow({
  row,
  batch,
  gloveRange,
  errors,
  open,
  onToggleOpen,
  onChange,
}: {
  row: Row
  batch: BatchText
  gloveRange: { min: number | null; max: number | null }
  errors: FieldErrors
  open: boolean
  onToggleOpen(): void
  onChange(patch: Partial<RowText>): void
}) {
  const id = rowId(row.slug)
  const name = row.candidate.knife.type_name
  const range = row.vanilla ? 'No float range' : `Float ${row.range.min} – ${row.range.max}`
  // Errors shown next to their own fields; the rest are listed under the row.
  const inFields = (key: string) =>
    key === 'rating' ||
    (key.startsWith('knife.') && row.text.knife !== undefined && open) ||
    (key.startsWith('glove.') && row.text.glove !== undefined && open) ||
    (key === 'description' && row.text.description !== undefined && open)
  const listed = Object.entries(errors).filter(([key]) => !inFields(key))
  return (
    <li className="rounded-lg border border-white/10 p-3" aria-label={name}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <input
          id={id}
          type="checkbox"
          checked={row.text.ticked}
          aria-label={`${row.existing ? 'Update' : 'Include'} ${name}`}
          onChange={() => onChange({ ticked: !row.text.ticked })}
        />
        <label htmlFor={id} className="font-semibold">
          {name}
        </label>
        <span className="text-xs text-white/50">{range}</span>
        {row.existing && (
          <span className="flex items-center gap-2 text-sm text-white/70">
            <span>Already exists</span>
            <StatusBadge status={row.existing.status as 'draft' | 'published' | 'unpublished'} />
            <span>now {formatRating(Math.round(row.existing.rating * 100))}</span>
          </span>
        )}
      </div>
      {row.existing && !row.text.ticked && (
        <p className="mt-1 text-xs text-white/50">Tick to update its rating and description.</p>
      )}
      {row.text.ticked && (
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <RatingField
            id={`${id}-rating`}
            label={`Rating for ${name}`}
            value={row.rating}
            error={errors.rating}
            onChange={(rating) => onChange({ byHand: true, rating })}
          />
          <button type="button" className={`${SECONDARY} mb-0.5`} aria-expanded={open} onClick={onToggleOpen}>
            Own values <span className="sr-only">for {name}</span>
            {overrides(row) ? ` (${overrides(row)})` : ''}
          </button>
        </div>
      )}
      {row.text.ticked && open && (
        <div className="mt-2">
          {!row.existing && (
            <>
              <Override
                label={`own knife values for ${name}`}
                active={row.text.knife !== undefined}
                disabled={row.vanilla}
                onSet={() => onChange({ knife: batch.knife })}
                onClear={() => onChange({ knife: undefined })}
              >
                <ConditionsFields
                  id={`${id}-knife`}
                  legend={`Knife, ${name} only`}
                  value={row.text.knife ?? NO_CONDITIONS}
                  range={row.range}
                  errors={itemErrors(errors, 'knife')}
                  onChange={(knife) => onChange({ knife })}
                />
              </Override>
              <Override
                label={`own glove values for ${name}`}
                active={row.text.glove !== undefined}
                onSet={() => onChange({ glove: batch.glove })}
                onClear={() => onChange({ glove: undefined })}
              >
                <ConditionsFields
                  id={`${id}-glove`}
                  legend={`Gloves, ${name} only`}
                  value={row.text.glove ?? NO_CONDITIONS}
                  range={gloveRange}
                  errors={itemErrors(errors, 'glove')}
                  onChange={(glove) => onChange({ glove })}
                />
              </Override>
            </>
          )}
          <Override
            label={`own description for ${name}`}
            active={row.text.description !== undefined}
            onSet={() => onChange({ description: batch.description })}
            onClear={() => onChange({ description: undefined })}
          >
            <DescriptionField
              id={`${id}-description`}
              label={`Description, ${name} only`}
              value={row.text.description ?? ''}
              error={errors.description}
              onChange={(description) => onChange({ description })}
            />
          </Override>
          {row.existing && (
            <p className="mt-2 text-sm">
              <Link to={`/combos/${row.existing.id}`} className={LINK}>
                Edit its float and pattern
              </Link>
            </p>
          )}
        </div>
      )}
      {row.text.ticked && listed.length > 0 && (
        <ul className="mt-2 text-sm text-red-300">
          {listed.map(([key, message]) => (
            <li key={key}>
              {label(key)}: {message}
              {key.startsWith('knife.') && row.text.knife === undefined && ' Set own knife values for this knife.'}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function overrides(row: Row) {
  return [row.text.knife && 'knife', row.text.glove && 'gloves', row.text.description !== undefined && 'description']
    .filter(Boolean)
    .join(', ')
}

function Override({
  label: name,
  active,
  disabled = false,
  onSet,
  onClear,
  children,
}: {
  label: string
  active: boolean
  disabled?: boolean
  onSet(): void
  onClear(): void
  children: ReactNode
}) {
  if (disabled) return null
  if (!active) {
    return (
      <button type="button" className={`${SECONDARY} mt-2 mr-2`} onClick={onSet}>
        Set {name}
      </button>
    )
  }
  return (
    <div className="mt-2">
      {children}
      <button type="button" className={`${SECONDARY} mt-1`} onClick={onClear}>
        Clear {name}
      </button>
    </div>
  )
}

function SavedBatch({
  heading,
  saved,
  back,
  gloveLabel,
  published,
  busy,
  failure,
  onPublish,
}: {
  heading: string
  saved: Saved
  back: string
  gloveLabel: string
  published: string | null
  busy: boolean
  failure: string | null
  onPublish(): void
}) {
  const count = saved.created.length
  return (
    <>
      <h1 className="mt-1 text-2xl font-semibold">{heading}</h1>
      <p role="status" className="mt-3 text-accent">
        Saved {count} new {count === 1 ? 'combo' : 'combos'} as drafts
        {saved.updated.length ? ` and updated ${saved.updated.length}` : ''}.
      </p>
      <ul className="mt-4 max-w-2xl space-y-1" aria-label="Saved">
        {[...saved.created.map((c) => [c, 'Created'] as const), ...saved.updated.map((c) => [c, 'Updated'] as const)].map(
          ([combo, what]) => (
            <li key={combo.id} className="flex flex-wrap gap-3">
              <span className="font-semibold">{finishLabel(combo.knife)}</span>
              <span className="tabular-nums">{formatRating(Math.round(combo.rating * 100))}</span>
              <span className="text-white/60">{what}</span>
            </li>
          ),
        )}
      </ul>
      {published && (
        <p role="status" className="mt-3 text-sm text-accent">
          {published}
        </p>
      )}
      {failure && (
        <p role="alert" className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-sm">
          {failure}
        </p>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        {count > 0 && !published && (
          <button type="button" className={PRIMARY} disabled={busy} onClick={onPublish}>
            Publish these {count} new {count === 1 ? 'combo' : 'combos'}
          </button>
        )}
        <Link to={back} className={SECONDARY}>
          Back to {gloveLabel}
        </Link>
      </div>
    </>
  )
}
