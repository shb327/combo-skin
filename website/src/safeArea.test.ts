import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8')

describe('safe areas', () => {
  it('lets the page reach under the browser bars and the notch', () => {
    const viewport = html.match(/<meta name="viewport" content="([^"]+)"/)?.[1]
    expect(viewport?.split(/,\s*/)).toEqual(['width=device-width', 'initial-scale=1.0', 'viewport-fit=cover'])
  })

  it('paints the body in the site’s background', () => {
    expect(css).toMatch(/body \{[^}]*background-color: var\(--color-background\);/)
  })
})
