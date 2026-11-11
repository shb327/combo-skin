import { describe, expect, it } from 'vitest'
import { IMAGE_ORIGIN } from './images'
import { catalogPictureUrl } from './pictures'
import { SCREENSHOT_ORIGIN } from './screenshots'

describe('catalogPictureUrl', () => {
  it('keeps a picture on our image host or on the game’s', () => {
    expect(SCREENSHOT_ORIGIN).toBe('http://localhost:9000')
    const ours = `${SCREENSHOT_ORIGIN}/local-images/catalog/0123456789abcdef0123456789abcdef.png`
    expect(catalogPictureUrl(ours)).toBe(ours)
    expect(catalogPictureUrl(`${IMAGE_ORIGIN}/economy/image/abc`)).toBe(`${IMAGE_ORIGIN}/economy/image/abc`)
  })

  it.each([
    'https://example.com/a.png',
    'http://community.akamai.steamstatic.com/a.png',
    'https://community.akamai.steamstatic.com.example.com/a.png',
    'https://user@community.akamai.steamstatic.com/a.png',
    'https://community.akamai.steamstatic.com:8443/a.png',
    'http://localhost:9001/local-images/catalog/a.png',
    'http://localhost:9000.example.com/a.png',
    'http://user@localhost:9000/a.png',
    '//community.akamai.steamstatic.com/a.png',
    '/economy/image/abc',
    'data:image/png;base64,AAAA',
    'javascript:alert(1)',
    '',
    null,
  ])('refuses %s', (url) => {
    expect(catalogPictureUrl(url)).toBeNull()
  })
})
