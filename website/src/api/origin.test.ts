import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DEV_API_ORIGIN,
  DEFAULT_IMAGE_BASE_URL,
  DEFAULT_VIEWER_ORIGIN,
  checkDevApiOrigin,
  checkImageBaseUrl,
  checkViewerOrigin,
  devApiOrigin,
  imageBaseUrl,
  viewerOrigin,
} from './origin'

describe('checkDevApiOrigin', () => {
  it.each(['http://localhost:8000', 'https://api.example.com', 'http://localhost'])(
    'accepts %s',
    (value) => {
      expect(checkDevApiOrigin(value)).toBe(value)
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
    expect(() => checkDevApiOrigin(value)).toThrow(/DEV_API_BASE_URL/)
  })

  it('defaults to the local API', () => {
    expect(devApiOrigin(undefined)).toBe(DEFAULT_DEV_API_ORIGIN)
    expect(devApiOrigin('')).toBe(DEFAULT_DEV_API_ORIGIN)
    expect(DEFAULT_DEV_API_ORIGIN).toBe('http://localhost:8000')
    expect(devApiOrigin('https://api.example.com')).toBe('https://api.example.com')
  })
})

describe('checkImageBaseUrl', () => {
  it.each([
    ['http://localhost:9000/local-images', 'http://localhost:9000/local-images'],
    ['https://images.example.com', 'https://images.example.com'],
    ['https://images.example.com/', 'https://images.example.com'],
    ['https://example.com/pictures/', 'https://example.com/pictures'],
  ])('accepts %s', (value, base) => {
    expect(checkImageBaseUrl(value)).toBe(base)
  })

  it.each([
    'images.example.com',
    'https://images.example.com?x=1',
    'https://images.example.com/#x',
    'http://images.example.com',
    'http://127.0.0.1:9000',
    'https://user@images.example.com',
    'ftp://images.example.com',
    '*',
  ])('refuses %s, naming the variable', (value) => {
    expect(() => checkImageBaseUrl(value)).toThrow(/VITE_IMAGE_BASE_URL/)
    expect(() => checkImageBaseUrl(value)).not.toThrow(/DEV_API_BASE_URL/)
  })

  it('defaults to the local storage service’s public bucket', () => {
    expect(imageBaseUrl(undefined)).toBe(DEFAULT_IMAGE_BASE_URL)
    expect(imageBaseUrl('')).toBe(DEFAULT_IMAGE_BASE_URL)
    expect(DEFAULT_IMAGE_BASE_URL).toBe('http://localhost:9000/local-images')
    expect(imageBaseUrl('https://images.example.com')).toBe('https://images.example.com')
  })
})

describe('checkViewerOrigin', () => {
  it.each([
    'https://viewer.example.com',
    'http://localhost:5321',
    'http://127.0.0.1:5321',
    'http://localhost',
  ])('accepts %s', (value) => {
    expect(checkViewerOrigin(value)).toBe(value)
  })

  it.each([
    'viewer.example.com',
    'https://viewer.example.com/',
    'https://viewer.example.com/x',
    'https://viewer.example.com?x=1',
    'https://viewer.example.com#x',
    'http://viewer.example.com',
    'http://127.0.0.2:5321',
    'http://10.0.0.1:5321',
    'https://user@viewer.example.com',
    'ftp://viewer.example.com',
    '*',
  ])('refuses %s, naming the variable', (value) => {
    expect(() => checkViewerOrigin(value)).toThrow(/VITE_VIEWER_ORIGIN/)
  })

  it('defaults to the local viewer', () => {
    expect(viewerOrigin(undefined)).toBe(DEFAULT_VIEWER_ORIGIN)
    expect(viewerOrigin('')).toBe(DEFAULT_VIEWER_ORIGIN)
    expect(DEFAULT_VIEWER_ORIGIN).toBe('http://127.0.0.1:5321')
    expect(viewerOrigin('https://viewer.example.com')).toBe('https://viewer.example.com')
  })

  it('still allows plain http on 127.0.0.1 for the viewer only', () => {
    expect(() => checkDevApiOrigin('http://127.0.0.1:8000')).toThrow(/DEV_API_BASE_URL/)
  })
})
