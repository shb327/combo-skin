import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { licencesPlugin, licencesText, packageDir } from './licences'

const MODULES = join(import.meta.dirname, '..', 'node_modules')
const version = (name: string) =>
  (JSON.parse(readFileSync(join(MODULES, name, 'package.json'), 'utf8')) as { version: string }).version

describe('packageDir', () => {
  it('finds the package a bundled module comes from', () => {
    expect(packageDir('/site/node_modules/react/cjs/react.production.js')).toBe('/site/node_modules/react')
    expect(packageDir('/site/node_modules/@tanstack/react-query/build/modern/index.js?v=1')).toBe(
      '/site/node_modules/@tanstack/react-query',
    )
    expect(packageDir('/site/node_modules/a/node_modules/b/index.js')).toBe('/site/node_modules/a/node_modules/b')
  })

  it('leaves out the app and virtual modules', () => {
    expect(packageDir('/site/src/main.tsx')).toBeNull()
    expect(packageDir('\0vite/preload-helper.js')).toBeNull()
    expect(packageDir('/site/node_modules/../src/main.tsx')).toBeNull()
  })
})

describe('licencesText', () => {
  const text = licencesText([
    join(MODULES, 'swiper/swiper.mjs'),
    join(MODULES, 'react/index.js'),
    join(MODULES, 'react/cjs/react.production.js'),
    join(MODULES, '@tanstack/react-query/build/modern/index.js'),
    '/site/src/main.tsx',
  ])

  it('names each package once, sorted, with its version and licence', () => {
    const names = [...text.matchAll(/^(\S+)@\d\S*$/gm)].map((match) => match[1])
    expect(names).toEqual(['@tanstack/react-query', 'react', 'swiper'])
    expect(text).toContain(`react@${version('react')}\nLicence: MIT`)
  })

  it("includes each package's own licence text", () => {
    expect(text).toContain('Copyright (c) Meta Platforms, Inc. and affiliates.')
    expect(text).toContain(readFileSync(join(MODULES, 'swiper/LICENSE'), 'utf8').trim())
  })
})

describe('the plugin', () => {
  it('writes licences.txt naming every package with a module in the bundle', () => {
    const emitted: { fileName: string; source: string }[] = []
    const modules = [join(MODULES, 'react/index.js'), join(MODULES, 'swiper/swiper.mjs')]
    const plugin = licencesPlugin()
    const generate = plugin.generateBundle as (this: unknown, options: unknown, bundle: unknown) => void
    generate.call(
      { emitFile: (file: { fileName: string; source: string }) => emitted.push(file) },
      {},
      {
        'index.js': { type: 'chunk', modules: Object.fromEntries(modules.map((id) => [id, {}])) },
        'logo.svg': { type: 'asset' },
      },
    )
    expect(emitted.map((file) => file.fileName)).toEqual(['licences.txt'])
    expect(emitted[0].source).toContain(`react@${version('react')}`)
    expect(emitted[0].source).toContain(`swiper@${version('swiper')}`)
  })
})
