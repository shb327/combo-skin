/** `/licences.txt` in the build: every npm package with code in the bundle, with its version,
 * licence and the licence text from its own files, as MIT, ISC and similar licences ask for
 * copies (spec 023, R12). Only files inside `node_modules` are read. */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, normalize } from 'node:path'
import type { Plugin } from 'vite'

const MARKER = '/node_modules/'
const LICENCE_FILE = /^(licen[cs]e|copying)([.-].*)?$/i

/** The package directory a bundled module comes from, or null for the app's own code and
 * virtual modules. */
export function packageDir(id: string): string | null {
  if (id.startsWith('\0')) return null
  const path = normalize(id.split('?')[0])
  const at = path.lastIndexOf(MARKER)
  if (at < 0) return null
  const [first, second] = path.slice(at + MARKER.length).split('/')
  if (!first || (first.startsWith('@') && !second)) return null
  return path.slice(0, at + MARKER.length) + (first.startsWith('@') ? `${first}/${second}` : first)
}

interface Manifest {
  name: string
  version: string
  license?: string
  repository?: string | { url?: string }
}

interface Entry {
  name: string
  version: string
  licence: string
  text: string
}

function entry(dir: string): Entry | null {
  const manifestPath = join(dir, 'package.json')
  if (!existsSync(manifestPath)) return null
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest
  const file = readdirSync(dir).find((name) => LICENCE_FILE.test(name))
  const repository = typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url
  return {
    name: manifest.name,
    version: manifest.version,
    licence: manifest.license ?? 'unknown',
    text: file
      ? readFileSync(join(dir, file), 'utf8').trim()
      : `The package has no licence file.${repository ? ` Its repository: ${repository}` : ''}`,
  }
}

export function licencesText(moduleIds: Iterable<string>): string {
  const dirs = new Set<string>()
  for (const id of moduleIds) {
    const dir = packageDir(id)
    if (dir) dirs.add(dir)
  }
  const entries = new Map<string, Entry>()
  for (const dir of dirs) {
    const found = entry(dir)
    if (found) entries.set(`${found.name}@${found.version}`, found)
  }
  const sorted = [...entries.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
  const blocks = sorted.map((e) => `${'='.repeat(72)}\n${e.name}@${e.version}\nLicence: ${e.licence}\n\n${e.text}`)
  return `Open-source software in the code of combo.skin\n\n${blocks.join('\n\n')}\n`
}

export function licencesPlugin(): Plugin {
  return {
    name: 'combo-skin-licences',
    apply: 'build',
    generateBundle(_options, bundle) {
      const ids = Object.values(bundle).flatMap((output) =>
        output.type === 'chunk' ? Object.keys(output.modules) : [],
      )
      this.emitFile({ type: 'asset', fileName: 'licences.txt', source: licencesText(ids) })
    },
  }
}
