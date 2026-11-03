// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { contentSecurityPolicy } from '../vite.config'

describe('the Content Security Policy', () => {
  it('is the policy of spec 008, unchanged by the combo screens', () => {
    expect(contentSecurityPolicy('http://localhost:8000')).toBe(
      "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; " +
        "connect-src 'self' http://localhost:8000; base-uri 'none'; form-action 'none'; object-src 'none'",
    )
  })
})
