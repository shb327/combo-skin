import { describe, expect, it } from 'vitest'
import {
  CHECKS,
  checkConditions,
  checkDescription,
  conditionsSummary,
  formatRating,
  parseRating,
  parseSeeds,
  rangeMessage,
  stepRating,
} from './values'

const GLOVES = { min: 0.06, max: 0.8 }
const DOPPLER = { min: 0, max: 0.08 }
const VANILLA = { min: null, max: null }
const empty = { from: '', to: '', seeds: '' }

describe('parseRating', () => {
  it.each([
    ['8.88', 888, '8.88'],
    ['8,88', 888, '8.88'],
    [' 9.5 ', 950, '9.50'],
    ['10', 1000, '10.00'],
    ['0', 0, '0.00'],
  ])('reads %j as %d hundredths, shown as %s', (text, hundredths, shown) => {
    expect(parseRating(text)).toEqual({ ok: true, value: hundredths })
    expect(formatRating(hundredths)).toBe(shown)
  })

  it.each([
    ['', CHECKS.ratingMissing],
    ['abc', CHECKS.notANumber],
    ['1e1', CHECKS.notANumber],
    ['8.885', CHECKS.ratingDecimals],
    ['-0.01', CHECKS.ratingRange],
    ['10.01', CHECKS.ratingRange],
  ])('refuses %j', (text, message) => {
    expect(parseRating(text)).toEqual({ ok: false, error: message })
  })

  it('steps by 0.05 within 0 and 10', () => {
    expect(stepRating('8.88', 1)).toBe('8.93')
    expect(stepRating('8.88', -1)).toBe('8.83')
    expect(stepRating('9.98', 1)).toBe('10.00')
    expect(stepRating('0.03', -1)).toBe('0.00')
  })
})

describe('checkConditions', () => {
  it.each([
    ['0.06', '0.8'],
    ['0.1', '0.15'],
  ])('accepts %s to %s on gloves', (from, to) => {
    expect(checkConditions({ ...empty, from, to }, GLOVES).errors).toEqual({})
  })

  it.each([
    ['0.05', '0.5', 'from', rangeMessage(GLOVES)],
    ['0.1', '0.81', 'to', rangeMessage(GLOVES)],
    ['0.2', '0.1', 'to', CHECKS.fromBelowTo],
    ['0.2', '0.2', 'to', CHECKS.fromBelowTo],
    ['0.12345', '0.2', 'from', CHECKS.floatDecimals],
    ['0.1', '', 'to', CHECKS.bothOrNeither],
  ])('refuses %s to %s on gloves', (from, to, field, message) => {
    expect(checkConditions({ ...empty, from, to }, GLOVES).errors).toEqual({ [field]: message })
  })

  it('checks a knife range inclusively', () => {
    expect(checkConditions({ ...empty, from: '0', to: '0.08' }, DOPPLER).errors).toEqual({})
    expect(checkConditions({ ...empty, from: '0', to: '0.09' }, DOPPLER).errors).toEqual({
      to: rangeMessage(DOPPLER),
    })
    expect(rangeMessage(GLOVES)).toBe("Outside this finish's range, 0.06 to 0.80.")
  })

  it('takes nothing on Vanilla', () => {
    expect(checkConditions({ ...empty, from: '0.1', to: '0.2' }, VANILLA).errors).toEqual({
      from: CHECKS.vanilla,
      to: CHECKS.vanilla,
    })
    expect(checkConditions({ ...empty, seeds: '1' }, VANILLA).errors).toEqual({ seeds: CHECKS.vanilla })
    expect(checkConditions(empty, VANILLA)).toEqual({
      errors: {},
      value: { float_from: null, float_to: null, seeds: [] },
    })
  })

  it('returns the values to send', () => {
    expect(checkConditions({ from: '0', to: '0.01', seeds: '2 1' }, DOPPLER).value).toEqual({
      float_from: 0,
      float_to: 0.01,
      seeds: [1, 2],
    })
  })
})

describe('parseSeeds', () => {
  it('sorts and removes duplicates', () => {
    expect(parseSeeds('179, 387 2')).toEqual({ ok: true, value: [2, 179, 387], removed: 0 })
    expect(parseSeeds('5 5 6')).toEqual({ ok: true, value: [5, 6], removed: 1 })
    expect(parseSeeds('')).toEqual({ ok: true, value: [], removed: 0 })
  })

  it.each(['1001', '-1', '1.5', 'x'])('refuses %j', (text) => {
    expect(parseSeeds(text)).toEqual({ ok: false, error: CHECKS.seedValues })
  })

  it('refuses more than 100 seeds', () => {
    const many = Array.from({ length: 101 }, (_, i) => i).join(' ')
    expect(parseSeeds(many)).toEqual({ ok: false, error: CHECKS.seedCount })
  })
})

describe('checkDescription', () => {
  it('trims, and makes blank text none', () => {
    expect(checkDescription('  text  ')).toEqual({ ok: true, value: 'text' })
    expect(checkDescription('   ')).toEqual({ ok: true, value: null })
  })

  it('allows 1000 characters and line breaks', () => {
    expect(checkDescription('x'.repeat(1000)).ok).toBe(true)
    expect(checkDescription('x'.repeat(1001))).toEqual({ ok: false, error: CHECKS.descriptionLength })
    expect(checkDescription('a\nb')).toEqual({ ok: true, value: 'a\nb' })
    expect(checkDescription('a\tb')).toEqual({ ok: false, error: CHECKS.controlCharacters })
  })
})

describe('conditionsSummary', () => {
  it('shows a range and at most three seeds', () => {
    expect(
      conditionsSummary('Gloves', { float_from: 0.06, float_to: 0.15, seeds: [2, 179, 300, 301, 302, 303] }),
    ).toBe('Gloves 0.06–0.15 · seeds 2, 179, 300 (+3)')
    expect(conditionsSummary('Knife', { float_from: null, float_to: null, seeds: [] })).toBe('Knife any')
  })
})
