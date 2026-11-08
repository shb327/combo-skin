import { describe, expect, it } from 'vitest'
import { IMAGE_ORIGIN } from './images'
import { SCREENSHOT_ORIGIN, screenshotUrl } from './screenshots'

describe('screenshotUrl', () => {
  it('accepts screenshots on VITE_IMAGE_ORIGIN only', () => {
    expect(SCREENSHOT_ORIGIN).toBe('http://localhost:9000')
    const url = 'http://localhost:9000/local-images/combos/a/v/1280.webp'
    expect(screenshotUrl(url)).toBe(url)
    for (const other of [
      'https://localhost:9000/local-images/combos/a/v/1280.webp',
      'http://localhost:9001/combos/a/v/1280.webp',
      'http://localhost:9000.example.com/combos/a/v/1280.webp',
      'http://localhost:9000',
      'javascript:alert(1)',
      `${IMAGE_ORIGIN}/economy/image/x`,
      '',
      null,
    ]) {
      expect(screenshotUrl(other)).toBeNull()
    }
  })
})
