import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { ApiError } from '../api/errors'
import { useApi } from '../api/useApi'
import { ListRating, type RatingState } from './ListRating'
import { Picture } from './Picture'
import { rememberScroll, readView, takeScroll, viewParams, type ListView, type StatusFilter } from './listView'
import { COMBO_MESSAGES, comboErrorMessage, isCode } from './messages'
import { ratingBetween } from './order'
import { finishLabel, keys, useComboWrites, useCombos, type AdminCombo, type ComboFilters, type Kind } from './queries'
import { INPUT, LINK, SECONDARY } from './styles'
import { ScreenshotBadges } from './ScreenshotBadges'
import { ConfirmDialog, QueryState, StatusBadge } from './ui'
import { conditionsSummary, formatRating, parseRating } from './values'

const STATUSES: [StatusFilter, string][] = [
  ['all', 'All'],
  ['draft', 'Draft'],
  ['published', 'Published'],
  ['unpublished', 'Unpublished'],
]

const hundredths = (rating: number) => Math.round(rating * 100)

const SCREEN_READER_INSTRUCTIONS =
  'To move a combo, press Space on its handle. Use the Up and Down keys to move it, Space to drop it, or Escape to cancel. It gets a rating between its new neighbours.'

/** The combos of one finish: filters, sorting, selection, the actions on each combo, ratings
 * edited in place and dragging to a new place. */
