/** After a new deployment, a page loaded from the older one may ask for a lazy chunk that is
 * gone (Vite's `vite:preloadError`). The page then reloads once, to get the new deployment. A
 * second failure in the same visit shows the error instead, so a broken chunk cannot loop. */

const KEY = 'combo-skin:reloaded-for-a-missing-chunk'

interface Options {
  target?: EventTarget
  storage?: () => Storage
  reload?: () => void
}

export function reloadOnStaleChunk({
  target = window,
  storage = () => window.sessionStorage,
  reload = () => window.location.reload(),
}: Options = {}): void {
  target.addEventListener('vite:preloadError', (event) => {
    try {
      const store = storage()
      if (store.getItem(KEY) !== null) return
      store.setItem(KEY, String(Date.now()))
    } catch {
      // No session storage: never reload, so it cannot loop.
      return
    }
    event.preventDefault()
    reload()
  })
}
