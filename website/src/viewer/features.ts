/** What the viewer says it can do, read from its `cs3d:ready` (the embed contract's version 2).
 * A feature is used only when the viewer lists it; version 1, or a list that is missing or not
 * a list, means none. Map names are the only text from the viewer the page shows, so they are
 * checked before they are offered. */

export type Feature = 'attack' | 'map' | 'agents' | 'input' | 'keys' | 'first-frame'

const FEATURES: readonly Feature[] = ['attack', 'map', 'agents', 'input', 'keys', 'first-frame']

export interface MapChoice {
  id: string
  name: string
}

export interface Capabilities {
  version: number
  features: ReadonlySet<Feature>
  /** The maps a visitor may choose, in the viewer's order; null: no map menu. */
  maps: MapChoice[] | null
  defaultMap: string | null
  /** The definition indexes of the agents the viewer has built; null: no agent menu. */
  agents: ReadonlySet<number> | null
  defaultAgent: number
}

/** Lt. Commander Ricksaw | NSWC SEAL, the viewer's default agent. */
export const DEFAULT_AGENT = 5404

export const VERSION_1: Capabilities = {
  version: 1,
  features: new Set(),
  maps: null,
  defaultMap: null,
  agents: null,
  defaultAgent: DEFAULT_AGENT,
}

const MAP_ID = /^[a-z0-9_]{1,32}$/
/** A control character (C0, DEL or C1). */
const isControl = (char: string) => {
  const code = char.charCodeAt(0)
  return code < 0x20 || (code >= 0x7f && code <= 0x9f)
}
const MAX_MAPS = 32
const MAX_AGENTS = 512
/** The plain background the viewer keeps for its own tools: never a visitor's map. */
const STUDIO = 'studio'

const isIndex = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0

function readMaps(value: unknown): MapChoice[] | null {
  if (!Array.isArray(value) || value.length > MAX_MAPS) return null
  const maps: MapChoice[] = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) return null
    const { id, name } = entry as Record<string, unknown>
    if (typeof id !== 'string' || !MAP_ID.test(id)) return null
    if (typeof name !== 'string' || name.length < 1 || name.length > 40 || [...name].some(isControl)) return null
    if (id !== STUDIO) maps.push({ id, name })
  }
  return maps.length > 0 ? maps : null
}

function readAgents(value: unknown): ReadonlySet<number> | null {
  if (!Array.isArray(value) || value.length > MAX_AGENTS || !value.every(isIndex)) return null
  return new Set(value)
}

/** The viewer's capabilities from the fields of its `cs3d:ready`. */
export function readCapabilities(ready: Record<string, unknown>): Capabilities {
  const { version, features } = ready
  if (typeof version !== 'number' || version < 2 || !Array.isArray(features)) return VERSION_1
  const listed = new Set(FEATURES.filter((feature) => features.includes(feature)))
  const maps = listed.has('map') ? readMaps(ready.maps) : null
  const defaultMap = maps
    ? (maps.find((map) => map.id === ready.defaultMap) ?? maps[0]).id
    : null
  return {
    version,
    features: listed,
    maps,
    defaultMap,
    agents: listed.has('agents') ? readAgents(ready.agents) : null,
    defaultAgent: isIndex(ready.defaultAgent) ? ready.defaultAgent : DEFAULT_AGENT,
  }
}
