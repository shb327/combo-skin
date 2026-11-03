import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ADMIN = join(import.meta.dirname, '..')
const POLICY =
  "default-src &#39;none&#39;; script-src &#39;self&#39;; style-src &#39;self&#39;; font-src &#39;self&#39;; " +
  "img-src &#39;self&#39;; connect-src &#39;self&#39; http://localhost:8000; base-uri &#39;none&#39;; " +
  "form-action &#39;none&#39;; object-src &#39;none&#39;"

function sample({ policy = POLICY, robots = true, head = '', css = '', js = '' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'dist-'))
  cpSync(join(ADMIN, 'public'), dir, { recursive: true })
  writeFileSync(
    join(dir, 'index.html'),
    `<!doctype html><html><head>
<meta http-equiv="Content-Security-Policy" content="${policy}">
${robots ? '<meta name="robots" content="noindex, nofollow" />' : ''}
<script type="module" crossorigin src="/assets/index.js"></script>
<link rel="stylesheet" crossorigin href="/assets/index.css">${head}
</head><body><div id="root"></div></body></html>`,
  )
  cpSync(join(ADMIN, 'src', 'logo.svg'), join(dir, 'logo.svg'))
  writeFileSync(join(dir, 'index.css'), `body{background:url(/assets/x.svg)}${css}`)
  writeFileSync(join(dir, 'index.js'), `fetch("http://localhost:8000/admin/me");${js}`)
  return dir
}

function check(dir: string) {
  return spawnSync(process.execPath, ['scripts/check-bundle.mjs', '--dir', dir], {
    cwd: ADMIN,
    encoding: 'utf8',
    env: { ...process.env, VITE_API_BASE_URL: '' },
  })
}

describe('check:bundle', () => {
  it('passes a clean build', () => {
    const result = check(sample())
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
  })

  it.each([
    ['an external font link', { head: '<link rel="stylesheet" href="https://fonts.example.com/m.css">' }, 'fonts.example.com'],
    ['a protocol-relative script', { head: '<script src="//cdn.example.com/x.js"></script>' }, 'cdn.example.com'],
    ['an external image', { head: '<img src="https://img.example.com/a.png">' }, 'img.example.com'],
    ['a CSS url() on another host', { css: '@font-face{src:url(https://fonts.example.com/m.woff2)}' }, 'fonts.example.com'],
    ['an unknown absolute URL', { js: 'new Image().src="https://tracker.example.com/p"' }, 'tracker.example.com'],
    ['another localhost port', { js: 'x="http://localhost:9999/x"' }, 'localhost:9999'],
    ['a missing robots tag', { robots: false }, 'robots'],
    ['a CSP with unsafe-inline', { policy: POLICY.replace("script-src &#39;self&#39;", "script-src &#39;self&#39; &#39;unsafe-inline&#39;") }, 'unsafe-inline'],
    ['a CSP with another connect-src', { policy: POLICY.replace('http://localhost:8000', 'https://api.example.com') }, 'Content-Security-Policy'],
  ])('fails for %s', (_, options, words) => {
    const result = check(sample(options))
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(words)
  })

})
