import { useParams } from 'react-router-dom'
import { FinishGrid } from '@/components/FinishGrid'
import { knifeTypes } from '@/data/knives'

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
    <FinishGrid
      kind="knives"
      type={knife}
      subtitle="Pick a finish to find matching glove combinations"
    />
  )
}
