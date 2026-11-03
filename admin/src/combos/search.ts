/** Finding finishes by words: each typed word must start a word of the label, in any order,
 * ignoring letter case and accents. */

export const MAX_RESULTS = 50

function words(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

export function matches(query: string, label: string): boolean {
  const wanted = words(query)
  if (!wanted.length) return false
  const have = words(label)
  return wanted.every((word) => have.some((candidate) => candidate.startsWith(word)))
}

export function search<T extends { label: string }>(entries: T[], query: string, limit = MAX_RESULTS) {
  const found = entries.filter((entry) => matches(query, entry.label))
  return { results: found.slice(0, limit), more: found.length > limit }
}
