import { describe, expect, it } from 'vitest'
import { IMAGE_ORIGIN, pictureUrl } from './images'

describe('pictureUrl', () => {
  it('keeps a picture on the image host', () => {
    expect(pictureUrl(`${IMAGE_ORIGIN}/economy/image/abc`)).toBe(`${IMAGE_ORIGIN}/economy/image/abc`)
  })

  it.each([
    'https://example.com/a.png',
    'http://community.akamai.steamstatic.com/a.png',
    'https://community.akamai.steamstatic.com.example.com/a.png',
    'https://user@community.akamai.steamstatic.com/a.png',
    '/economy/image/abc',
    'javascript:alert(1)',
    '',
    null,
  ])('refuses %s', (url) => {
    expect(pictureUrl(url)).toBeNull()
  })
})
