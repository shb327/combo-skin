import mogul1 from '@/assets/combos/mogul/1.jpeg'
import mogul2 from '@/assets/combos/mogul/2.jpeg'
import mogul3 from '@/assets/combos/mogul/3.jpeg'
import mogul4 from '@/assets/combos/mogul/4.jpeg'

export interface Combo {
  id: string
  image: string
  knifeId: string
  knifeName: string
  rating: number // 1-5 or 1-10?
  description: string
  glovePattern?: string
  knifePattern?: string
  gloveFloat?: string
  knifeFloat?: string
}

export interface GloveCombos {
  gloveTypeId: string
  gloveFinishId: string
  combos: Combo[]
}

// Mogul gloves combos - fill in your data here
export const gloveCombos: GloveCombos[] = [
  {
    gloveTypeId: 'specialist',
    gloveFinishId: 'mogul',
    combos: [
      {
        id: 'mogul-1',
        image: mogul1,
        knifeId: '',
        knifeName: 'M9 Bayonet | Urban Masked',
        rating: 8.88,
        description: '',
        // glovePattern: '',
        // knifePattern: '2',
        // gloveFloat: '',
        // knifeFloat: '',
      },
      {
        id: 'mogul-2',
        image: mogul2,
        knifeId: '',
        knifeName: 'Karambit | Gamma Daggers (Phase 1)',
        rating: 8.82,
        description: 'Any diamond gem pattern would be recommended.',
        knifePattern: '717',
      },
      {
        id: 'mogul-3',
        image: mogul3,
        knifeId: '',
        knifeName: 'Shadow Daggers | Doppler (Phase 4)',
        rating: 7.6,
        description: '',
        glovePattern: '2',
        gloveFloat: '0.1 - 0.28',
      },
      {
        id: 'mogul-4',
        image: mogul4,
        knifeId: '',
        knifeName: 'Karambit | Case Hardened',
        rating: 7.54,
        description: 'Any "beach" pattern with good balance of blue and yellow is what makes this combo work.',
        glovePattern: '2',
        knifePattern: '179',
        gloveFloat: '0.1 - 0.28',
        knifeFloat: '0.01 - 0.28',
      },
    ],
  },
]

// Helper to get combos for a specific glove
export const getCombosForGlove = (typeId: string, finishId: string): Combo[] => {
  const found = gloveCombos.find(
    (gc) => gc.gloveTypeId === typeId && gc.gloveFinishId === finishId
  )
  return found?.combos ?? []
}
