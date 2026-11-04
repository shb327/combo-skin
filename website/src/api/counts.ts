import type { ComboCounts, Kind } from './client'

/** The published combos of one finish; 0 when the counts leave it out. */
export function finishCount(counts: ComboCounts, kind: Kind, type: string, finish: string): number {
  return counts[kind][type]?.[finish] ?? 0
}

/** The combos of a type's finishes, those the bundled catalog shows. */
export function typeCount(
  counts: ComboCounts,
  kind: Kind,
  type: string,
  finishes: readonly { id: string }[],
): number {
  return finishes.reduce((sum, finish) => sum + finishCount(counts, kind, type, finish.id), 0)
}

/** The counts with one finish's number replaced; a finish with none is left out. */
export function withFinishCount(
  counts: ComboCounts,
  kind: Kind,
  type: string,
  finish: string,
  count: number,
): ComboCounts {
  const finishes = { ...counts[kind][type] }
  delete finishes[finish]
  if (count > 0) finishes[finish] = count
  const types = { ...counts[kind] }
  delete types[type]
  if (Object.keys(finishes).length > 0) types[type] = finishes
  return { ...counts, [kind]: types }
}
