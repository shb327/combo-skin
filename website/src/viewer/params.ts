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

/** The viewer's address for a combo: `/combo` with the combo's parameters and `ui=0` (the page
 * shows its own progress and messages). No agent: the viewer draws its default for everyone. */
export function viewerUrl(origin: string, combo: PublicCombo): string {
  const params = new URLSearchParams()
  for (const [name, value] of Object.entries(viewerCombo(combo))) {
    if (value !== undefined) params.set(name, value)
  }
  params.set('ui', '0')
  return `${origin}/combo?${params}`
}
