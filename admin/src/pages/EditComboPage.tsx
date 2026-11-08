import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/errors'
import { useApi } from '../api/useApi'
import { useTitle } from '../components/useTitle'
import { ScreenshotPanel } from '../combos/ScreenshotPanel'
import { ComboFields } from '../combos/ComboFields'
import { Picture } from '../combos/Picture'
import { EMPTY_COMBO, checkCombo, comboText, problemErrors, summaryEntries, type ComboText, type FieldErrors } from '../combos/form'
import { COMBO_MESSAGES, comboErrorMessage, isCode } from '../combos/messages'
import { finishPath } from '../combos/paths'
import {
  finishLabel,
  keys,
  useAgents,
  useCombo,
  useComboWrites,
  useScreenshotSettings,
  type AdminCombo,
} from '../combos/queries'
import { LINK, PRIMARY, SECONDARY } from '../combos/styles'
import { ConfirmDialog, ErrorSummary, QueryState, RestoredNotice, StatusBadge, type SummaryEntry } from '../combos/ui'
import { useDraft } from '../combos/useDrafts'
import { formatSeeds, parseRating, parseSeeds, type ConditionsText } from '../combos/values'

interface EditValues extends ComboText {
  /** The version the values were read at. */
  version: number
}

const PREFIX = 'edit'

const when = (iso: string) => new Date(iso).toLocaleString()

function range(text: ConditionsText) {
  return text.from.trim() || text.to.trim() ? `${text.from.trim()} – ${text.to.trim()}` : 'any'
}

function seeds(text: ConditionsText) {
  const parsed = parseSeeds(text.seeds)
  return parsed.ok ? formatSeeds(parsed.value) || 'any' : text.seeds
}

function rating(text: string) {
  const parsed = parseRating(text)
  return parsed.ok ? (parsed.value / 100).toFixed(2) : text
}

/** Each field whose value differs between the stored combo and the owner's form. */
function differences(theirs: ComboText, mine: ComboText, agentName: (value: number | null) => string): [string, string, string][] {
  const rows: [string, string, string][] = [
    ['Rating', rating(theirs.rating), rating(mine.rating)],
    ['Gloves float', range(theirs.glove), range(mine.glove)],
    ['Gloves pattern seeds', seeds(theirs.glove), seeds(mine.glove)],
    ['Knife float', range(theirs.knife), range(mine.knife)],
    ['Knife pattern seeds', seeds(theirs.knife), seeds(mine.knife)],
    ['Screenshot agent', agentName(theirs.agent), agentName(mine.agent)],
    ['Description', theirs.description.trim() || 'none', mine.description.trim() || 'none'],
  ]
  return rows.filter(([, a, b]) => a !== b)
}

