import { Link, useParams } from 'react-router'
import { useTitle } from '../components/useTitle'
import { BASE, DIRECTION, finishPath } from '../combos/paths'
import { useCatalogTypes, useCombos, type AdminCombo, type Kind } from '../combos/queries'
import { LINK } from '../combos/styles'
import { QueryState } from '../combos/ui'
import { rangeHint } from '../combos/values'

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

function counts(combos: AdminCombo[] | undefined, failed: boolean, finish: string, kind: Kind) {
  if (failed) return 'Combo count unavailable'
  if (!combos) return 'Counting combos…'
  const mine = combos.filter((c) => (kind === 'glove' ? c.glove : c.knife).finish_slug === finish)
  if (!mine.length) return 'No combos yet'
  const drafts = mine.filter((c) => c.status === 'draft').length
  return plural(mine.length, 'combo') + (drafts ? ` · ${plural(drafts, 'draft')}` : '')
}

/** One glove or knife type: its finishes, each with how many combos it has. */
export function TypePage({ kind }: { kind: Kind }) {
  const { type: slug = '' } = useParams()
  const catalog = useCatalogTypes(kind)
  const type = catalog.data?.find((t) => t.slug === slug)
  // Asked for only once the type is known to exist.
  const combos = useCombos(kind === 'glove' ? { glove_type: slug } : { knife_type: slug }, type !== undefined)
  useTitle(type?.name ?? DIRECTION[kind])

  if (!catalog.data) return <QueryState error={catalog.error} onRetry={() => catalog.refetch()} />
  if (!type) {
    return (
      <section>
        <p role="alert" className="text-white/80">
          This type was not found.
        </p>
        <Link to={BASE[kind]} className={`${LINK} mt-2 inline-block`}>
          Back to {DIRECTION[kind]}
        </Link>
      </section>
    )
  }
  return (
    <section>
      <p className="text-sm">
        <Link to={BASE[kind]} className={LINK}>
          {DIRECTION[kind]}
        </Link>
      </p>
      <h1 className="mt-1 text-2xl font-semibold">{type.name}</h1>
      <p className="mt-1 text-sm text-white/70">
        {type.finishes.length ? 'Pick a finish to see its combos.' : 'This type has no finishes in the game.'}
      </p>
      {combos.error && <QueryState error={combos.error} onRetry={() => combos.refetch()} />}
      <ul aria-label="Finishes" className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {type.finishes.map((finish) => {
          const range = rangeHint({ min: finish.floatMin, max: finish.floatMax })
          return (
            <li key={finish.finishSlug}>
              <Link
                to={finishPath(kind, slug, finish.finishSlug)}
                className="block h-full rounded-lg border border-white/10 bg-white/5 p-4 hover:border-accent"
              >
                <span className="flex items-center gap-2 font-semibold">
                  <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: finish.color }} />
                  {finish.displayName}
                </span>
                <span className="mt-1 block text-sm text-white/60">{range ? `Float ${range}` : 'No float range'}</span>
                <span className="mt-1 block text-sm text-white/80">{counts(combos.data, combos.isError, finish.finishSlug, kind)}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
