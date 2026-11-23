import { vi } from 'vitest'

/** dnd-kit measures elements; jsdom has no layout, so each item of a list gets a box by its
 * place. An item is the outermost `li` around an element, so lists inside an item (a batch
 * row's special patterns or errors) do not count. Restore with `vi.restoreAllMocks()`. */
export function layOutListItems() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    let item = this.closest('li')
    while (item?.parentElement?.closest('li')) item = item.parentElement.closest('li')
    const index = item?.parentElement ? Array.from(item.parentElement.children).indexOf(item) : 0
    const top = item ? 1000 + index * 100 : 0
    const height = item ? 90 : 0
    return { x: 0, y: top, top, left: 0, right: 600, bottom: top + height, width: 600, height, toJSON: () => ({}) }
  })
}
