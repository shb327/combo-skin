import catalog from './catalog.json'

// Types, finishes and finish images come from catalog.json, generated from the game's item data
// by the API's catalog tooling. Do not edit it by hand: see the README's Data section.

export interface Finish {
  id: string
  name: string
  image: string
}

export interface GloveType {
  id: string
  name: string
  finishes: Finish[]
}

export const gloveTypes: GloveType[] = catalog.gloves

export const getAllGloves = () => {
  return gloveTypes.flatMap((type) =>
    type.finishes.map((finish) => ({
      typeId: type.id,
      typeName: type.name,
      finishId: finish.id,
      finishName: finish.name,
      fullName: `${type.name} | ${finish.name}`,
      id: `${type.id}-${finish.id}`,
      image: finish.image,
    }))
  )
}
