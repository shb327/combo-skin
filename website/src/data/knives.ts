import catalog from './catalog.json'
import type { Finish } from './gloves'

// Generated like the gloves: see gloves.ts.

export interface KnifeType {
  id: string
  name: string
  finishes: Finish[]
}

export const knifeTypes: KnifeType[] = catalog.knives

export const getAllKnives = () => {
  return knifeTypes.flatMap((type) =>
    type.finishes.map((finish) => ({
      typeId: type.id,
      typeName: type.name,
      finishId: finish.id,
      finishName: finish.name,
      fullName: `${type.name} | ${finish.name}`,
      id: `${type.id}-${finish.id}`,
      image: finish.image,
      imageKey: finish.image_key,
    }))
  )
}
