import { Swiper, SwiperSlide } from 'swiper/react'
import type { Swiper as SwiperType } from 'swiper'
import 'swiper/css'
import { LINK_CAROUSEL } from '@/components/carousel'
import { comboWord } from '@/components/comboText'

interface ItemCardProps {
  name: string
  images: string[]
  count: number
  /** The type's combos once the counts load; none shown when 0 or unknown. */
  comboCount?: number
  onSwiperInit?: (swiper: SwiperType) => void
}

export function ItemCard({ name, images, count, comboCount, onSwiperInit }: ItemCardProps) {
  return (
    <div className="group relative bg-white/5 rounded-lg overflow-hidden cursor-pointer w-full">
      <div className="absolute inset-0 bg-radial-[circle_at_center] from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      <div className="aspect-square">
        <Swiper
          speed={800}
          loop
          {...LINK_CAROUSEL}
          className="w-full h-full transition-transform duration-300 group-hover:scale-110"
          onSwiper={onSwiperInit}
        >
          {images.map((image, index) => (
            <SwiperSlide key={index}>
              <img
                src={image}
                alt={`${name} ${index + 1}`}
                className="w-full h-full object-contain p-4 select-none"
                draggable={false}
              />
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
      <div className="p-2 md:p-4 pt-0">
        <h3 className="text-white font-medium text-center font-mono text-sm md:text-base min-h-[2.5rem] md:min-h-0 flex items-center justify-center">{name}</h3>
      </div>
      <div className="bg-white/5 py-2 px-4">
        <p className="text-center text-sm text-white/60">
          {/* Each half stays on one line; a narrow card breaks the line at the dot. */}
          <span className="whitespace-nowrap">
            <span className="text-white font-semibold">{count}</span> available
          </span>
          {comboCount !== undefined && comboCount > 0 && (
            <>
              {' · '}
              <span className="whitespace-nowrap">
                <span className="text-white font-semibold">{comboCount}</span> {comboWord(comboCount)}
              </span>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
