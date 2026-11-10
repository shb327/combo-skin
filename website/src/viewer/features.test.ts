import { describe, expect, it } from 'vitest'
import { VERSION_1, readCapabilities } from './features'

const ALL = ['attack', 'map', 'agents', 'input', 'keys', 'first-frame']
const VERTIGO = { id: 'de_vertigo', name: 'Vertigo' }

const ready = (fields: Record<string, unknown> = {}) => ({
  type: 'cs3d:ready',
  version: 2,
  release: 'r2',
  webgl2: true,
  features: ALL,
  maps: [VERTIGO],
  defaultMap: 'de_vertigo',
  agents: [4613, 5404],
  defaultAgent: 5404,
  ...fields,
})

describe('readCapabilities', () => {
  it('reads a version 2 viewer', () => {
    const caps = readCapabilities(ready())
    expect(caps.version).toBe(2)
    expect([...caps.features].sort()).toEqual([...ALL].sort())
    expect(caps.maps).toEqual([VERTIGO])
    expect(caps.defaultMap).toBe('de_vertigo')
    expect([...caps.agents!]).toEqual([4613, 5404])
    expect(caps.defaultAgent).toBe(5404)
  })

  it.each([
    ['version 1', { version: 1, features: undefined }],
    ['no version', { version: undefined }],
    ['features not an array', { features: 'attack,map' }],
    ['features missing', { features: undefined }],
    ['a version that is not a number', { version: '2' }],
  ])('treats %s as version 1', (_, fields) => {
    expect(readCapabilities(ready(fields))).toEqual(VERSION_1)
  })

  it('uses a later version as its features say, and ignores unknown features', () => {
    const caps = readCapabilities(ready({ version: 3, features: ['attack', 'teleport', 7] }))
    expect([...caps.features]).toEqual(['attack'])
    expect(caps.maps).toBeNull()
    expect(caps.agents).toBeNull()
  })

  it('offers no map menu or agent list without their features', () => {
    const caps = readCapabilities(ready({ features: ['attack', 'input', 'keys', 'first-frame'] }))
    expect(caps.maps).toBeNull()
    expect(caps.agents).toBeNull()
  })

  it('never lists the studio', () => {
    const caps = readCapabilities(ready({ maps: [{ id: 'studio', name: 'Studio' }, VERTIGO] }))
    expect(caps.maps).toEqual([VERTIGO])
    expect(readCapabilities(ready({ maps: [{ id: 'studio', name: 'Studio' }] })).maps).toBeNull()
  })

  it('keeps the viewer’s order and a name with markup as plain text', () => {
    const maps = [VERTIGO, { id: 'de_mirage', name: '<b>x</b>' }]
    expect(readCapabilities(ready({ maps })).maps).toEqual(maps)
  })

  it.each([
    ['an id with a space and capitals', [VERTIGO, { id: 'Bad Id', name: 'Bad' }]],
    ['an id of 33 characters', [{ id: 'a'.repeat(33), name: 'Long' }]],
    ['a name of 41 characters', [{ id: 'de_long', name: 'x'.repeat(41) }]],
    ['an empty name', [{ id: 'de_empty', name: '' }]],
    ['a name with a control character', [{ id: 'de_ctrl', name: 'Ver\u0007tigo' }]],
    ['33 entries', Array.from({ length: 33 }, (_, i) => ({ id: `de_${i}`, name: `Map ${i}` }))],
    ['a string instead of a list', 'de_vertigo'],
    ['an entry that is not an object', [VERTIGO, 'de_mirage']],
  ])('hides the map menu for %s', (_, maps) => {
    expect(readCapabilities(ready({ maps })).maps).toBeNull()
  })

  it('takes the first map when the default is not one of them', () => {
    const maps = [VERTIGO, { id: 'de_mirage', name: 'Mirage' }]
    expect(readCapabilities(ready({ maps, defaultMap: 'de_nuke' })).defaultMap).toBe('de_vertigo')
  })

  it.each([
    ['a string', '4613,5404'],
    ['a non-integer', [4613, 1.5]],
    ['a negative index', [-1]],
    ['a string index', ['4613']],
  ])('drops an agent list with %s', (_, agents) => {
    expect(readCapabilities(ready({ agents })).agents).toBeNull()
  })

  it('drops an agent list longer than 512', () => {
    const agents = Array.from({ length: 513 }, (_, i) => i + 1)
    expect(readCapabilities(ready({ agents })).agents).toBeNull()
  })

  it('falls back to Ricksaw as the default agent', () => {
    expect(readCapabilities(ready({ defaultAgent: 'x' })).defaultAgent).toBe(5404)
  })
})