export function ComboList({ side, filters }: { side: Kind; filters: ComboFilters }) {
  const api = useApi()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const writes = useComboWrites()
  const combos = useCombos(filters)
  const view = readView(params)
  const { status, knife: knifeFinish, sort } = view
  const listUrl = location.pathname + location.search
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<AdminCombo | null>(null)
  const [busy, setBusy] = useState(false)
  // Typed ratings not saved yet, and where each rating's save stands, by combo id.
  const [typed, setTyped] = useState<Record<string, string>>({})
  const [ratingStates, setRatingStates] = useState<Record<string, RatingState>>({})
  // The order shown when a rating was saved in place: kept until "Sort again" or a view change.
  const [frozen, setFrozen] = useState<string[] | null>(null)
  // A combo dropped in a new place, shown there with its new rating while it saves.
  const [dropping, setDropping] = useState<{ id: string; rating: number } | null>(null)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const loaded = combos.data !== undefined

  useEffect(() => {
    if (!loaded) return
    const y = takeScroll(listUrl)
    if (y !== undefined) window.scrollTo(0, y)
  }, [loaded, listUrl])

  if (!combos.data) return <QueryState error={combos.error} onRetry={() => combos.refetch()} />

  const other = (combo: AdminCombo) => (side === 'glove' ? combo.knife : combo.glove)
  const ratingOf = (combo: AdminCombo) => (dropping?.id === combo.id ? dropping.rating : hundredths(combo.rating))
  const all = combos.data
  const count = (s: StatusFilter) => (s === 'all' ? all.length : all.filter((c) => c.status === s).length)
  const knifeFinishes = [...new Map(all.map((c) => [c.knife.finish_slug, c.knife.display_name])).entries()].sort(
    (a, b) => a[1].localeCompare(b[1]),
  )
  const sorted = all
    .filter((c) => status === 'all' || c.status === status)
    .filter((c) => !knifeFinish || c.knife.finish_slug === knifeFinish)
    .sort((a, b) =>
      sort === 'rating'
        ? ratingOf(b) - ratingOf(a) || a.id.localeCompare(b.id)
        : b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id),
    )
  const place = new Map((frozen ?? []).map((id, index) => [id, index]))
  const shown = frozen
    ? [...sorted].sort((a, b) => (place.get(a.id) ?? Infinity) - (place.get(b.id) ?? Infinity))
    : sorted
  const orderChanged = frozen !== null && shown.some((c, i) => c.id !== sorted[i].id)
  // Dragging needs the list in rating order, so not while an edited combo waits for "Sort again".
  const canDrag = sort === 'rating' && !orderChanged && dropping === null
  // Only selected combos that the filters show: a filter change never publishes a hidden combo.
  const chosen = shown.filter((c) => selected.has(c.id))
  const canPublish = chosen.filter((c) => c.status !== 'published')
  const canUnpublish = chosen.filter((c) => c.status === 'published')
  const allShownSelected = shown.length > 0 && shown.every((c) => selected.has(c.id))
  const labels = new Map(shown.map((c) => [c.id, finishLabel(other(c))]))

  function changeView(change: Partial<ListView>) {
    setFrozen(null)
    setParams(viewParams({ ...view, ...change }), { replace: true })
  }

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
      const changed = isCode(error, 'version_conflict')
      setFailure(changed ? COMBO_MESSAGES.deleteConflict : comboErrorMessage(error))
      // Someone changed it: show the stored combo, whose version a second delete then sends.
      if (changed) await writes()
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

  function setText(id: string, text: string | undefined) {
    setTyped((current) => {
      const next = { ...current }
      if (text === undefined) delete next[id]
      else next[id] = text
      return next
    })
  }

  const setRatingState = (id: string, state: RatingState) => setRatingStates((current) => ({ ...current, [id]: state }))

  /** Saves a combo with a new rating, from the list's copy of it: its version and every other
   * value unchanged. A stale copy is refused (409) and shown as a change by another admin. */
  async function saveRating(combo: AdminCombo, rating: number, { drop = false } = {}) {
    setMessage(null)
    setFailure(null)
    setRatingState(combo.id, { saving: true })
    const conditions = (item: AdminCombo['glove']) => ({
      float_from: item.float_from,
      float_to: item.float_to,
      seeds: item.seeds,
    })
    try {
      const { data } = await api.request('put', '/admin/combos/{combo_id}', {
        params: { path: { combo_id: combo.id } },
        body: {
          version: combo.version,
          rating: rating / 100,
          description: combo.description,
          glove: conditions(combo.glove),
          knife: conditions(combo.knife),
          screenshot_agent: combo.screenshot_agent?.def_index ?? null,
        },
      })
      // A drop shows the new order; a rating typed in place keeps the shown order.
      if (!drop) setFrozen(shown.map((c) => c.id))
      if (data) {
        queryClient.setQueryData<AdminCombo[]>(keys.comboList(filters), (list) =>
          list?.map((c) => (c.id === data.id ? data : c)),
        )
        queryClient.setQueryData(keys.combo(data.id), data)
      }
      setText(combo.id, undefined)
      setRatingState(combo.id, { saved: true })
      setTimeout(() => setRatingStates((current) => (current[combo.id]?.saved ? { ...current, [combo.id]: {} } : current)), 4000)
      await writes()
    } catch (error) {
      if (drop) setText(combo.id, formatRating(rating))
      if (isCode(error, 'version_conflict')) {
        const latest = (await combos.refetch()).data?.find((c) => c.id === combo.id)
        setRatingState(
          combo.id,
          latest ? { conflict: { by: latest.updated_by, at: latest.updated_at, rating: hundredths(latest.rating) } } : {},
        )
        if (!latest) setFailure(COMBO_MESSAGES.gone)
      } else if (error instanceof ApiError && error.kind === 'network') {
        setRatingState(combo.id, { failure: COMBO_MESSAGES.unknownOutcome })
        combos.refetch()
      } else {
        setRatingState(combo.id, { failure: comboErrorMessage(error) })
      }
    } finally {
      if (drop) setDropping(null)
    }
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const ids = shown.map((c) => c.id)
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    const moved = arrayMove(shown, from, to)
    const above = moved[to - 1]
    const below = moved[to + 1]
    const rating = ratingBetween(above ? ratingOf(above) : null, below ? ratingOf(below) : null)
    if (rating === null) {
      setMessage(null)
      setFailure(
        above && below
          ? `No rating fits between ${formatRating(ratingOf(above))} and ${formatRating(ratingOf(below))}. Change a rating first.`
          : above
            ? `No rating fits below ${formatRating(ratingOf(above))}. Change a rating first.`
            : `No rating fits above ${formatRating(ratingOf(below))}. Change a rating first.`,
      )
      return
    }
    const combo = moved[to]
    setDropping({ id: combo.id, rating })
    void saveRating(combo, rating, { drop: true })
  }

  const name = (id: string | number) => labels.get(String(id)) ?? 'The combo'
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${name(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${name(active.id)} is over ${name(over.id)}.` : `${name(active.id)} is over no combo.`),
    onDragEnd: ({ active, over }) => (over ? `${name(active.id)} was dropped over ${name(over.id)}.` : `${name(active.id)} was dropped.`),
    onDragCancel: ({ active }) => `Moving ${name(active.id)} was cancelled.`,
  }

  const editLink = (combo: AdminCombo, className: string, children: ReactNode) => (
    <Link to={`/combos/${combo.id}`} state={{ from: listUrl }} className={className} onClick={() => rememberScroll(listUrl)}>
      {children}
    </Link>
  )

  return (
    <section aria-label="Combos" className="mt-6">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Status">
        {STATUSES.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={status === value}
            className={`${SECONDARY} ${status === value ? 'border-accent text-accent' : ''}`}
            onClick={() => changeView({ status: value })}
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
              onChange={(event) => changeView({ knife: event.target.value })}
            >
              <option value="">All knife finishes</option>
              {knifeFinishes.map(([slug, finishName]) => (
                <option key={slug} value={slug}>
                  {finishName}
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
            onChange={(event) => changeView({ sort: event.target.value as ListView['sort'] })}
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
      {orderChanged && (
        <p className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span>Order changed.</span>
          <button type="button" className={SECONDARY} onClick={() => setFrozen(null)}>
            Sort again
          </button>
        </p>
      )}

      {shown.length ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          accessibility={{ announcements, screenReaderInstructions: { draggable: SCREEN_READER_INSTRUCTIONS } }}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={shown.map((c) => c.id)} strategy={verticalListSortingStrategy} disabled={!canDrag}>
            <ul className="mt-4 space-y-3">
              {shown.map((combo) => {
                const label = labels.get(combo.id) ?? ''
                return (
                  <ComboRow key={combo.id} id={combo.id} label={label} draggable={sort === 'rating'} canDrag={canDrag}>
                    <Picture url={other(combo).image_url} size="sm" />
                    <input
                      type="checkbox"
                      aria-label={`Select ${label}`}
                      checked={selected.has(combo.id)}
                      onChange={() => toggle(combo.id)}
                    />
                    {editLink(combo, `${LINK} font-semibold`, label)}
                    <StatusBadge status={combo.status} />
                    <ScreenshotBadges state={combo.screenshot_state} />
                    <div className="mt-1 w-full">
                      <p className="text-sm text-white/70">
                        {conditionsSummary('Gloves', combo.glove)} · {conditionsSummary('Knife', combo.knife)}
                      </p>
                      <p className="mt-1 text-xs text-white/50">
                        Changed {new Date(combo.updated_at).toLocaleString()} by {combo.updated_by}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {editLink(combo, SECONDARY, 'Edit')}
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
                      <div className="mt-2">
                        <ListRating
                          id={combo.id}
                          label={label}
                          stored={ratingOf(combo)}
                          text={typed[combo.id]}
                          state={ratingStates[combo.id] ?? {}}
                          onText={(text) => {
                            setText(combo.id, text)
                            if (ratingStates[combo.id]?.failure) setRatingState(combo.id, {})
                          }}
                          onSave={() => {
                            const parsed = parseRating(typed[combo.id] ?? '')
                            if (parsed.ok) void saveRating(combo, parsed.value)
                          }}
                          onUseTheirs={() => {
                            setText(combo.id, undefined)
                            setRatingState(combo.id, {})
                          }}
                          onKeepMine={() => setRatingState(combo.id, {})}
                        />
                      </div>
                    </div>
                  </ComboRow>
                )
              })}
            </ul>
          </SortableContext>
        </DndContext>
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

/** One combo of the list; with the Rating sort it can be dragged by its handle (mouse, touch by
 * press and hold, or the keyboard). */
function ComboRow({
  id,
  label,
  draggable,
  canDrag,
  children,
}: {
  id: string
  label: string
  /** The list is sorted by rating: the handle is shown. */
  draggable: boolean
  /** Dragging is possible now. */
  canDrag: boolean
  children: ReactNode
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !draggable || !canDrag,
  })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`rounded-lg border p-3 ${isDragging ? 'relative z-10 border-accent bg-background' : 'border-white/10'}`}
      aria-label={label}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {draggable && (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Drag ${label}`}
            aria-disabled={!canDrag}
            className={`${SECONDARY} cursor-grab touch-manipulation px-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-50`}
          >
            <span aria-hidden="true">⠿</span>
          </button>
        )}
        {children}
      </div>
    </li>
  )
}
