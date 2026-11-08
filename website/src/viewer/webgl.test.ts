import { afterEach, describe, expect, it, vi } from 'vitest'
import { forgetWebGL2, hasWebGL2, needsDataWarning } from './webgl'
import { stubDataSaver, stubMatchMedia, stubWebGL2 } from '@/test/viewer'

afterEach(() => {
  forgetWebGL2()
})

describe('hasWebGL2', () => {
  it('is false without a webgl2 context, as in jsdom', () => {
    expect(hasWebGL2()).toBe(false)
  })

  it('is true with one, and releases the context it made', () => {
    const { loseContext } = stubWebGL2()
    expect(hasWebGL2()).toBe(true)
    expect(loseContext).toHaveBeenCalledTimes(1)
  })

  it('checks once per page load', () => {
    const { getContext } = stubWebGL2()
    hasWebGL2()
    hasWebGL2()
    expect(getContext).toHaveBeenCalledTimes(1)
    expect(getContext).toHaveBeenCalledWith('webgl2')
  })

  it('is false when asking throws', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(hasWebGL2()).toBe(false)
  })
})

describe('needsDataWarning', () => {
  it('is false on a wide screen with a mouse', () => {
    stubMatchMedia(false)
    expect(needsDataWarning()).toBe(false)
  })

  it('is true on a narrow or touch screen', () => {
    const matchMedia = stubMatchMedia(true)
    expect(needsDataWarning()).toBe(true)
    expect(matchMedia).toHaveBeenCalledWith('(max-width: 767px), (pointer: coarse)')
  })

  it('is true when the browser asks to save data', () => {
    stubMatchMedia(false)
    stubDataSaver(true)
    expect(needsDataWarning()).toBe(true)
  })
})
