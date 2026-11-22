import { describe, expect, it } from 'vitest'
import { refuseRemovedSettings } from './removedSettings'

describe('refuseRemovedSettings', () => {
  it('stops on VITE_API_BASE_URL with a note to use DEV_API_BASE_URL', () => {
    expect(() => refuseRemovedSettings({ VITE_API_BASE_URL: 'http://localhost:8000' })).toThrow(
      /VITE_API_BASE_URL was replaced by DEV_API_BASE_URL/,
    )
  })

  it('stops on VITE_IMAGE_ORIGIN with a note to use VITE_IMAGE_BASE_URL', () => {
    expect(() => refuseRemovedSettings({ VITE_IMAGE_ORIGIN: 'http://localhost:9000' })).toThrow(
      /VITE_IMAGE_BASE_URL/,
    )
  })

  it('accepts the current settings, and empty old ones', () => {
    expect(() =>
      refuseRemovedSettings({ DEV_API_BASE_URL: 'http://localhost:8000', VITE_API_BASE_URL: '' }),
    ).not.toThrow()
  })
})
