/** What "View in 3D" sends to the viewer: both items by the game's indexes, with the float and
 * seed the combo's screenshot is drawn with (spec 015), so the 3D view matches the card. */
import type { ComboItem, PublicCombo } from '@/api/client'

/** The viewer's `/combo` parameters, as strings; a parameter without a value is left out. */
export interface ViewerCombo {
  knife: string
  knife_paint: string
  knife_float?: string
  knife_seed?: string
  gloves: string
  gloves_paint: string
  gloves_float?: string
  gloves_seed?: string
}

/** The float an item is drawn with: the start of the combo's range, else the finish's lowest
 * float; null for Vanilla, which has no float. */
function drawnFloat(item: ComboItem): number | null {
  return item.float_from ?? item.float_min
}

/** The seed an item is drawn with: the combo's lowest seed, else none. Without one the viewer
 * draws its default, as it does for the screenshot. */
function drawnSeed(item: ComboItem): number | null {
  return item.seeds.length > 0 ? Math.min(...item.seeds) : null
}

/** `String(number)` is the shortest form that reads back as the same number. */
const text = (value: number | null) => (value === null ? undefined : String(value))

/** An item's index, paint index, float and seed; a vanilla knife is paint 0 with neither. */
function drawn(item: ComboItem) {
  const vanilla = item.float_min === null
  return {
    index: String(item.def_index),
    paint: String(vanilla ? 0 : item.paint_index),
    float: vanilla ? undefined : text(drawnFloat(item)),
    seed: vanilla ? undefined : text(drawnSeed(item)),
  }
}

export function viewerCombo(combo: PublicCombo): ViewerCombo {
  const knife = drawn(combo.knife)
  const gloves = drawn(combo.glove)
  return {
    knife: knife.index,
    knife_paint: knife.paint,
    knife_float: knife.float,
    knife_seed: knife.seed,
    gloves: gloves.index,
    gloves_paint: gloves.paint,
    gloves_float: gloves.float,
    gloves_seed: gloves.seed,
  }
}

/** The visitor's map and agent; null is the viewer's default (Vertigo, Lt. Commander Ricksaw |
 * NSWC SEAL), which is never sent, so the default address is the same for every visitor. */
export interface Choice {
  map: string | null
  agent: number | null
}

export const DEFAULT_CHOICE: Choice = { map: null, agent: null }

/** The viewer's address for a combo: `/combo` with the combo's parameters, `ui=0` (the page
 * shows its own progress and messages) and `input=game` (the game's mouse buttons and keys, no
 * free camera; an older viewer ignores it), then the chosen agent and map, if any. */
export function viewerUrl(origin: string, combo: PublicCombo, choice: Choice = DEFAULT_CHOICE): string {
  const params = new URLSearchParams()
  for (const [name, value] of Object.entries(viewerCombo(combo))) {
    if (value !== undefined) params.set(name, value)
  }
  params.set('ui', '0')
  params.set('input', 'game')
  if (choice.agent !== null) params.set('agent', String(choice.agent))
  if (choice.map !== null) params.set('map', choice.map)
  return `${origin}/combo?${params}`
}

/** The fields of `cs3d:load` for the same combo with another map or agent. Left out, the viewer
 * draws its default map and agent. */
export function viewerLoad(combo: PublicCombo, choice: Choice): { combo: Record<string, string>; map?: string } {
  const fields: Record<string, string> = {}
  for (const [name, value] of Object.entries(viewerCombo(combo))) {
    if (value !== undefined) fields[name] = value
  }
  if (choice.agent !== null) fields.agent = String(choice.agent)
  return choice.map === null ? { combo: fields } : { combo: fields, map: choice.map }
}
