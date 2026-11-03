import type { Kind } from './queries'

export const BASE: Record<Kind, string> = { glove: '/gloves', knife: '/knives' }
export const DIRECTION: Record<Kind, string> = { glove: 'By gloves', knife: 'By knife' }

export const finishPath = (kind: Kind, type: string, finish: string) => `${BASE[kind]}/${type}/${finish}`
