// Check the built app in dist/ (spec 008, Security S4 to S6): the robots and CSP meta tags are
// there, nothing is loaded from another host, and every absolute URL is the API or a known
// string that is never fetched. Exits 1 and lists every problem otherwise.
//
//   npm run check:bundle                 # checks dist/
//   node scripts/check-bundle.mjs --dir <folder>
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { loadEnv } from 'vite'

const ADMIN = resolve(import.meta.dirname, '..')
const DEFAULT_API_ORIGIN = 'http://localhost:8000'

// Absolute URLs that libraries carry as plain strings and never fetch. An entry ending in / allows
// everything under it; any other entry allows exactly that URL.
const NEVER_FETCHED = [
  'http://www.w3.org/', // SVG, XLink, MathML and XML namespaces (React, the logo)
  'https://react.dev/errors/', // React's production error links
  'https://reactrouter.com/', // react-router warning text
  'https://github.com/ungap/url-search-params', // react-router warning text
  'http://localhost', // react-router's base for parsing relative URLs
]

const { values } = parseArgs({ options: { dir: { type: 'string', default: join(ADMIN, 'dist') } } })
const dir = resolve(values.dir)
const env = loadEnv('production', ADMIN, 'VITE_')
const origin = process.env.VITE_API_BASE_URL || env.VITE_API_BASE_URL || DEFAULT_API_ORIGIN

const policy = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self'",
  `connect-src 'self' ${origin}`,
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ')

const problems = []
const decode = (text) => text.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
// JavaScript strings may escape slashes: https:\/\/host.
const unescapeSlashes = (text) => text.replace(/\\\//g, '/').replace(/\\u002f/gi, '/')
const external = (url) => /^(https?:)?\/\//i.test(url.trim())
const isAllowed = (url) => {
  const lower = url.toLowerCase()
  return (
    lower === origin ||
    lower.startsWith(`${origin}/`) ||
    NEVER_FETCHED.some((known) => lower === known || (known.endsWith('/') && lower.startsWith(known)))
  )
}

function files(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name)
    return entry.isDirectory() ? files(path) : [path]
  })
}

const html = readFileSync(join(dir, 'index.html'), 'utf8')

if (!/<meta name="robots" content="noindex, nofollow"\s*\/?>/.test(html)) {
  problems.push('index.html: no <meta name="robots" content="noindex, nofollow">')
}

const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/)
if (!csp) {
  problems.push('index.html: no Content-Security-Policy meta tag')
} else {
  const found = decode(csp[1])
  for (const unsafe of ["'unsafe-inline'", "'unsafe-eval'"]) {
    if (found.includes(unsafe)) problems.push(`index.html: the Content-Security-Policy allows ${unsafe}`)
  }
  if (found !== policy) {
    problems.push(`index.html: the Content-Security-Policy is not the expected one: ${policy}`)
  }
}


for (const file of files(dir)) {
  if (!/\.(html|js|css|svg|json|txt|map)$/.test(file)) continue
  const text = unescapeSlashes(readFileSync(file, 'utf8'))
  const name = relative(dir, file)
  if (file.endsWith('.html')) {
    const tags = /<(script|link|img|iframe|source|video|audio|embed)\b[^>]*?\b(?:src|href|srcset)\s*=\s*(["']?)([^"'\s>]*)\2/gi
    for (const [, tag, , url] of text.matchAll(tags)) {
      if (external(url)) problems.push(`${name}: <${tag}> loads ${url} from another host`)
    }
  }
  if (file.endsWith('.css')) {
    for (const [, url] of text.matchAll(/url\(\s*['"]?([^'")]+)/gi)) {
      if (external(url)) problems.push(`${name}: url() loads ${url} from another host`)
    }
  }
  for (const [match] of text.matchAll(/https?:\/\/[^\s"'`()<>\\,;]+/gi)) {
    const url = match.replace(/[.]+$/, '')
    if (!isAllowed(url)) problems.push(`${name}: unexpected absolute URL ${url}`)
  }
  // Protocol-relative URLs inside strings or CSS: "//host.tld/...".
  for (const [, url] of text.matchAll(/["'`(=\s](\/\/(?:[a-z0-9-]+\.)+[a-z]{2,}[^\s"'`()<>\\,;]*)/gi)) {
    problems.push(`${name}: protocol-relative URL ${url}`)
  }
}

if (problems.length) {
  for (const problem of problems) console.error(problem)
  process.exit(1)
}
console.log(`${relative(ADMIN, dir) || dir}: bundle checks passed`)
