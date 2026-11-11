import { describe, expect, it } from 'vitest'
import { GAME_IMAGE_ORIGIN, IMAGE_BASE_URL, IMAGE_ORIGIN, copyUrl, pictureUrl, screenshotUrl } from './images'

const KEY = 'catalog/0123456789abcdef0123456789abcdef.png'

describe('pictureUrl', () => {
  it('keeps a picture on our bucket or on the game’s host', () => {
    expect(pictureUrl(`${GAME_IMAGE_ORIGIN}/economy/image/abc`)).toBe(`${GAME_IMAGE_ORIGIN}/economy/image/abc`)
    expect(pictureUrl(`${IMAGE_BASE_URL}/${KEY}`)).toBe(`${IMAGE_BASE_URL}/${KEY}`)
  })

  it.each([
    'https://example.com/a.png',
    'http://community.akamai.steamstatic.com/a.png',
    'https://community.akamai.steamstatic.com.example.com/a.png',
    'https://user@community.akamai.steamstatic.com/a.png',
    'https://community.akamai.steamstatic.com:8443/a.png',
    'http://localhost:9001/local-images/catalog/a.png',
    '/economy/image/abc',
    'javascript:alert(1)',
    '',
    null,
  ])('refuses %s', (url) => {
    expect(pictureUrl(url)).toBeNull()
  })
})

describe('copyUrl', () => {
  it('builds our copy’s URL from its key', () => {
    expect(IMAGE_BASE_URL).toBe('http://localhost:9000/local-images')
    expect(copyUrl(KEY)).toBe(`http://localhost:9000/local-images/${KEY}`)
  })

  it.each(['catalog/x.png', '../combos/a.png', `/${KEY}`, `${KEY}?x`, 'https://example.com/a.png', '', null])(
    'refuses %s',
    (key) => {
      expect(copyUrl(key)).toBeNull()
    },
  )
})

describe('screenshotUrl', () => {
  it('accepts screenshots on our image host only', () => {
    expect(IMAGE_ORIGIN).toBe('http://localhost:9000')
    const url = 'http://localhost:9000/local-images/combos/a/v/640.webp'
    expect(screenshotUrl(url)).toBe(url)
    for (const other of [
      'https://localhost:9000/local-images/combos/a/v/640.webp',
      'http://localhost:9001/combos/a/v/640.webp',
      'http://localhost:9000.example.com/combos/a/v/640.webp',
      'http://localhost:9000',
      'javascript:alert(1)',
      `${GAME_IMAGE_ORIGIN}/economy/image/x`,
      '',
      null,
    ]) {
      expect(screenshotUrl(other)).toBeNull()
    }
  })
})
