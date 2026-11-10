import { describe, expect, it } from 'vitest'
import type { ComboItem } from '@/api/client'
import { combo, item } from '@/test/fakeApi'
import { DEFAULT_CHOICE, viewerCombo, viewerLoad, viewerUrl } from './params'

const ORIGIN = 'https://viewer.example.com'

const makeCombo = ({ id = 'c1', glove, knife }: { id?: string; glove: ComboItem; knife: ComboItem }) =>
  combo(id, 9, glove, knife)

const crimson = (overrides = {}) =>
  item({
    type_slug: 'specialist',
    finish_slug: 'crimson-kimono',
    def_index: 5034,
    paint_index: 10033,
    float_min: 0.06,
    float_max: 0.8,
    ...overrides,
  })
const ruby = (overrides = {}) =>
  item({
    type_slug: 'karambit',
    finish_slug: 'doppler-ruby',
    def_index: 507,
    paint_index: 415,
    float_min: 0,
    float_max: 0.08,
    ...overrides,
  })
const vanilla = () =>
  item({
    type_slug: 'karambit',
    finish_slug: 'vanilla',
    def_index: 507,
    paint_index: 0,
    float_min: null,
    float_max: null,
  })

describe('viewerUrl', () => {
  it('sends both items by index with the float and seed the screenshot is drawn with', () => {
    const combo = makeCombo({
      glove: crimson(),
      knife: ruby({ float_from: 0, float_to: 0.01, seeds: [387, 512] }),
    })
    expect(viewerUrl(ORIGIN, combo)).toBe(
      `${ORIGIN}/combo?knife=507&knife_paint=415&knife_float=0&knife_seed=387` +
        '&gloves=5034&gloves_paint=10033&gloves_float=0.06&ui=0&input=game',
    )
  })

  it('adds a chosen agent and map after the input mode, and nothing for the defaults', () => {
    const combo = makeCombo({ glove: crimson(), knife: ruby({ float_from: 0, float_to: 0.01, seeds: [387] }) })
    const base = viewerUrl(ORIGIN, combo)
    expect(viewerUrl(ORIGIN, combo, DEFAULT_CHOICE)).toBe(base)
    expect(viewerUrl(ORIGIN, combo, { agent: 4613, map: 'de_vertigo' })).toBe(`${base}&agent=4613&map=de_vertigo`)
    expect(viewerUrl(ORIGIN, combo, { agent: 4613, map: null })).toBe(`${base}&agent=4613`)
    expect(viewerUrl(ORIGIN, combo, { agent: null, map: 'de_vertigo' })).toBe(`${base}&map=de_vertigo`)
  })

  it('takes the start of the range and the lowest seed, whatever their order', () => {
    const combo = makeCombo({
      glove: crimson({ float_from: 0.15, float_to: 0.3, seeds: [700, 269] }),
      knife: ruby(),
    })
    const params = new URL(viewerUrl(ORIGIN, combo)).searchParams
    expect(params.get('gloves_float')).toBe('0.15')
    expect(params.get('gloves_seed')).toBe('269')
  })

  it('sends the finish minimum and no seed for a combo without conditions', () => {
    const params = new URL(viewerUrl(ORIGIN, makeCombo({ glove: crimson(), knife: ruby() }))).searchParams
    expect(params.get('gloves_float')).toBe('0.06')
    expect(params.get('knife_float')).toBe('0')
    expect(params.has('gloves_seed')).toBe(false)
    expect(params.has('knife_seed')).toBe(false)
  })

  it('sends a vanilla knife with paint index 0 and no float or seed', () => {
    const params = new URL(viewerUrl(ORIGIN, makeCombo({ glove: crimson(), knife: vanilla() }))).searchParams
    expect(params.get('knife')).toBe('507')
    expect(params.get('knife_paint')).toBe('0')
    expect(params.has('knife_float')).toBe(false)
    expect(params.has('knife_seed')).toBe(false)
  })

  it('sends nothing else: no agent, view, debug, capture or combo id', () => {
    const combo = makeCombo({ id: 'k3v9x0m2q7ab', glove: crimson({ seeds: [1] }), knife: ruby({ seeds: [2] }) })
    const url = new URL(viewerUrl(ORIGIN, combo))
    expect(url.origin).toBe(ORIGIN)
    expect(url.pathname).toBe('/combo')
    expect([...url.searchParams.keys()]).toEqual([
      'knife',
      'knife_paint',
      'knife_float',
      'knife_seed',
      'gloves',
      'gloves_paint',
      'gloves_float',
      'gloves_seed',
      'ui',
      'input',
    ])
    expect(url.href).not.toContain('k3v9x0m2q7ab')
    const chosen = new URL(viewerUrl(ORIGIN, combo, { agent: 4613, map: 'de_vertigo' }))
    for (const name of ['view', 'debug', 'capture']) expect(chosen.searchParams.has(name)).toBe(false)
  })
})

describe('viewerCombo', () => {
  it('keeps floats in their shortest form', () => {
    const combo = makeCombo({ glove: crimson({ float_from: 0.1234 }), knife: ruby({ float_from: 0.0001 }) })
    expect(viewerCombo(combo)).toMatchObject({ gloves_float: '0.1234', knife_float: '0.0001' })
  })
})

describe('viewerLoad', () => {
  it('sends the same item fields as the address, with the agent and map only when chosen', () => {
    const combo = makeCombo({ glove: crimson(), knife: ruby({ seeds: [3] }) })
    expect(viewerLoad(combo, DEFAULT_CHOICE)).toEqual({ combo: viewerCombo(combo) })
    expect(viewerLoad(combo, { agent: 4613, map: 'de_vertigo' })).toEqual({
      combo: { ...viewerCombo(combo), agent: '4613' },
      map: 'de_vertigo',
    })
  })
})
