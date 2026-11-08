import { describe, expect, it } from 'vitest'
import {
  DEFAULT_API_ORIGIN,
  DEFAULT_IMAGE_ORIGIN,
  apiOrigin,
  checkApiOrigin,
  checkImageOrigin,
  imageOrigin,
} from './origin'

describe('checkApiOrigin', () => {
  it.each(['http://localhost:8000', 'https://api.example.com', 'http://localhost'])(
    'accepts %s',
    (value) => {
      expect(checkApiOrigin(value)).toBe(value)
    },
  )

  it.each([
    'api.example.com',
    'https://api.example.com/',
    'https://api.example.com/v1',
    'https://api.example.com?x=1',
    'https://api.example.com#x',
    'http://api.example.com',
    'https://admin@api.example.com',
    'ftp://api.example.com',
    'https://API.example.com',
    '*',
    '',
  ])('refuses %s, naming the variable', (value) => {
    expect(() => checkApiOrigin(value)).toThrow(/VITE_API_BASE_URL/)
  })

  it('defaults to the local API', () => {
    expect(apiOrigin(undefined)).toBe(DEFAULT_API_ORIGIN)
    expect(apiOrigin('')).toBe(DEFAULT_API_ORIGIN)
    expect(DEFAULT_API_ORIGIN).toBe('http://localhost:8000')
    expect(apiOrigin('https://api.example.com')).toBe('https://api.example.com')
  })
})

describe('checkImageOrigin', () => {
  it.each(['http://localhost:9000', 'https://images.example.com', 'http://localhost'])(
    'accepts %s',
    (value) => {
      expect(checkImageOrigin(value)).toBe(value)
    },
  )

  it.each([
    'images.example.com',
    'https://images.example.com/',
    'https://images.example.com/local-images',
    'https://images.example.com?x=1',
    'http://images.example.com',
    'https://user@images.example.com',
    'ftp://images.example.com',
    '*',
  ])('refuses %s, naming the variable', (value) => {
    expect(() => checkImageOrigin(value)).toThrow(/VITE_IMAGE_ORIGIN/)
    expect(() => checkImageOrigin(value)).not.toThrow(/VITE_API_BASE_URL/)
  })

  it('defaults to the local storage service', () => {
    expect(imageOrigin(undefined)).toBe(DEFAULT_IMAGE_ORIGIN)
    expect(imageOrigin('')).toBe(DEFAULT_IMAGE_ORIGIN)
    expect(DEFAULT_IMAGE_ORIGIN).toBe('http://localhost:9000')
    expect(imageOrigin('https://images.example.com')).toBe('https://images.example.com')
  })
})
