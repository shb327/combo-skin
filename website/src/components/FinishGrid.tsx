import { Link, useSearchParams } from 'react-router-dom'
import type { Kind } from '@/api/client'
import { finishCount } from '@/api/counts'
import { useComboCounts } from '@/api/queries'
import { comboWord } from '@/components/comboText'
import { Message } from '@/components/Message'
import type { Finish } from '@/data/gloves'

interface FinishGridProps {
  kind: Kind
  type: { id: string; name: string; finishes: Finish[] }
  subtitle: string
}

/** The URL's `has` value that turns the "Has combos" filter on. */
const HAS_COMBOS = 'combos'

/** A type's finish cards, in catalog order, each with its number of combos once the counts
 * load. The "Has combos" filter, kept in the URL, applies only once they have. */
export function FinishGrid({ kind, type, subtitle }: FinishGridProps) {
  const counts = useComboCounts()
  const [searchParams, setSearchParams] = useSearchParams()
  const filtered = counts !== undefined && searchParams.get('has') === HAS_COMBOS
  const finishes = filtered
    ? type.finishes.filter((finish) => finishCount(counts, kind, type.id, finish.id) > 0)
    : type.finishes

  const setFiltered = (on: boolean) =>
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params)
        if (on) next.set('has', HAS_COMBOS)
        else next.delete('has')
        return next
      },
      { replace: true },
    )

  return (
    <div className="px-4 md:px-16 lg:px-44 pt-4 md:pt-8 pb-8 md:pb-16">
      <h1 className="text-2xl md:text-3xl font-semibold text-white mb-1 md:mb-2">{type.name}</h1>
      <div className="flex items-center justify-between gap-4 mb-4 md:mb-8">
        <p className="text-sm md:text-base text-white/60">{subtitle}</p>
        {/* Takes its space before the counts load, so the grid does not move when it appears. */}
        <label
          aria-hidden={counts === undefined}
          style={{ visibility: counts === undefined ? 'hidden' : 'visible' }}
          className="flex shrink-0 items-center gap-2 text-sm md:text-base text-white/60 cursor-pointer select-none"
        >
          <input
            type="checkbox"
            checked={filtered}
            disabled={counts === undefined}
            onChange={(event) => setFiltered(event.target.checked)}
            className="h-4 w-4 accent-white cursor-pointer"
          />
          Has combos
        </label>
      </div>

      {finishes.length === 0 && (
        <Message text={`No ${type.name} finishes have combos yet.`}>
          <button
            type="button"
            onClick={() => setFiltered(false)}
            className="mt-4 px-4 py-2 rounded-lg bg-white/10 text-white text-sm md:text-base hover:bg-white/20 transition-colors cursor-pointer"
          >
            Show all finishes
          </button>
        </Message>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-12">
        {finishes.map((finish) => (
          <FinishCard
            key={finish.id}
            to={`/${kind}/${type.id}/${finish.id}/combos`}
            alt={`${type.name} | ${finish.name}`}
            finish={finish}
            count={counts && finishCount(counts, kind, type.id, finish.id)}
          />
        ))}
      </div>
    </div>
  )
}

function FinishCard({
  to,
  alt,
  finish,
  count,
}: {
  to: string
  alt: string
  finish: Finish
  count: number | undefined
}) {
  return (
    <Link
      to={to}
      className="group relative bg-white/5 rounded-lg overflow-hidden cursor-pointer w-full"
    >
      <div className="absolute inset-0 bg-radial-[circle_at_center] from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      <div className="aspect-square">
        <img
          src={finish.image}
          alt={alt}
          className="w-full h-full object-contain p-4 select-none transition-transform duration-300 group-hover:scale-110"
          draggable={false}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </div>
      <div className="p-2 md:p-4 pt-0">
        <h3 className="text-white font-medium text-center font-mono text-sm md:text-base min-h-[2.5rem] md:min-h-0 flex items-center justify-center">{finish.name}</h3>
      </div>
      {count !== undefined && count > 0 && (
        <div className="bg-white/5 py-2 px-4">
          <p className="text-center text-sm text-white/60">
            <span className="text-white font-semibold">{count}</span> {comboWord(count)}
          </p>
        </div>
      )}
    </Link>
  )
}
