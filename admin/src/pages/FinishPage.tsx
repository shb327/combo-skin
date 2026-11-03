import { Link, useLocation } from 'react-router'
import { useTitle } from '../components/useTitle'
import { ComboList } from '../combos/ComboList'
import { COMBO_MESSAGES } from '../combos/messages'
import { BASE, DIRECTION, finishPath, typePath } from '../combos/paths'
import type { Kind } from '../combos/queries'
import { LINK, SECONDARY } from '../combos/styles'
import { detailLabel, isRetired, useFinishPage } from '../combos/useFinishPage'
import { rangeHint } from '../combos/values'

/** One glove or knife finish: its combos and what can be added to it. */
export function FinishPage({ kind }: { kind: Kind }) {
  const { type, finish, data, fallback } = useFinishPage(kind)
  const location = useLocation()
  useTitle(data ? detailLabel(data) : DIRECTION[kind])
  if (!data) return fallback
  const saved = (location.state as { saved?: string } | null)?.saved
  const retired = isRetired(data)
  const range = rangeHint({ min: data.float_min, max: data.float_max })
  const filters =
    kind === 'glove' ? { glove_type: type, glove_finish: finish } : { knife_type: type, knife_finish: finish }
  return (
    <section>
      <p className="text-sm">
        <Link to={BASE[kind]} className={LINK}>
          {DIRECTION[kind]}
        </Link>
        <span className="text-white/40"> / </span>
        {data.item_type.active ? (
          <Link to={typePath(kind, type)} className={LINK}>
            {data.item_type.name}
          </Link>
        ) : (
          // A retired type has no page of its own.
          <span>{data.item_type.name}</span>
        )}
      </p>
      <h1 className="mt-1 text-2xl font-semibold">{detailLabel(data)}</h1>
      <p className="mt-1 text-sm text-white/70">{range ? `Float ${range}` : 'No float range'}</p>
      {retired ? (
        <p className="mt-3 rounded-md bg-white/5 px-3 py-2 text-sm">{COMBO_MESSAGES.retired}</p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to={`${finishPath(kind, type, finish)}/add`} className={SECONDARY}>
            {kind === 'glove' ? 'Add knife' : 'Add gloves'}
          </Link>
          {kind === 'glove' && (
            <Link to={`${finishPath(kind, type, finish)}/batch`} className={SECONDARY}>
              Start a batch
            </Link>
          )}
        </div>
      )}
      {saved && (
        <p role="status" className="mt-3 text-sm text-accent">
          {saved}
        </p>
      )}
      <ComboList side={kind} filters={filters} />
    </section>
  )
}
