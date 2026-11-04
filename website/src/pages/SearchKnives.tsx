import { useEffect, useRef } from 'react'
import type { Swiper as SwiperType } from 'swiper'
import { Link } from 'react-router-dom'
import { typeCount } from '@/api/counts'
import { useComboCounts } from '@/api/queries'
import { ItemCard } from '@/components/ItemCard'
import { knifeTypes as knifeData } from '@/data/knives'

import bayonet1 from '@/assets/knives/bayonet/1.png'
import bayonet2 from '@/assets/knives/bayonet/2.png'
import bayonet3 from '@/assets/knives/bayonet/3.png'
import bowie1 from '@/assets/knives/bowie/1.png'
import bowie2 from '@/assets/knives/bowie/2.png'
import bowie3 from '@/assets/knives/bowie/3.png'
import butterfly1 from '@/assets/knives/butterfly/1.png'
import butterfly2 from '@/assets/knives/butterfly/2.png'
import butterfly3 from '@/assets/knives/butterfly/3.png'
import classic1 from '@/assets/knives/classic/1.png'
import classic2 from '@/assets/knives/classic/2.png'
import classic3 from '@/assets/knives/classic/3.png'
import falchion1 from '@/assets/knives/falchion/1.png'
import falchion2 from '@/assets/knives/falchion/2.png'
import falchion3 from '@/assets/knives/falchion/3.png'
import flip1 from '@/assets/knives/flip/1.png'
import flip2 from '@/assets/knives/flip/2.png'
import flip3 from '@/assets/knives/flip/3.png'
import gut1 from '@/assets/knives/gut/1.png'
import gut2 from '@/assets/knives/gut/2.png'
import gut3 from '@/assets/knives/gut/3.png'
import huntsman1 from '@/assets/knives/huntsman/1.png'
import huntsman2 from '@/assets/knives/huntsman/2.png'
import huntsman3 from '@/assets/knives/huntsman/3.png'
import karambit1 from '@/assets/knives/karambit/1.png'
import karambit2 from '@/assets/knives/karambit/2.png'
import karambit3 from '@/assets/knives/karambit/3.png'
import m9Bayonet1 from '@/assets/knives/m9-bayonet/1.png'
import m9Bayonet2 from '@/assets/knives/m9-bayonet/2.png'
import m9Bayonet3 from '@/assets/knives/m9-bayonet/3.png'
import navaja1 from '@/assets/knives/navaja/1.png'
import navaja2 from '@/assets/knives/navaja/2.png'
import navaja3 from '@/assets/knives/navaja/3.png'
import nomad1 from '@/assets/knives/nomad/1.png'
import nomad2 from '@/assets/knives/nomad/2.png'
import nomad3 from '@/assets/knives/nomad/3.png'
import paracord1 from '@/assets/knives/paracord/1.png'
import paracord2 from '@/assets/knives/paracord/2.png'
import paracord3 from '@/assets/knives/paracord/3.png'
import shadowDaggers1 from '@/assets/knives/shadow-daggers/1.png'
import shadowDaggers2 from '@/assets/knives/shadow-daggers/2.png'
import shadowDaggers3 from '@/assets/knives/shadow-daggers/3.png'
import skeleton1 from '@/assets/knives/skeleton/1.png'
import skeleton2 from '@/assets/knives/skeleton/2.png'
import skeleton3 from '@/assets/knives/skeleton/3.png'
import stiletto1 from '@/assets/knives/stiletto/1.png'
import stiletto2 from '@/assets/knives/stiletto/2.png'
import stiletto3 from '@/assets/knives/stiletto/3.png'
import survival1 from '@/assets/knives/survival/1.png'
import survival2 from '@/assets/knives/survival/2.png'
import survival3 from '@/assets/knives/survival/3.png'
import talon1 from '@/assets/knives/talon/1.png'
import talon2 from '@/assets/knives/talon/2.png'
import talon3 from '@/assets/knives/talon/3.png'
import ursus1 from '@/assets/knives/ursus/1.png'
import ursus2 from '@/assets/knives/ursus/2.png'
import ursus3 from '@/assets/knives/ursus/3.png'
import kukri1 from '@/assets/knives/kukri/1.png'
import kukri2 from '@/assets/knives/kukri/2.png'
import kukri3 from '@/assets/knives/kukri/3.png'

const knifeImages: Record<string, string[]> = {
  'bayonet': [bayonet1, bayonet2, bayonet3],
  'bowie': [bowie1, bowie2, bowie3],
  'butterfly': [butterfly1, butterfly2, butterfly3],
  'classic': [classic1, classic2, classic3],
  'falchion': [falchion1, falchion2, falchion3],
  'flip': [flip1, flip2, flip3],
  'gut': [gut1, gut2, gut3],
  'huntsman': [huntsman1, huntsman2, huntsman3],
  'karambit': [karambit1, karambit2, karambit3],
  'm9-bayonet': [m9Bayonet1, m9Bayonet2, m9Bayonet3],
  'navaja': [navaja1, navaja2, navaja3],
  'nomad': [nomad1, nomad2, nomad3],
  'paracord': [paracord1, paracord2, paracord3],
  'shadow-daggers': [shadowDaggers1, shadowDaggers2, shadowDaggers3],
  'skeleton': [skeleton1, skeleton2, skeleton3],
  'stiletto': [stiletto1, stiletto2, stiletto3],
  'survival': [survival1, survival2, survival3],
  'talon': [talon1, talon2, talon3],
  'ursus': [ursus1, ursus2, ursus3],
  'kukri': [kukri1, kukri2, kukri3],
}

export function SearchKnives() {
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
      <h1 className="text-2xl md:text-3xl font-semibold text-white mb-1 md:mb-2">Search by knives</h1>
      <p className="text-sm md:text-base text-white/60 mb-4 md:mb-8">Pick a knife type to find matching glove combinations</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-12">
        {knifeData.map((knife, index) => (
          <Link key={knife.id} to={`/knives/${knife.id}`}>
            <ItemCard
              name={knife.name}
              images={knifeImages[knife.id] || []}
              count={knife.finishes.length}
              comboCount={counts && typeCount(counts, 'knives', knife.id, knife.finishes)}
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
