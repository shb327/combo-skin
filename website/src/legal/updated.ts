import history from './updated.json'

/** One published version of a document: the day it took effect and the SHA-256 of its text
 * (`plainText`). The last entry is the current version and gives the "Last updated" date. */
export interface Version {
  date: string
  sha256: string
}

export type DocumentName = keyof typeof history

export const VERSIONS: Record<DocumentName, Version[]> = history

export function latest(name: DocumentName): Version {
  const versions = VERSIONS[name]
  return versions[versions.length - 1]
}
