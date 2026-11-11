import { Link, useNavigate } from 'react-router'
import { useTitle } from '../components/useTitle'
import { SearchCombobox } from '../combos/SearchCombobox'
import { Picture } from '../combos/Picture'
import { typePicture } from '../combos/pictures'
import { DIRECTION, SEARCH_EXAMPLE, finishPath, typePath } from '../combos/paths'
import { useCatalog, useCatalogTypes, type Kind } from '../combos/queries'
import { QueryState } from '../combos/ui'

/** By gloves and By knife: find a finish to open. */
export function FinishesPage({ kind }: { kind: Kind }) {
  useTitle(DIRECTION[kind])
  const navigate = useNavigate()
  const catalog = useCatalog(kind)
  const types = useCatalogTypes(kind)
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
          <>
            <SearchCombobox
              label={kind === 'glove' ? 'Find gloves' : 'Find a knife'}
              entries={catalog.data}
              autoFocus
              placeholder={SEARCH_EXAMPLE[kind]}
              onSelect={(entry) => navigate(finishPath(kind, entry.typeSlug, entry.finishSlug))}
            />
            <h2 className="mt-8 font-semibold">Or browse</h2>
            <ul
              aria-label={kind === 'glove' ? 'Glove types' : 'Knife types'}
              className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
            >
              {(types.data ?? []).map((type) => (
                <li key={type.slug}>
                  <Link
                    to={typePath(kind, type.slug)}
                    className="block h-full rounded-lg border border-white/10 bg-white/5 p-4 hover:border-accent"
                  >
                    <span className="flex justify-center">
                      <Picture url={typePicture(kind, type)?.url} fallback={typePicture(kind, type)?.fallback} size="lg" />
                    </span>
                    <span className="mt-2 block font-semibold">{type.name}</span>
                    <span className="mt-1 block text-sm text-white/60">
                      {type.finishes.length} {type.finishes.length === 1 ? 'finish' : 'finishes'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <QueryState error={catalog.error} onRetry={() => catalog.refetch()} />
        )}
      </div>
    </section>
  )
}