export function EditComboPage() {
  useTitle('Edit combo')
  const { id = '' } = useParams()
  const api = useApi()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const writes = useComboWrites()
  const combo = useCombo(id)
  const agents = useAgents()
  const settings = useScreenshotSettings()
  const stored = combo.data
  const draft = useDraft<EditValues>(`edit:${id}`, stored ? { ...comboText(stored), version: stored.version } : { ...EMPTY_COMBO, version: 0 })
  const [attempted, setAttempted] = useState(false)
  const [serverErrors, setServerErrors] = useState<FieldErrors>({})
  const [summary, setSummary] = useState<SummaryEntry[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [conflict, setConflict] = useState<AdminCombo | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!stored) {
    if (combo.error instanceof ApiError && combo.error.status === 404) {
      return (
        <section>
          <h1 className="text-2xl font-semibold">Edit combo</h1>
          <p role="alert" className="mt-3 text-white/80">
            {COMBO_MESSAGES.gone}
          </p>
          <Link to="/" className={`${LINK} mt-2 inline-block`}>
            Home
          </Link>
        </section>
      )
    }
    return <QueryState error={combo.error} onRetry={() => combo.refetch()} />
  }

  const values = draft.values
  const ranges = {
    glove: { min: stored.glove.float_min, max: stored.glove.float_max },
    knife: { min: stored.knife.float_min, max: stored.knife.float_max },
  }
  const checked = checkCombo(values, ranges, attempted)
  const errors = { ...checked.errors, ...serverErrors }
  const from = (location.state as { from?: string } | null)?.from
  const back = from ?? finishPath('glove', stored.glove.type_slug, stored.glove.finish_slug)

  function clearMessages() {
    setMessage(null)
    setFailure(null)
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setAttempted(true)
    clearMessages()
    const result = checkCombo(values, ranges, true)
    if (!result.value) {
      setSummary(summaryEntries(PREFIX, result.errors))
      return
    }
    setBusy(true)
    setSummary([])
    try {
      const { data } = await api.request('put', '/admin/combos/{combo_id}', {
        params: { path: { combo_id: id } },
        body: { version: values.version, ...result.value, screenshot_agent: values.agent },
      })
      draft.forget()
      queryClient.setQueryData(keys.combo(id), data)
      await writes()
      setMessage(`Saved. Version ${data?.version}.`)
    } catch (error) {
      if (isCode(error, 'version_conflict')) {
        const latest = await combo.refetch()
        setConflict(latest.data ?? null)
        setFailure(COMBO_MESSAGES.conflict)
      } else if (error instanceof ApiError && error.problems.length) {
        const { fields, other } = problemErrors(error.problems)
        setServerErrors(fields)
        setSummary(summaryEntries(PREFIX, fields, other))
      } else if (error instanceof ApiError && error.kind === 'network') {
        setFailure(COMBO_MESSAGES.unknownOutcome)
      } else {
        setFailure(comboErrorMessage(error))
      }
    } finally {
      setBusy(false)
    }
  }

  async function changeStatus(publish: boolean) {
    setBusy(true)
    clearMessages()
    try {
      if (publish) await api.request('post', '/admin/combos/publish', { body: { ids: [id] } })
      else await api.request('post', '/admin/combos/unpublish', { body: { ids: [id] } })
      setMessage(publish ? 'Published.' : 'Unpublished.')
      await writes()
    } catch (error) {
      setFailure(comboErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function remove(target: AdminCombo) {
    setBusy(true)
    clearMessages()
    try {
      await api.request('delete', '/admin/combos/{combo_id}', {
        params: { path: { combo_id: id }, query: { version: target.version } },
      })
      draft.forget()
      await writes()
      navigate(back, { state: { saved: 'Deleted the combo.' } })
    } catch (error) {
      const changed = isCode(error, 'version_conflict')
      setFailure(changed ? COMBO_MESSAGES.deleteConflict : comboErrorMessage(error))
      setBusy(false)
      setDeleting(false)
      // Someone changed it: show the stored combo, whose version a second delete then sends.
      if (changed) await combo.refetch()
    }
  }

  const theirs = conflict ? comboText(conflict) : null

  function agentName(value: number | null) {
    if (value === null) return settings.data ? `Default (${settings.data.default_agent.name})` : 'Default'
    const named = [...(agents.data ?? []), stored?.screenshot_agent, conflict?.screenshot_agent]
    return named.find((agent) => agent?.def_index === value)?.name ?? `Agent ${value}`
  }

  return (
    <section>
      <p className="text-sm">
        <Link to={back} className={LINK}>
          Back
        </Link>
      </p>
      <h1 className="mt-1 text-2xl font-semibold">Edit combo</h1>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-lg">
        <span className="inline-flex items-center gap-3">
          <Picture url={stored.glove.image_url} size="md" />
          <Link to={finishPath('glove', stored.glove.type_slug, stored.glove.finish_slug)} className={LINK}>
            {finishLabel(stored.glove)}
          </Link>
        </span>{' '}
        <span>with</span>{' '}
        <span className="inline-flex items-center gap-3">
          <Picture url={stored.knife.image_url} size="md" />
          <Link to={finishPath('knife', stored.knife.type_slug, stored.knife.finish_slug)} className={LINK}>
            {finishLabel(stored.knife)}
          </Link>
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-white/70">
        <StatusBadge status={stored.status} />
        <span>Version {stored.version}</span>
        <span>
          Created {when(stored.created_at)} by {stored.created_by}
        </span>
        <span>
          Last changed {when(stored.updated_at)} by {stored.updated_by}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {stored.status === 'published' ? (
          <button type="button" className={SECONDARY} disabled={busy} onClick={() => changeStatus(false)}>
            Unpublish
          </button>
        ) : (
          <button type="button" className={SECONDARY} disabled={busy} onClick={() => changeStatus(true)}>
            Publish
          </button>
        )}
        {stored.status === 'published' ? (
          <span className="self-center text-sm text-white/60">To delete it, unpublish it first.</span>
        ) : (
          <button type="button" className={SECONDARY} disabled={busy} onClick={() => setDeleting(true)}>
            Delete
          </button>
        )}
      </div>

      <ScreenshotPanel combo={stored} />
      {draft.restored && <RestoredNotice onDiscard={draft.forget} />}
      {message && (
        <p role="status" className="mt-4 text-sm text-accent">
          {message}
        </p>
      )}
      {failure && (
        <p role="alert" className="mt-4 rounded-md bg-red-500/10 px-3 py-2 text-sm">
          {failure}
        </p>
      )}
      {conflict && theirs && (
        <div className="mt-4 rounded-lg border border-white/15 p-4 text-sm">
          <p>
            Changed by {conflict.updated_by} at {when(conflict.updated_at)} (version {conflict.version}).
          </p>
          <table className="mt-2 w-full text-left">
            <thead>
              <tr>
                <th className="pr-3 font-semibold">Field</th>
                <th className="pr-3 font-semibold">Theirs</th>
                <th className="font-semibold">Yours</th>
              </tr>
            </thead>
            <tbody>
              {differences(theirs, values, agentName).map(([field, a, b]) => (
                <tr key={field}>
                  <td className="pr-3">{field}</td>
                  <td className="pr-3 break-all">{a}</td>
                  <td className="break-all">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={SECONDARY}
              onClick={() => {
                draft.forget()
                setConflict(null)
                setFailure(null)
              }}
            >
              Use theirs
            </button>
            <button
              type="button"
              className={SECONDARY}
              onClick={() => {
                draft.set((current) => ({ ...current, version: conflict.version }))
                setConflict(null)
                setFailure(null)
              }}
            >
              Keep mine
            </button>
          </div>
        </div>
      )}
      <ErrorSummary entries={summary} />
      <form method="post" noValidate onSubmit={onSubmit} className="mt-2 max-w-2xl">
        <ComboFields
          prefix={PREFIX}
          values={values}
          ranges={ranges}
          errors={errors}
          storedAgent={stored.screenshot_agent}
          onChange={(next) => {
            setServerErrors({})
            draft.set((current) => ({ ...current, ...next }))
          }}
        />
        <div className="mt-6">
          <button type="submit" className={PRIMARY} disabled={busy || conflict !== null}>
            Save
          </button>
        </div>
      </form>
      {deleting && (
        <ConfirmDialog
          title="Delete this combo?"
          confirmLabel="Delete"
          busy={busy}
          onCancel={() => setDeleting(false)}
          onConfirm={() => remove(stored)}
        >
          {finishLabel(stored.glove)} with {finishLabel(stored.knife)}
        </ConfirmDialog>
      )}
    </section>
  )
}
