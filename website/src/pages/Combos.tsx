import { useParams, useLocation } from 'react-router-dom'
import ImageZoom from 'react-image-zooom'
import { getAllGloves } from '@/data/gloves'
import { getAllKnives } from '@/data/knives'
import { getCombosForGlove, type Combo } from '@/data/combos'

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

  const combos = isGlove
    ? getCombosForGlove(itemId!, finishId!)
    : [] // TODO: getCombosForKnife

  const totalPossible = isGlove ? getAllKnives().length : getAllGloves().length

  return (
    <div className="px-4 md:px-16 lg:px-44 pt-4 md:pt-8 pb-8 md:pb-16">
      <div className="bg-white/5 rounded-lg p-3 md:p-4 flex items-center gap-3 md:gap-6">
        <img
          src={item.image}
          alt={item.fullName}
          className="h-16 w-16 md:h-24 md:w-24 object-contain"
          draggable={false}
        />
        <div className="flex-1 min-w-0">
          <h1 className="text-lg md:text-2xl font-semibold text-white truncate">{item.fullName}</h1>
          <p className="text-white/60 text-xs md:text-sm mt-1">
            {combos.length} of {totalPossible} {isGlove ? 'knife' : 'glove'} combinations available
          </p>
        </div>
      </div>

      {combos.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-6 mt-4 md:mt-8">
          {combos.map((combo) => (
            <ComboCard key={combo.id} combo={combo} isGlove={isGlove} />
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center min-h-[200px] md:min-h-[400px]">
          <p className="text-white/40 text-base md:text-lg">No combos available</p>
        </div>
      )}
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

function ComboCard({ combo, isGlove }: { combo: Combo; isGlove: boolean }) {
  const hasPatternOrFloat = combo.glovePattern || combo.knifePattern || combo.gloveFloat || combo.knifeFloat

  return (
    <div className="bg-white/5 rounded-lg overflow-hidden">
      <ImageZoom
        src={combo.image}
        alt={combo.knifeName}
        className="w-full aspect-video object-cover"
        zoom="200"
      />
      <div className="p-3 md:p-4">
        <div className="flex items-start justify-between gap-3 md:gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-base md:text-lg font-semibold text-white">{combo.knifeName}</h3>
            <p className="text-white/60 text-sm md:text-base mt-1 md:mt-2">
              {combo.description || 'No description available.'}
            </p>
          </div>
          <ScoreCircle score={combo.rating} />
        </div>

        {hasPatternOrFloat && (
          <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-white/10 grid grid-cols-2 gap-1 md:gap-2 text-xs md:text-sm">
            {combo.glovePattern && (
              <div>
                <span className="text-white/40">Glove Pattern:</span>{' '}
                <span className="text-white/80">{combo.glovePattern}</span>
              </div>
            )}
            {combo.knifePattern && (
              <div>
                <span className="text-white/40">{isGlove ? 'Knife' : 'Glove'} Pattern:</span>{' '}
                <span className="text-white/80">{combo.knifePattern}</span>
              </div>
            )}
            {combo.gloveFloat && (
              <div>
                <span className="text-white/40">Glove Float:</span>{' '}
                <span className="text-white/80">{combo.gloveFloat}</span>
              </div>
            )}
            {combo.knifeFloat && (
              <div>
                <span className="text-white/40">{isGlove ? 'Knife' : 'Glove'} Float:</span>{' '}
                <span className="text-white/80">{combo.knifeFloat}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
