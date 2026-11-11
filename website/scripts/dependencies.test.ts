import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Vitest runs from the website's folder.
const ROOT = process.cwd()
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  name: string
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  scripts: Record<string, string>
}

/** Packages used without an import in the code: by name in a script, by a tool, or for types. */
const USED_WITHOUT_IMPORT: Record<string, string> = {
  eslint: 'npm run lint',
  typescript: 'npm run build (tsc)',
  vite: 'npm run dev and build',
  vitest: 'npm test',
  jsdom: 'the test environment in vite.config.ts',
  tailwindcss: '@import "tailwindcss" in src/index.css',
  '@testing-library/dom': 'a peer of @testing-library/react',
  '@types/node': 'types for vite.config.ts and the scripts',
  '@types/react': 'types for react',
  '@types/react-dom': 'types for react-dom',
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : [path]
  })
}

const SOURCES = [
  ...files(join(ROOT, 'src')),
  ...files(join(ROOT, 'scripts')),
  join(ROOT, 'vite.config.ts'),
  join(ROOT, 'eslint.config.js'),
]
  .filter((path) => /\.(tsx?|mjs|js|css)$/.test(path))
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n')

function imported(name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  return new RegExp(`(from |import |import\\()['"]${escaped}(/[^'"]*)?['"]`).test(SOURCES)
}

describe('dependencies', () => {
  it('reads the website’s manifest', () => expect(manifest.name).toBe('combo-skin-website'))

  const names = [...Object.keys(manifest.dependencies), ...Object.keys(manifest.devDependencies)]

  it.each(names)('%s is used', (name) => {
    expect(imported(name) || name in USED_WITHOUT_IMPORT, `${name} is not used`).toBe(true)
  })

  it('lists no package used only by its own import in this test', () => {
    expect(Object.keys(USED_WITHOUT_IMPORT).filter((name) => !names.includes(name))).toEqual([])
  })
})
