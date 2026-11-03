import { useState } from 'react'
import { Link } from 'react-router'
import { useApi } from '../api/useApi'
import { useTitle } from '../components/useTitle'
import { comboErrorMessage } from '../combos/messages'
import { Picture } from '../combos/Picture'
import { useCatalog, useComboWrites, useCombos, useDraftCount, useFinish, type AdminCombo, type CatalogEntry, type Kind } from '../combos/queries'
import { SECONDARY } from '../combos/styles'
import { ConfirmDialog, QueryState } from '../combos/ui'

const DIRECTIONS = [
  { to: '/gloves', label: 'By gloves', text: 'Start from a pair of gloves and find the knives that go with it.' },
  { to: '/knives', label: 'By knife', text: 'Start from a knife and find the gloves that go with it.' },
]

/** Active finishes of a kind with no combo of any status. */
function withoutCombo(entries: CatalogEntry[], combos: AdminCombo[], kind: Kind): number {
  const used = new Set(combos.map((c) => (kind === 'glove' ? c.glove : c.knife)).map((i) => `${i.type_slug}/${i.finish_slug}`))
  return entries.filter((entry) => !used.has(entry.id)).length
}

/** How many combos exist, and how many finishes of each kind still have none. */
function Statistics() {
  const gloves = useCatalog('glove')
  const knives = useCatalog('knife')
  const combos = useCombos({})
  const failure = gloves.error ?? knives.error ?? combos.error
  const figures =
    gloves.data && knives.data && combos.data
      ? [
          [String(combos.data.length), combos.data.length === 1 ? 'combo' : 'combos'],
          [`${withoutCombo(gloves.data, combos.data, 'glove')} of ${gloves.data.length}`, 'glove finishes without a combo'],
          [`${withoutCombo(knives.data, combos.data, 'knife')} of ${knives.data.length}`, 'knife finishes without a combo'],
        ]
      : null
  return (
    <section aria-label="Statistics" className="mt-6">
      {figures ? (
        <ul className="grid gap-4 sm:grid-cols-3">
          {figures.map(([value, label]) => (
            <li key={label} className="rounded-lg border border-white/10 p-4">
              <span className="block text-xl font-semibold tabular-nums">{value}</span>
              <span className="text-sm text-white/70">{label}</span>
            </li>
          ))}
        </ul>
      ) : (
        <QueryState
          error={failure}
          onRetry={() => {
            if (gloves.error) gloves.refetch()
            if (knives.error) knives.refetch()
            if (combos.error) combos.refetch()
          }}
        />
      )}
    </section>
  )
}

export function HomePage() {
  useTitle('Home')
  const api = useApi()
  const writes = useComboWrites()
  const drafts = useDraftCount()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const count = drafts.data ?? 0
  // The same pictures as the type grids: Sport Gloves' fixed finish and Karambit's Vanilla.
  const pictures = [
    useFinish('glove', 'sport', 'pandoras-box').data?.image_url,
    useFinish('knife', 'karambit', 'vanilla').data?.image_url,
  ]

  async function publishAll() {
    setBusy(true)
    setMessage(null)
    setFailure(null)
    try {
      const { data } = await api.request('post', '/admin/combos/publish', { body: { all_drafts: true } })
      const changed = data?.changed ?? 0
      setMessage(`Published ${changed} ${changed === 1 ? 'draft' : 'drafts'}.`)
      await writes()
    } catch (error) {
      setFailure(comboErrorMessage(error))
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold">Combos</h1>
      <p className="mt-2 text-white/70">Choose where to start.</p>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {DIRECTIONS.map((direction, i) => (
          <li key={direction.to}>
            <Link
              to={direction.to}
              className="flex items-center gap-4 rounded-lg border border-white/10 p-5 hover:border-accent"
            >
              <Picture url={pictures[i]} size="md" />
              <span className="min-w-0">
                <span className="text-lg font-semibold text-accent">{direction.label}</span>
                <span className="mt-1 block text-sm text-white/70">{direction.text}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Statistics />
      <div className="mt-6 rounded-lg border border-white/10 p-5">
        <h2 className="font-semibold">Drafts</h2>
        <p className="mt-1 text-sm text-white/70">
          {drafts.data === undefined
            ? 'Counting drafts…'
            : `${count} ${count === 1 ? 'draft' : 'drafts'} across all finishes.`}
        </p>
        <button
          type="button"
          className={`${SECONDARY} mt-3`}
          disabled={busy || !count}
          onClick={() => setConfirming(true)}
        >
          Publish all drafts
        </button>
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
      </div>
      <div className="mt-6 rounded-lg border border-white/10 p-5">
        <h2 className="font-semibold">Knife order</h2>
        <p className="mt-1 text-sm text-white/70">The order of knife types in every batch, shared by every admin.</p>
        <Link to="/knife-order" className={`${SECONDARY} mt-3 inline-block`}>
          Change the order
        </Link>
      </div>
      {confirming && (
        <ConfirmDialog
          title={`Publish all ${count} ${count === 1 ? 'draft' : 'drafts'}?`}
          confirmLabel="Publish all"
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={publishAll}
        >
          They will be shown on the website. Unpublished combos stay unpublished.
        </ConfirmDialog>
      )}
    </section>
  )
}
