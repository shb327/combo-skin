import { useEffect, useRef } from 'react'
import type { Swiper as SwiperType } from 'swiper'
import { Link } from 'react-router-dom'
import { typeCount } from '@/api/counts'
import { useComboCounts } from '@/api/queries'
import { ItemCard } from '@/components/ItemCard'
import { gloveTypes as gloveData } from '@/data/gloves'

import bloodhound1 from '@/assets/gloves/bloodhound/1.png'
import bloodhound2 from '@/assets/gloves/bloodhound/2.png'
import bloodhound3 from '@/assets/gloves/bloodhound/3.png'
import brokenFang1 from '@/assets/gloves/broken-fang/1.png'
import brokenFang2 from '@/assets/gloves/broken-fang/2.png'
import brokenFang3 from '@/assets/gloves/broken-fang/3.png'
import driver1 from '@/assets/gloves/driver/1.png'
import driver2 from '@/assets/gloves/driver/2.png'
import driver3 from '@/assets/gloves/driver/3.png'
import handWraps1 from '@/assets/gloves/hand-wraps/1.png'
import handWraps2 from '@/assets/gloves/hand-wraps/2.png'
import handWraps3 from '@/assets/gloves/hand-wraps/3.png'
import hydra1 from '@/assets/gloves/hydra/1.png'
import hydra2 from '@/assets/gloves/hydra/2.png'
import hydra3 from '@/assets/gloves/hydra/3.png'
import moto1 from '@/assets/gloves/moto/1.png'
import moto2 from '@/assets/gloves/moto/2.png'
import moto3 from '@/assets/gloves/moto/3.png'
import specialist1 from '@/assets/gloves/specialist/1.png'
import specialist2 from '@/assets/gloves/specialist/2.png'
import specialist3 from '@/assets/gloves/specialist/3.png'
import sport1 from '@/assets/gloves/sport/1.png'
import sport2 from '@/assets/gloves/sport/2.png'
import sport3 from '@/assets/gloves/sport/3.png'

const gloveImages: Record<string, string[]> = {
  'bloodhound': [bloodhound1, bloodhound2, bloodhound3],
  'broken-fang': [brokenFang1, brokenFang2, brokenFang3],
  'driver': [driver1, driver2, driver3],
  'hand-wraps': [handWraps1, handWraps2, handWraps3],
  'hydra': [hydra1, hydra2, hydra3],
  'moto': [moto1, moto2, moto3],
  'specialist': [specialist1, specialist2, specialist3],
  'sport': [sport1, sport2, sport3],
}

export function SearchGloves() {
  const counts = useComboCounts()
  const swipersRef = useRef<(SwiperType | null)[]>([])

  useEffect(() => {
    const interval = setInterval(() => {
      const swipers = swipersRef.current.filter(Boolean) as SwiperType[]
      if (swipers.length < 2) return

      const indices = [...Array(swipers.length).keys()]
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[indices[i], indices[j]] = [indices[j], indices[i]]
      }

      swipers[indices[0]].slideNext()
      swipers[indices[1]].slideNext()
    }, 3500)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="px-4 md:px-16 lg:px-44 pt-4 md:pt-8 pb-8 md:pb-16">
      <h1 className="text-2xl md:text-3xl font-semibold text-white mb-1 md:mb-2">Search by gloves</h1>
      <p className="text-sm md:text-base text-white/60 mb-4 md:mb-8">Pick a glove type to find matching knife combinations</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-12">
        {gloveData.map((glove, index) => (
          <Link key={glove.id} to={`/gloves/${glove.id}`}>
            <ItemCard
              name={glove.name}
              images={gloveImages[glove.id] || []}
              count={glove.finishes.length}
              comboCount={counts && typeCount(counts, 'gloves', glove.id, glove.finishes)}
              onSwiperInit={(swiper) => {
                swipersRef.current[index] = swiper
              }}
            />
          </Link>
        ))}
      </div>
    </div>
  )
}
