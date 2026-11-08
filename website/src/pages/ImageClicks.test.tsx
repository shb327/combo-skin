import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { gloveTypes } from '@/data/gloves'
import { knifeTypes } from '@/data/knives'
import { KARAMBIT_RUBY, MOGUL, combo, fakeApi, item, screenshotOf } from '@/test/fakeApi'
import { renderSite } from '@/test/render'

/** A press on `target` whose pointer moves 1 px before it is released, as a trackpad press
 * often does, then the click the browser fires after it. */
function pressWithSmallMove(target: Element) {
  const at = { clientX: 50, clientY: 50, pageX: 50, pageY: 50 }
  const pointer = { pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1 }
  fireEvent.pointerDown(target, { ...pointer, ...at })
  fireEvent.pointerMove(target, { ...pointer, clientX: 51, clientY: 50, pageX: 51, pageY: 50 })
  fireEvent.pointerUp(target, { ...pointer, buttons: 0, clientX: 51, clientY: 50, pageX: 51, pageY: 50 })
  fireEvent.click(target, { button: 0, clientX: 51, clientY: 50 })
}

/** Every image inside a link or a button on the page. */
const clickableImages = () =>
  Array.from(document.querySelectorAll('a img, button img')) as HTMLImageElement[]

/** Lets Swiper finish setting up after the first render. */
const settle = () => act(() => new Promise((done) => setTimeout(done, 0)))

describe('images inside links', () => {
  it.each([
    ['Search by gloves', '/gloves'],
    ['Search by knives', '/knives'],
  ])('Home: a press that moves 1 px on "%s" navigates', async (label, path) => {
    const site = renderSite('/')
    await settle()
    const link = screen.getByText(label).closest('a')!
    const image = link.querySelector('img')!
    pressWithSmallMove(image)
    await waitFor(() => expect(site.url()).toBe(path))
  })

  it.each([
    ['/gloves', gloveTypes.map((type) => `/gloves/${type.id}`)],
    ['/knives', knifeTypes.map((type) => `/knives/${type.id}`)],
  ])('%s: a press that moves 1 px on any card navigates', async (page, paths) => {
    const site = renderSite(page)
    await settle()
    for (const path of paths) {
      const link = document.querySelector(`a[href="${path}"]`)!
      pressWithSmallMove(link.querySelector('img')!)
      await waitFor(() => expect(site.url()).toBe(path))
      site.navigate(page)
      await waitFor(() => expect(site.url()).toBe(page))
      await settle()
    }
  })
})

describe('images in links and buttons', () => {
  const comboPath = '/gloves/specialist/mogul/combos'
  const api = () => {
    const fake = fakeApi()
    fake.combos(comboPath, [
      combo('a', 9.5, MOGUL, KARAMBIT_RUBY, null, screenshotOf('a')),
      combo('b', 9, MOGUL, item({ type_slug: 'bayonet', finish_slug: 'fade' })),
    ])
    return fake
  }

  it.each(['/', '/gloves', '/knives', '/gloves/specialist', '/knives/karambit', comboPath])(
    '%s: none can be dragged',
    async (path) => {
      renderSite(path, { api: api() })
      await settle()
      if (path === comboPath) await screen.findAllByRole('article')
      const images = clickableImages()
      if (path !== comboPath) expect(images.length).toBeGreaterThan(0)
      for (const image of images) expect(image).toHaveAttribute('draggable', 'false')
    },
  )
})
