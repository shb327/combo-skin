import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

// Vitest runs from admin/, where eslint.config.js is.
const eslint = new ESLint()

async function rulesFor(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.map((m) => m.ruleId)
}

describe('guard rails', () => {
  it.each([
    ['fetch', "fetch('/x')", 'no-restricted-globals'],
    ['XMLHttpRequest', 'new XMLHttpRequest()', 'no-restricted-globals'],
    ['WebSocket', "new WebSocket('wss://x')", 'no-restricted-globals'],
    ['EventSource', "new EventSource('/x')", 'no-restricted-globals'],
    ['window.fetch', "window.fetch('/x')", 'no-restricted-properties'],
    ['sendBeacon', "navigator.sendBeacon('/x')", 'no-restricted-properties'],
    ['localStorage', "localStorage.setItem('a', 'b')", 'no-restricted-globals'],
    ['window.localStorage', "window.localStorage.setItem('a', 'b')", 'no-restricted-properties'],
    ['sessionStorage', "sessionStorage.setItem('a', 'b')", 'no-restricted-globals'],
    ['indexedDB', "indexedDB.open('a')", 'no-restricted-globals'],
    ['document.cookie', "document.cookie = 'a=b'", 'no-restricted-properties'],
    ['console.log', "console.log('a')", 'no-console'],
    ['dangerouslySetInnerHTML', 'export const A = () => <div dangerouslySetInnerHTML={{ __html: "x" }} />', 'no-restricted-syntax'],
  ])('refuses %s in a page', async (_, code, rule) => {
    expect(await rulesFor(code, 'src/pages/Sample.tsx')).toContain(rule)
  })

  it.each([
    ['window.navigator.sendBeacon', "window.navigator.sendBeacon('/x')"],
    ['window.document.cookie', "window.document.cookie = 'a=b'"],
    ['top.fetch', "top.fetch('/x')"],
    ['an aliased document', "const d = document\nd.title = 'x'"],
    ['an aliased console', "const c = console\nc.info('x')"],
    ['an aliased window', 'const w = window\nw.name = "x"'],
    ['a spread dangerouslySetInnerHTML', 'export const A = () => <div {...{ dangerouslySetInnerHTML: { __html: "x" } }} />'],
  ])('refuses %s', async (_, code) => {
    expect(await rulesFor(code, 'src/pages/Sample.tsx')).toContain('no-restricted-syntax')
  })

  it('applies to JavaScript files under src/ too', async () => {
    expect(await rulesFor("fetch('/x')", 'src/pages/sample.js')).toContain('no-restricted-globals')
    expect(await rulesFor("console.log('a')", 'src/pages/sample.jsx')).toContain('no-console')
  })

  it('allows fetch in the API client only', async () => {
    expect(await rulesFor("export const f = () => fetch('/x')", 'src/api/client.ts')).toEqual([])
    expect(await rulesFor("export const f = () => fetch('/x')", 'src/api/other.ts')).toContain(
      'no-restricted-globals',
    )
  })

  it('still refuses storage in the API client', async () => {
    expect(await rulesFor("localStorage.setItem('a', 'b')", 'src/api/client.ts')).toContain(
      'no-restricted-globals',
    )
  })
})
