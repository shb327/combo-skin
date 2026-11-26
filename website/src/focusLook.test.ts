/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Read from disk: the tests load no CSS.
const here = import.meta.url
const css = readFileSync(new URL('index.css', here), 'utf8')

const sources = import.meta.glob(['./**/*.tsx', '!./**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

describe('focus look', () => {
  it('uses no outline or ring utility anywhere but outline-none', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(10)
    const found = Object.entries(sources).flatMap(([file, text]) =>
      (text.match(/[\w:/[\]-]*(?:\boutline-(?!none\b)[\w/-]+|\bring(?:-[\w/-]+)?\b(?=[\s'"`]))/g) ?? []).map(
        (c) => `${file}: ${c}`,
      ),
    )
    expect(found).toEqual([])
  })

  it('turns off the browser’s own focus outline', () => {
    expect(css).toMatch(/:focus-visible\s*\{\s*outline:\s*none;?\s*\}/)
  })
})
