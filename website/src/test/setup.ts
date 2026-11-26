import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { unstubBrowser } from './viewer'
import { forgetWebGL2 } from '@/viewer/webgl'

// jsdom's dialog has no `showModal` or `close`: stand-ins that keep `open` and, as browsers do,
// give the focus back on closing to what had it on opening, and turn an Escape nothing else took
// into the top dialog's `cancel`, then close it unless the `cancel` was prevented.
if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
  const focusedBefore = new WeakMap<HTMLDialogElement, Element | null>()
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    focusedBefore.set(this, document.activeElement)
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.open) return
    this.removeAttribute('open')
    const before = focusedBefore.get(this)
    focusedBefore.delete(this)
    if (before instanceof HTMLElement && before.isConnected) before.focus()
    this.dispatchEvent(new Event('close'))
  }
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    const dialog = Array.from(document.querySelectorAll('dialog[open]')).pop() as HTMLDialogElement | undefined
    if (dialog && dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close()
  })
}

beforeEach(() => {
  // jsdom has no canvas: without this it logs "not implemented" for every WebGL2 check.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

afterEach(() => {
  cleanup()
  forgetWebGL2()
  unstubBrowser()
  vi.unstubAllGlobals()
})
