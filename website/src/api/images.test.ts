import { describe, expect, it } from 'vitest'
import { IMAGE_ORIGIN, SCREENSHOT_ORIGIN, pictureUrl, screenshotUrl } from './images'

describe('pictureUrl', () => {
  it('keeps a picture on the image host', () => {
    expect(pictureUrl(`${IMAGE_ORIGIN}/economy/image/abc`)).toBe(`${IMAGE_ORIGIN}/economy/image/abc`)
  })

  it.each([
    'https://example.com/a.png',
    'http://community.akamai.steamstatic.com/a.png',
    'https://community.akamai.steamstatic.com.example.com/a.png',
    'https://user@community.akamai.steamstatic.com/a.png',
    'https://community.akamai.steamstatic.com:8443/a.png',
    '/economy/image/abc',
    'javascript:alert(1)',
    '',
    null,
  ])('refuses %s', (url) => {
    expect(pictureUrl(url)).toBeNull()
  })
})

describe('screenshotUrl', () => {
  it('accepts screenshots on VITE_IMAGE_ORIGIN only', () => {
    expect(SCREENSHOT_ORIGIN).toBe('http://localhost:9000')
    const url = 'http://localhost:9000/local-images/combos/a/v/640.webp'
    expect(screenshotUrl(url)).toBe(url)
    for (const other of [
      'https://localhost:9000/local-images/combos/a/v/640.webp',
      'http://localhost:9001/combos/a/v/640.webp',
      'http://localhost:9000.example.com/combos/a/v/640.webp',
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
