// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { IMAGE_ORIGIN } from '../src/api/images'
import { contentSecurityPolicy } from '../vite.config'

describe('the Content Security Policy', () => {
  it('is the policy of spec 008, with the game image host added to img-src only', () => {
    expect(contentSecurityPolicy('http://localhost:8000')).toBe(
      "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; " +
        "img-src 'self' https://community.akamai.steamstatic.com; " +
        "connect-src 'self' http://localhost:8000; base-uri 'none'; form-action 'none'; object-src 'none'",
    )
  })

  it('names the same image host as the bundle check', () => {
    expect(IMAGE_ORIGIN).toBe('https://community.akamai.steamstatic.com')
    const script = readFileSync(join(import.meta.dirname, 'check-bundle.mjs'), 'utf8')
    expect(script).toContain(`const IMAGE_ORIGIN = '${IMAGE_ORIGIN}'`)
  })
})
