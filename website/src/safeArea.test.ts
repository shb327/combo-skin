import { describe, expect, it } from 'vitest'
import html from '../index.html?raw'

describe('safe areas', () => {
  it('lets the page reach under the browser bars and the notch', () => {
    const viewport = html.match(/<meta name="viewport" content="([^"]+)"/)?.[1]
    expect(viewport?.split(/,\s*/)).toEqual(['width=device-width', 'initial-scale=1.0', 'viewport-fit=cover'])
  })
})
