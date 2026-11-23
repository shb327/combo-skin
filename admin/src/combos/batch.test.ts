import { describe, expect, it } from 'vitest'
import { ComboStore, PATTERN_GROUPS } from '../test/fakeCatalog'
import { EMPTY_BATCH, applyGroup, batchRows, type BatchText } from './batch'
import { batchChoices } from './patterns'
import type { Candidates } from './queries'
import { NO_CONDITIONS, type ConditionsText } from './values'

/** Karambit, Butterfly Knife and M9 Bayonet in Case Hardened. Gold Gem has no Butterfly seed,
 * Test Pattern only a Karambit one. */
function caseHardened(store = new ComboStore()) {
  const query = new URLSearchParams({ glove_type: 'specialist', glove_finish: 'crimson-kimono', knife_finish: 'case-hardened' })
  return (store.candidates(query)[1] as Candidates).candidates
}

const [gold, blue, test] = batchChoices(PATTERN_GROUPS, 'case-hardened').map((c) => c.pick)
const withGroup = (group: ConditionsText['group']): ConditionsText => ({ ...NO_CONDITIONS, group })

/** Applies a change of the batch-wide knife values the way the page does. */
function pick(text: BatchText, group: ConditionsText['group'], candidates = caseHardened()) {
  return applyGroup(batchRows(candidates, text), text, withGroup(group))
}

const ticks = (text: BatchText, candidates = caseHardened()) =>
  Object.fromEntries(batchRows(candidates, text).map((r) => [r.slug, r.text.ticked]))

describe('applyGroup', () => {
  it('unticks the knives a picked group does not cover, and marks them', () => {
    const { text, announcement } = pick(EMPTY_BATCH, gold)
    expect(text.knife.group).toEqual(gold)
    expect(ticks(text)).toEqual({ karambit: true, butterfly: false, 'm9-bayonet': true })
    expect(text.rows.butterfly.untickedFor).toBe('gold-gem')
    expect(text.rows.karambit?.untickedFor).toBeUndefined()
    expect(announcement).toBe('Unticked 1 knife with no Gold Gem: Butterfly Knife.')

    const two = pick(EMPTY_BATCH, test)
    expect(ticks(two.text)).toEqual({ karambit: true, butterfly: false, 'm9-bayonet': false })
    expect(two.announcement).toBe('Unticked 2 knives with no Test Pattern: Butterfly Knife, M9 Bayonet.')
  })

  it('ticks again on removal only the knives it unticked', () => {
    const start: BatchText = { ...EMPTY_BATCH, rows: { 'm9-bayonet': { ticked: false, byHand: false, rating: '' } } }
    const picked = pick(start, test).text
    expect(picked.rows['m9-bayonet'].untickedFor).toBeUndefined()
    const { text, announcement } = pick(picked, null)
    expect(ticks(text)).toEqual({ karambit: true, butterfly: true, 'm9-bayonet': false })
    expect(Object.values(text.rows).some((r) => r.untickedFor !== undefined)).toBe(false)
    expect(announcement).toBe('Ticked again: Butterfly Knife.')
  })

  it('decides again on a new pick, a hand tick under the old group included', () => {
    const picked = pick(EMPTY_BATCH, gold).text
    const handTicked: BatchText = { ...picked, rows: { ...picked.rows, butterfly: { ...picked.rows.butterfly, ticked: true, untickedFor: undefined } } }
    const removed = pick(handTicked, null)
    expect(removed.announcement).toBeNull()
    const again = pick(removed.text, gold)
    expect(ticks(again.text)).toEqual({ karambit: true, butterfly: false, 'm9-bayonet': true })
    expect(again.text.rows.butterfly.untickedFor).toBe('gold-gem')
  })

  it('changes from one group to another in one step as removal, then a pick', () => {
    const fromTest = pick(EMPTY_BATCH, test).text
    const { text, announcement } = pick(fromTest, gold)
    expect(ticks(text)).toEqual({ karambit: true, butterfly: false, 'm9-bayonet': true })
    expect(text.rows.butterfly.untickedFor).toBe('gold-gem')
    expect(text.rows['m9-bayonet'].untickedFor).toBeUndefined()
    expect(announcement).toBe('Ticked again: M9 Bayonet.')

    expect(ticks(pick(fromTest, blue).text)).toEqual({ karambit: true, butterfly: true, 'm9-bayonet': true })
  })

  it('leaves combos that exist and knives with own knife values alone', () => {
    const store = new ComboStore()
    store.add({ glove: 'specialist/crimson-kimono', knife: 'm9-bayonet/case-hardened', rating: 9 })
    const candidates = caseHardened(store)
    const start: BatchText = {
      ...EMPTY_BATCH,
      rows: {
        'm9-bayonet': { ticked: true, byHand: false, rating: '' },
        butterfly: { ticked: true, byHand: false, rating: '', knife: { ...NO_CONDITIONS, seeds: '1' } },
      },
    }
    const { text, announcement } = pick(start, test, candidates)
    expect(ticks(text, candidates)).toEqual({ karambit: true, butterfly: true, 'm9-bayonet': true })
    expect(announcement).toBeNull()
  })

  it('changes no tick while the group stays the same', () => {
    const picked = pick(EMPTY_BATCH, gold).text
    const handTicked: BatchText = { ...picked, rows: { ...picked.rows, butterfly: { ...picked.rows.butterfly, ticked: true, untickedFor: undefined } } }
    const typed = { ...handTicked.knife, from: '0.1' }
    const { text, announcement } = applyGroup(batchRows(caseHardened(), handTicked), handTicked, typed)
    expect(text.knife).toEqual(typed)
    expect(text.rows).toBe(handTicked.rows)
    expect(announcement).toBeNull()
  })
})
