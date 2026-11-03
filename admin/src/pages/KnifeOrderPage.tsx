import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { ApiError, errorMessage } from '../api/errors'
import { useApi } from '../api/useApi'
import { useTitle } from '../components/useTitle'
import { COMBO_MESSAGES } from '../combos/messages'
import { keys, useKnifeOrder } from '../combos/queries'
import { PRIMARY, SECONDARY } from '../combos/styles'
import { QueryState, RestoredNotice } from '../combos/ui'
import { useDraft } from '../combos/useDrafts'

type Action = 'up' | 'down'

/** The order of knife types in every batch, shared by all admins. */
export function KnifeOrderPage() {
  useTitle('Knife order')
  const api = useApi()
  const queryClient = useQueryClient()
  const order = useKnifeOrder()
  const saved = (order.data ?? []).map((t) => t.slug)
  const draft = useDraft<string[]>('knife-order', saved)
  const [announcement, setAnnouncement] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [mismatch, setMismatch] = useState(false)
  const [busy, setBusy] = useState(false)
  const [focus, setFocus] = useState<{ slug: string; action: Action } | null>(null)
  const buttons = useRef(new Map<string, HTMLButtonElement>())

  useEffect(() => {
    if (!focus) return
    const other: Action = focus.action === 'up' ? 'down' : 'up'
    // The button used may be gone at the top or bottom of the list; then the other one.
    ;(buttons.current.get(`${focus.slug}:${focus.action}`) ?? buttons.current.get(`${focus.slug}:${other}`))?.focus()
  }, [focus, draft.values])

  if (!order.data) return <QueryState error={order.error} onRetry={() => order.refetch()} />
  const names = new Map(order.data.map((t) => [t.slug, t.name]))
  const slugs = draft.values
  const changed = slugs.join() !== saved.join()

  function move(slug: string, to: number, action?: Action) {
    const next = slugs.filter((s) => s !== slug)
    next.splice(to, 0, slug)
    setMessage(null)
    setFailure(null)
    if (next.join() === saved.join()) draft.forget()
    else draft.set(() => next)
    setAnnouncement(`${names.get(slug)} moved to position ${to + 1}.`)
    if (action) setFocus({ slug, action })
  }

  async function save() {
    setBusy(true)
    setMessage(null)
    setFailure(null)
    try {
      const { data } = await api.request('put', '/admin/knife-order', { body: { slugs } })
      queryClient.setQueryData(keys.knifeOrder, data?.knife_types ?? [])
      await queryClient.invalidateQueries({ queryKey: keys.candidates })
      draft.forget()
      setMessage('Saved the knife order.')
    } catch (error) {
      const refused = error instanceof ApiError && error.problems.some((p) => p.type === 'knife_order_mismatch')
      setMismatch(refused)
      setFailure(refused ? COMBO_MESSAGES.orderChanged : errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold">Knife order</h1>
      <p className="mt-2 max-w-prose text-white/70">
        Batches list knife types in this order. It is shared by every admin.
      </p>
      {draft.restored && <RestoredNotice onDiscard={draft.forget} />}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {message && (
        <p role="status" className="mt-3 text-sm text-accent">
          {message}
        </p>
      )}
      {failure && (
        <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 rounded-md bg-red-500/10 px-3 py-2 text-sm">
          <span>{failure}</span>
          {mismatch && (
            <button
              type="button"
              className={SECONDARY}
              onClick={() => {
                draft.forget()
                setFailure(null)
                setMismatch(false)
                order.refetch()
              }}
            >
              Reload
            </button>
          )}
        </div>
      )}
      <ol className="mt-4 max-w-xl space-y-2">
        {slugs.map((slug, i) => {
          const name = names.get(slug) ?? slug
          return (
            <li key={slug} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 px-3 py-2">
              <span className="w-6 text-right text-white/50 tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1 font-semibold">{name}</span>
              {i > 0 && (
                <button
                  type="button"
                  ref={(el) => {
                    if (el) buttons.current.set(`${slug}:up`, el)
                    else buttons.current.delete(`${slug}:up`)
                  }}
                  aria-label={`Move ${name} up`}
                  className={SECONDARY}
                  onClick={() => move(slug, i - 1, 'up')}
                >
                  Up
                </button>
              )}
              {i < slugs.length - 1 && (
                <button
                  type="button"
                  ref={(el) => {
                    if (el) buttons.current.set(`${slug}:down`, el)
                    else buttons.current.delete(`${slug}:down`)
                  }}
                  aria-label={`Move ${name} down`}
                  className={SECONDARY}
                  onClick={() => move(slug, i + 1, 'down')}
                >
                  Down
                </button>
              )}
              <label className="sr-only" htmlFor={`position-${slug}`}>
                Position of {name}
              </label>
              <select
                id={`position-${slug}`}
                value={i}
                className="rounded-md border border-white/15 bg-background px-2 py-1 text-sm"
                onChange={(event) => move(slug, Number(event.target.value))}
              >
                {slugs.map((_, position) => (
                  <option key={position} value={position}>
                    {position + 1}
                  </option>
                ))}
              </select>
            </li>
          )
        })}
      </ol>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" className={PRIMARY} disabled={busy || !changed} onClick={save}>
          Save order
        </button>
        <button type="button" className={SECONDARY} disabled={busy || !changed} onClick={draft.forget}>
          Discard changes
        </button>
      </div>
    </section>
  )
}
