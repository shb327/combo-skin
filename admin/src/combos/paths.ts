import type { Kind } from './queries'

export const BASE: Record<Kind, string> = { glove: '/gloves', knife: '/knives' }
export const DIRECTION: Record<Kind, string> = { glove: 'By gloves', knife: 'By knife' }

export const finishPath = (kind: Kind, type: string, finish: string) => `${BASE[kind]}/${type}/${finish}`

export const typePath = (kind: Kind, type: string) => `${BASE[kind]}/${type}`

/** A search example for each kind. */
export const SEARCH_EXAMPLE: Record<Kind, string> = {
  glove: 'For example: crimson kimono',
  knife: 'For example: karambit ruby',
}
