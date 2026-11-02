import { useParams, Link } from 'react-router-dom'
import { knifeTypes } from '@/data/knives'
import { getAllGloves } from '@/data/gloves'

const getKnifeImageUrl = (knifeId: string, finishId: string): string => {
  const baseUrl = import.meta.env.VITE_ASSET_BASE_URL
  return `${baseUrl}/knives/${knifeId}/${finishId}.png`
}

const totalGloves = getAllGloves().length

export function KnifeFinishes() {
  const { knifeId } = useParams<{ knifeId: string }>()
  const knife = knifeTypes.find((k) => k.id === knifeId)

  if (!knife) {
    return (
      <div className="px-4 md:px-16 lg:px-44 pt-4 md:pt-8 pb-8 md:pb-16">
        <p className="text-white">Knife not found</p>
      </div>
    )
  }

  return (
    <div className="px-4 md:px-16 lg:px-44 pt-4 md:pt-8 pb-8 md:pb-16">
      <h1 className="text-2xl md:text-3xl font-semibold text-white mb-1 md:mb-2">{knife.name}</h1>
      <p className="text-sm md:text-base text-white/60 mb-4 md:mb-8">Pick a finish to find matching glove combinations</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-12">
        {knife.finishes.map((finish) => (
          <Link
            key={finish.id}
            to={`/knives/${knife.id}/${finish.id}/combos`}
            className="group relative bg-white/5 rounded-lg overflow-hidden cursor-pointer w-full"
          >
            <div className="absolute inset-0 bg-radial-[circle_at_center] from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
            <div className="aspect-square">
              <img
                src={getKnifeImageUrl(knife.id, finish.id)}
                alt={`${knife.name} | ${finish.name}`}
                className="w-full h-full object-contain p-4 select-none transition-transform duration-300 group-hover:scale-110"
                draggable={false}
              />
            </div>
            <div className="p-2 md:p-4 pt-0">
              <h3 className="text-white font-medium text-center font-mono text-sm md:text-base min-h-[2.5rem] md:min-h-0 flex items-center justify-center">{finish.name}</h3>
            </div>
            <div className="bg-white/5 py-2 px-4">
              <p className="text-center text-sm text-white/60">
                <span className="text-white font-semibold">{totalGloves}</span> combos
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
