import { describe, expect, it, vi } from 'vitest'
import { reloadOnStaleChunk } from './staleChunks'

function preloadError(target: EventTarget): Event {
  const event = new Event('vite:preloadError', { cancelable: true })
  target.dispatchEvent(event)
  return event
}

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  }
}

describe('reloadOnStaleChunk', () => {
  it('reloads the page once when a chunk of an older deployment is gone', () => {
    const target = new EventTarget()
    const reload = vi.fn()
    reloadOnStaleChunk({ target, storage: memoryStorage, reload })
    const event = preloadError(target)
    expect(reload).toHaveBeenCalledTimes(1)
    // Vite's own error is not thrown when the page reloads.
    expect(event.defaultPrevented).toBe(true)
  })

  it('shows the error instead of reloading again in the same visit', () => {
    const storage = memoryStorage()
    const reload = vi.fn()
    // Before the reload, and after it: the same visit's storage.
    const before = new EventTarget()
    reloadOnStaleChunk({ target: before, storage: () => storage, reload })
    preloadError(before)
    const after = new EventTarget()
    reloadOnStaleChunk({ target: after, storage: () => storage, reload })
    const second = preloadError(after)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(second.defaultPrevented).toBe(false)
  })

  it('never reloads when the browser keeps no session storage, so it cannot loop', () => {
    const target = new EventTarget()
    const reload = vi.fn()
    reloadOnStaleChunk({
      target,
      storage: () => {
        throw new DOMException('denied', 'SecurityError')
      },
      reload,
    })
    expect(preloadError(target).defaultPrevented).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('listens on the window by default', () => {
    const add = vi.spyOn(window, 'addEventListener')
    reloadOnStaleChunk()
    expect(add).toHaveBeenCalledWith('vite:preloadError', expect.any(Function))
  })
})
