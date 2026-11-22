/** Pattern groups (spec 020): the groups an item or a batch can pick, and a batch-wide pick
 * resolved to each knife type's own example seed. */
import type { components } from '../api/schema'
import type { Kind } from './queries'
import { formatSeeds, parseSeeds, type ConditionsText, type GroupPick } from './values'

export type PatternGroup = components['schemas']['PatternGroupOut']

/** One entry of "Add special pattern": what it shows, what it picks, and the seed it gives. */
export interface GroupChoice {
  label: string
  pick: GroupPick
  /** The item type's example seed; none for a batch, where each knife has its own. */
  seed?: number
}

/** `Blue Gem · 387`, or the name alone while there are no valid seeds. */
export function groupLabel(name: string, seeds: string): string {
  const parsed = parseSeeds(seeds)
  return parsed.ok && parsed.value.length ? `${name} · ${formatSeeds(parsed.value)}` : name
}

/** The groups for one item: its kind and finish, with a seed for its type, in display order. */
export function itemChoices(groups: PatternGroup[] | undefined, kind: Kind, type: string, finish: string): GroupChoice[] {
  return (groups ?? []).flatMap((group) => {
    const seed = group.seeds[type]
    if (group.kind !== kind || group.finish_slug !== finish || seed === undefined) return []
    return [{ label: `${group.name} · ${seed}`, pick: { slug: group.slug, name: group.name }, seed }]
  })
}

/** The knife groups of a batch's knife finish, each holding every knife type's seed. */
export function batchChoices(groups: PatternGroup[] | undefined, finish: string): GroupChoice[] {
  return (groups ?? [])
    .filter((group) => group.kind === 'knife' && group.finish_slug === finish)
    .map((group) => ({ label: group.name, pick: { slug: group.slug, name: group.name, seeds: { ...group.seeds } } }))
}

/** Batch-wide knife values for one knife type: a batch-wide group gives the type its own seed
 * and the group, or, where the group does not cover the type, any pattern and no group. */
export function rowKnife(knife: ConditionsText, type: string): ConditionsText {
  const group = knife.group
  if (!group?.seeds) return knife
  const seed = group.seeds[type]
  return seed === undefined
    ? { ...knife, seeds: '', group: null }
    : { ...knife, seeds: String(seed), group: { slug: group.slug, name: group.name } }
}
