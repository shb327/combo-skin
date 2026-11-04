import { useParams } from 'react-router-dom'
import { FinishGrid } from '@/components/FinishGrid'
import { gloveTypes } from '@/data/gloves'

export function GloveFinishes() {
  const { gloveId } = useParams<{ gloveId: string }>()
  const glove = gloveTypes.find((g) => g.id === gloveId)

  if (!glove) {
    return (
      <div className="px-4 md:px-16 lg:px-44 pt-4 md:pt-8 pb-8 md:pb-16">
        <p className="text-white">Glove not found</p>
      </div>
    )
  }

  return (
    <FinishGrid
      kind="gloves"
      type={glove}
      subtitle="Pick a finish to find matching knife combinations"
    />
  )
}
