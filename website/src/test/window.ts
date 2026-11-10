/** Test helpers for the 3D window: two combos on a finish page, opening a card's window and
 * finding things in it. */
import { act, fireEvent, screen, within } from '@testing-library/react'
import { KARAMBIT_RUBY, MOGUL, combo, fakeApi, item, screenshotOf } from './fakeApi'
import { renderSite } from './render'

export const PATH = '/gloves/specialist/mogul/combos'
export const OTHER_PATH = '/gloves/specialist/crimson-kimono/combos'
export const A_ID = 'aaaaaaaaaaa1'
export const B_ID = 'bbbbbbbbbbb2'

const M9 = item({
  type_slug: 'm9-bayonet',
  type_name: 'M9 Bayonet',
  finish_slug: 'urban-masked',
  display_name: 'Urban Masked',
  def_index: 508,
  paint_index: 143,
})
export const RUBY = { ...KARAMBIT_RUBY, def_index: 507, paint_index: 415 }
export const GLOVES = { ...MOGUL, def_index: 5034, paint_index: 10064 }
export const A = combo(A_ID, 9.5, GLOVES, RUBY, null, screenshotOf(A_ID))
export const B = combo(B_ID, 8, GLOVES, M9, null, screenshotOf(B_ID))
export const A_NAME = 'Specialist Gloves | Mogul with Karambit | Doppler (Ruby)'

/** The finish page with combos A and B (or `combos`), once its cards show. */
export async function site({ combos = [A, B], path = PATH } = {}) {
  const api = fakeApi()
  api.combos(PATH, combos)
  const result = renderSite(path, { api })
  await screen.findAllByRole('article')
  return result
}

export const cards = () => screen.getAllByRole('article')
export const inCard = (index: 0 | 1) => within(cards()[index])

/** Clicks a card's "View in 3D" and waits for the window's code to load. */
export async function open(index: 0 | 1 = 0) {
  const button = inCard(index).getByRole('button', { name: 'View in 3D' })
  button.focus()
  await act(async () => {
    fireEvent.click(button)
  })
  return windowElement()
}

export const windowElement = () => screen.getByRole('dialog')
export const inWindow = () => within(windowElement())
/** The screenshot shown over the view in the window, if any. */
export const windowScreenshot = () => windowElement().querySelector('[data-screenshot] img[srcset]')
/** Text shown, not its copy in a screen reader announcement. */
export const VISIBLE = { ignore: '.sr-only, script, style' }

/** Waits for the window's code once, so later tests can run on fake timers. */
export async function loadWindowCode() {
  await import('@/viewer/ViewerWindow')
}
