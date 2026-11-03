import { useNavigate } from 'react-router'
import { useTitle } from '../components/useTitle'
import { FinishSearch } from '../combos/FinishSearch'
import { DIRECTION, finishPath } from '../combos/paths'
import { useCatalog, type Kind } from '../combos/queries'
import { QueryState } from '../combos/ui'

/** By gloves and By knife: find a finish to open. */
export function FinishesPage({ kind }: { kind: Kind }) {
  useTitle(DIRECTION[kind])
  const navigate = useNavigate()
  const catalog = useCatalog(kind)
  return (
    <section>
      <h1 className="text-2xl font-semibold">{DIRECTION[kind]}</h1>
      <p className="mt-2 max-w-prose text-white/70">
        {kind === 'glove'
          ? 'Find a pair of gloves to see its combos, add a knife or start a batch.'
          : 'Find a knife to see its combos and add gloves.'}
      </p>
      <div className="mt-6">
        {catalog.data ? (
          <FinishSearch
            label={kind === 'glove' ? 'Find gloves' : 'Find a knife'}
            entries={catalog.data}
            autoFocus
            onSelect={(entry) => navigate(finishPath(kind, entry.typeSlug, entry.finishSlug))}
          />
        ) : (
          <QueryState error={catalog.error} onRetry={() => catalog.refetch()} />
        )}
      </div>
    </section>
  )
}
