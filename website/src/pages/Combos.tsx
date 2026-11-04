import type { ReactNode } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import { ApiError, type Kind, type PublicCombo } from '@/api/client'
import { useFinishCombos } from '@/api/queries'
import { ComboPictures } from '@/components/ComboPictures'
import { floatRange, itemName, patternSeeds } from '@/components/comboText'
import { getAllGloves } from '@/data/gloves'
import { getAllKnives } from '@/data/knives'

type CatalogItem = ReturnType<typeof getAllGloves>[number]

export function Combos() {
  const { itemId, finishId } = useParams<{ itemId: string; finishId: string }>()
  const location = useLocation()
  const isGlove = location.pathname.startsWith('/gloves')

  const allItems = isGlove ? getAllGloves() : getAllKnives()
  const item = allItems.find((i) => i.typeId === itemId && i.finishId === finishId)

  if (!item) {
    return (
      <div className="px-4 md:px-16 lg:px-44 pt-4 md:pt-8 pb-8 md:pb-16">
        <p className="text-white">Item not found</p>
      </div>
    )
  }

  return <FinishCombos key={item.id} kind={isGlove ? 'gloves' : 'knives'} item={item} />
}

/** The combos of a finish the bundled catalog knows; its slugs, not the URL's, go to the API. */
function FinishCombos({ kind, item }: { kind: Kind; item: CatalogItem }) {
  const query = useFinishCombos(kind, item.typeId, item.finishId)
  const loading = query.isPending || (query.isError && query.isFetching)
  // Query keeps the last combos when a later refresh fails; an error shows no count and no cards.
  const combos = loading || query.isError ? undefined : query.data

  return (
    <div className="px-4 md:px-16 lg:px-44 pt-4 md:pt-8 pb-8 md:pb-16">
      <div className="bg-white/5 rounded-lg p-3 md:p-4 flex items-center gap-3 md:gap-6">
        <img
          src={item.image}
          alt={item.fullName}
          className="h-16 w-16 md:h-24 md:w-24 object-contain"
          draggable={false}
          referrerPolicy="no-referrer"
        />
        <div className="flex-1 min-w-0">
          <h1 className="text-lg md:text-2xl font-semibold text-white truncate">{item.fullName}</h1>
          {combos && <p className="text-white/60 text-xs md:text-sm mt-1">{comboCount(combos.length)}</p>}
        </div>
      </div>

      {loading ? (
        <Message text="Loading combos…" />
      ) : query.isError ? (
        query.error instanceof ApiError && query.error.reason === 'not_found' ? (
          <Message text="This finish was not found." />
        ) : (
          <Message text="Combos could not be loaded.">
            <button
              type="button"
              onClick={() => query.refetch()}
              className="mt-4 px-4 py-2 rounded-lg bg-white/10 text-white text-sm md:text-base hover:bg-white/20 transition-colors cursor-pointer"
            >
              Try again
            </button>
          </Message>
        )
      ) : (
        combos &&
        combos.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-6 mt-4 md:mt-8">
            {combos.map((combo) => (
              <ComboCard key={combo.id} combo={combo} isGlove={kind === 'gloves'} />
            ))}
          </div>
        )
      )}
    </div>
  )
}

/** "15 combos", "1 combo", or "No combos yet". */
function comboCount(count: number): string {
  if (count === 0) return 'No combos yet'
  return count === 1 ? '1 combo' : `${count} combos`
}

function Message({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[200px] md:min-h-[400px]">
      <p className="text-white/40 text-base md:text-lg">{text}</p>
      {children}
    </div>
  )
}

function getScoreColor(score: number): string {
  if (score >= 8.5) return '#00DE12' // brand green
  if (score >= 6.5) return '#84cc16' // lime
  if (score >= 5) return '#eab308' // yellow
  if (score >= 3.5) return '#f97316' // orange
  return '#ef4444' // red
}

function ScoreCircle({ score }: { score: number }) {
  const color = getScoreColor(score)
  const percentage = (score / 10) * 100
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  return (
    <div className="relative w-16 h-16 md:w-24 md:h-24 flex-shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className="text-white/10"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-white/60 text-[10px] md:text-xs">Score:</span>
        <span className="text-white font-bold text-sm md:text-lg" style={{ color }}>{score}</span>
      </div>
    </div>
  )
}

function ComboCard({ combo, isGlove }: { combo: PublicCombo; isGlove: boolean }) {
  const other = isGlove ? combo.knife : combo.glove
  const conditions = [
    ['Glove Pattern', patternSeeds(combo.glove)],
    ['Knife Pattern', patternSeeds(combo.knife)],
    ['Glove Float', floatRange(combo.glove)],
    ['Knife Float', floatRange(combo.knife)],
  ]

  return (
    <article className="bg-white/5 rounded-lg overflow-hidden">
      <ComboPictures combo={combo} />
      <div className="p-3 md:p-4">
        <div className="flex items-start justify-between gap-3 md:gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-base md:text-lg font-semibold text-white">{itemName(other)}</h3>
            {combo.description && (
              <p className="text-white/60 text-sm md:text-base mt-1 md:mt-2 whitespace-pre-line">
                {combo.description}
              </p>
            )}
          </div>
          <ScoreCircle score={combo.rating} />
        </div>

        <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-white/10 grid grid-cols-2 gap-1 md:gap-2 text-xs md:text-sm">
          {conditions.map(([label, value]) => (
            <div key={label}>
              <span className="text-white/40">{label}:</span>{' '}
              <span className="text-white/80">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </article>
  )
}
