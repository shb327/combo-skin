import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { unstubBrowser } from './viewer'
import { forgetWebGL2 } from '@/viewer/webgl'

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
