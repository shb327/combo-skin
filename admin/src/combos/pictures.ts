/** Which picture stands for a type (spec 010, Finish images). */
import type { CatalogType, Kind } from './queries'

/** Gloves have no Vanilla: each type shows one fixed finish of its own. */
const GLOVE_PICTURES: Record<string, string> = {
  sport: 'pandoras-box',
  specialist: 'crimson-kimono',
  driver: 'king-snake',
  'hand-wraps': 'cobalt-skulls',
  moto: 'spearmint',
  hydra: 'emerald',
  bloodhound: 'charred',
  'broken-fang': 'jade',
}

/** A knife type's Vanilla, a glove type's fixed finish, or else its first finish. */
export function typePicture(kind: Kind, type: CatalogType): string | null {
  const wanted = kind === 'knife' ? 'vanilla' : GLOVE_PICTURES[type.slug]
  const finish = type.finishes.find((f) => f.finishSlug === wanted) ?? type.finishes[0]
  return finish?.imageUrl ?? null
}
