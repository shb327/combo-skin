import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Autoplay, Controller } from 'swiper/modules'
import type { Swiper as SwiperType } from 'swiper'
import 'swiper/css'
import { LINK_CAROUSEL } from '@/components/carousel'

import glove1 from '@/assets/hero/glove-1.png'
import glove2 from '@/assets/hero/glove-2.png'
import glove3 from '@/assets/hero/glove-3.png'
import glove4 from '@/assets/hero/glove-4.png'
import glove5 from '@/assets/hero/glove-5.png'
import glove6 from '@/assets/hero/glove-6.png'
import glove7 from '@/assets/hero/glove-7.png'
import glove8 from '@/assets/hero/glove-8.png'
import glove9 from '@/assets/hero/glove-9.png'
import knife1 from '@/assets/hero/knife-1.png'
import knife2 from '@/assets/hero/knife-2.png'
import knife3 from '@/assets/hero/knife-3.png'
import knife4 from '@/assets/hero/knife-4.png'
import knife5 from '@/assets/hero/knife-5.png'
import knife6 from '@/assets/hero/knife-6.png'
import knife7 from '@/assets/hero/knife-7.png'
import knife8 from '@/assets/hero/knife-8.png'
import knife9 from '@/assets/hero/knife-9.png'

const gloves = [glove1, glove2, glove3, glove4, glove5, glove6, glove7, glove8, glove9]
const knives = [knife1, knife2, knife3, knife4, knife5, knife6, knife7, knife8, knife9]

export function Hero() {
  const [gloveSwiper, setGloveSwiper] = useState<SwiperType | null>(null)
  const [knifeSwiper, setKnifeSwiper] = useState<SwiperType | null>(null)

  return (
    <section className="px-4 md:px-16 lg:px-44 py-8 md:py-16">
      <div className="text-left md:text-center mb-8 md:mb-16">
        <h1 className="text-4xl lg:text-5xl font-semibold text-white mb-4">
          Find your <br className="md:hidden" />perfect <span className="text-accent font-bold border-r-4 border-accent bg-accent/10 px-3 py-1">combo</span>
        </h1>
        <p className="text-lg text-white/60 md:max-w-xl md:mx-auto">
          Discover the best glove and knife combinations for CS2.
          Curated by the community, made for style.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:flex md:gap-8 md:justify-center md:items-center">
        <Link to="/gloves" className="flex flex-col items-center gap-2 md:gap-4 md:w-80 lg:w-[420px]">
          <div className="group relative w-full aspect-square bg-white/5 rounded-lg overflow-hidden cursor-pointer">
            <div className="absolute inset-0 bg-radial-[circle_at_center] from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
            <Swiper
              modules={[Autoplay, Controller]}
              onSwiper={setGloveSwiper}
              controller={{ control: knifeSwiper }}
              autoplay={{ delay: 3000, disableOnInteraction: false }}
              {...LINK_CAROUSEL}
              loop
              className="w-full h-full transition-transform duration-300 md:group-hover:scale-110"
            >
              {gloves.map((glove, index) => (
                <SwiperSlide key={index}>
                  <img src={glove} alt={`Glove ${index + 1}`} className="w-full h-full object-contain p-4 md:p-6 select-none" draggable={false} />
                </SwiperSlide>
              ))}
            </Swiper>
          </div>
          <span className="text-white/80 text-sm md:text-base font-mono">Search by gloves</span>
        </Link>

        <Link to="/knives" className="flex flex-col items-center gap-2 md:gap-4 md:w-80 lg:w-[420px]">
          <div className="group relative w-full aspect-square bg-white/5 rounded-lg overflow-hidden cursor-pointer">
            <div className="absolute inset-0 bg-radial-[circle_at_center] from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
            <Swiper
              modules={[Autoplay, Controller]}
              onSwiper={setKnifeSwiper}
              controller={{ control: gloveSwiper }}
              autoplay={{ delay: 3000, disableOnInteraction: false }}
              {...LINK_CAROUSEL}
              loop
              className="w-full h-full transition-transform duration-300 md:group-hover:scale-110"
            >
              {knives.map((knife, index) => (
                <SwiperSlide key={index}>
                  <img src={knife} alt={`Knife ${index + 1}`} className="w-full h-full object-contain p-6 md:p-12 select-none" draggable={false} />
                </SwiperSlide>
              ))}
            </Swiper>
          </div>
          <span className="text-white/80 text-sm md:text-base font-mono">Search by knives</span>
        </Link>
      </div>
    </section>
  )
}
