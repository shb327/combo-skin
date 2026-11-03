import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useApi } from '../api/useApi'
import { COMBO_MESSAGES, comboErrorMessage, isCode } from './messages'
import { finishLabel, useComboWrites, useCombos, type AdminCombo, type ComboFilters, type ComboStatus, type Kind } from './queries'
import { INPUT, LINK, SECONDARY } from './styles'
import { ConfirmDialog, QueryState, StatusBadge } from './ui'
import { conditionsSummary, formatRating } from './values'

type StatusFilter = 'all' | ComboStatus
const STATUSES: [StatusFilter, string][] = [
  ['all', 'All'],
  ['draft', 'Draft'],
  ['published', 'Published'],
  ['unpublished', 'Unpublished'],
]

const hundredths = (rating: number) => Math.round(rating * 100)

/** The combos of one finish: filters, sorting, selection and the actions on each combo. */
export function ComboList({ side, filters }: { side: Kind; filters: ComboFilters }) {
  const api = useApi()
  const location = useLocation()
  const writes = useComboWrites()
  const combos = useCombos(filters)
  const [status, setStatus] = useState<StatusFilter>('all')
  const [knifeFinish, setKnifeFinish] = useState('')
  const [sort, setSort] = useState<'rating' | 'updated'>('rating')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<AdminCombo | null>(null)
  const [busy, setBusy] = useState(false)

  if (!combos.data) return <QueryState error={combos.error} onRetry={() => combos.refetch()} />

  const other = (combo: AdminCombo) => (side === 'glove' ? combo.knife : combo.glove)
  const all = combos.data
  const count = (s: StatusFilter) => (s === 'all' ? all.length : all.filter((c) => c.status === s).length)
  const knifeFinishes = [...new Map(all.map((c) => [c.knife.finish_slug, c.knife.display_name])).entries()].sort(
    (a, b) => a[1].localeCompare(b[1]),
  )
  const shown = all
    .filter((c) => status === 'all' || c.status === status)
    .filter((c) => !knifeFinish || c.knife.finish_slug === knifeFinish)
    .sort((a, b) =>
      sort === 'rating'
        ? hundredths(b.rating) - hundredths(a.rating) || a.id.localeCompare(b.id)
        : b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id),
    )
  const chosen = all.filter((c) => selected.has(c.id))
  const canPublish = chosen.filter((c) => c.status !== 'published')
  const canUnpublish = chosen.filter((c) => c.status === 'published')
  const allShownSelected = shown.length > 0 && shown.every((c) => selected.has(c.id))

  async function run(action: () => Promise<string>) {
    setBusy(true)
    setMessage(null)
    setFailure(null)
    try {
      setMessage(await action())
      await writes()
      return true
    } catch (error) {
      setFailure(comboErrorMessage(error))
      return false
    } finally {
      setBusy(false)
    }
  }

  const changeStatus = (ids: string[], publish: boolean) =>
    run(async () => {
      const { data } = publish
        ? await api.request('post', '/admin/combos/publish', { body: { ids } })
        : await api.request('post', '/admin/combos/unpublish', { body: { ids } })
      setSelected(new Set())
      const changed = data?.changed ?? 0
      return `${publish ? 'Published' : 'Unpublished'} ${changed} ${changed === 1 ? 'combo' : 'combos'}.`
    })

  async function remove(combo: AdminCombo) {
    setBusy(true)
    setMessage(null)
    setFailure(null)
    try {
      await api.request('delete', '/admin/combos/{combo_id}', {
        params: { path: { combo_id: combo.id }, query: { version: combo.version } },
      })
      setMessage('Deleted the combo.')
      await writes()
    } catch (error) {
      setFailure(isCode(error, 'version_conflict') ? COMBO_MESSAGES.deleteConflict : comboErrorMessage(error))
    } finally {
      setBusy(false)
      setDeleting(null)
    }
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section aria-label="Combos" className="mt-6">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Status">
        {STATUSES.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={status === value}
            className={`${SECONDARY} ${status === value ? 'border-accent text-accent' : ''}`}
            onClick={() => setStatus(value)}
          >
            {label} ({count(value)})
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        {side === 'glove' && (
          <div>
            <label htmlFor="knife-finish-filter" className="block text-sm">
              Knife finish
            </label>
            <select
              id="knife-finish-filter"
              value={knifeFinish}
              className={INPUT}
              onChange={(event) => setKnifeFinish(event.target.value)}
            >
              <option value="">All knife finishes</option>
              {knifeFinishes.map(([slug, name]) => (
                <option key={slug} value={slug}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="combo-sort" className="block text-sm">
            Sort by
          </label>
          <select
            id="combo-sort"
            value={sort}
            className={INPUT}
            onChange={(event) => setSort(event.target.value as 'rating' | 'updated')}
          >
            <option value="rating">Rating</option>
            <option value="updated">Last change</option>
          </select>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allShownSelected}
            disabled={!shown.length}
            onChange={() => setSelected(allShownSelected ? new Set() : new Set(shown.map((c) => c.id)))}
          />
          Select all shown
        </label>
        <button
          type="button"
          className={SECONDARY}
          disabled={busy || !canPublish.length}
          onClick={() => changeStatus(chosen.map((c) => c.id), true)}
        >
          Publish selected ({chosen.length})
        </button>
        <button
          type="button"
          className={SECONDARY}
          disabled={busy || !canUnpublish.length}
          onClick={() => changeStatus(chosen.map((c) => c.id), false)}
        >
          Unpublish selected ({chosen.length})
        </button>
      </div>

      {message && (
        <p role="status" className="mt-3 text-sm text-accent">
          {message}
        </p>
      )}
      {failure && (
        <p role="alert" className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-sm">
          {failure}
        </p>
      )}

      {shown.length ? (
        <ul className="mt-4 space-y-3">
          {shown.map((combo) => {
            const label = finishLabel(other(combo))
            return (
              <li key={combo.id} className="rounded-lg border border-white/10 p-3" aria-label={label}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <input
                    type="checkbox"
                    aria-label={`Select ${label}`}
                    checked={selected.has(combo.id)}
                    onChange={() => toggle(combo.id)}
                  />
                  <Link to={`/combos/${combo.id}`} state={{ from: location.pathname }} className={`${LINK} font-semibold`}>
                    {label}
                  </Link>
                  <span className="font-semibold tabular-nums">{formatRating(hundredths(combo.rating))}</span>
                  <StatusBadge status={combo.status} />
                </div>
                <p className="mt-1 text-sm text-white/70">
                  {conditionsSummary('Gloves', combo.glove)} · {conditionsSummary('Knife', combo.knife)}
                </p>
                <p className="mt-1 text-xs text-white/50">
                  Changed {new Date(combo.updated_at).toLocaleString()} by {combo.updated_by}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link to={`/combos/${combo.id}`} state={{ from: location.pathname }} className={SECONDARY}>
                    Edit
                  </Link>
                  {combo.status === 'published' ? (
                    <button type="button" className={SECONDARY} disabled={busy} onClick={() => changeStatus([combo.id], false)}>
                      Unpublish
                    </button>
                  ) : (
                    <button type="button" className={SECONDARY} disabled={busy} onClick={() => changeStatus([combo.id], true)}>
                      Publish
                    </button>
                  )}
                  {combo.status !== 'published' && (
                    <button type="button" className={SECONDARY} disabled={busy} onClick={() => setDeleting(combo)}>
                      Delete
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-4 text-white/60">{all.length ? 'No combos match these filters.' : 'No combos yet.'}</p>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete this combo?"
          confirmLabel="Delete"
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={() => remove(deleting)}
        >
          {finishLabel(deleting.glove)} with {finishLabel(deleting.knife)}
        </ConfirmDialog>
      )}
    </section>
  )
}
