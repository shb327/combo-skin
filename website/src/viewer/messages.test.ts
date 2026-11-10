import { describe, expect, it } from 'vitest'
import { VERSION_1 } from './features'
import { failureFor, readEvent, unavailableText } from './messages'

describe('readEvent', () => {
  it('reads the viewer events the page uses', () => {
    expect(readEvent({ type: 'cs3d:ready', version: 1, release: 'r1', webgl2: true })).toEqual({
      type: 'cs3d:ready',
      id: null,
      webgl2: true,
      capabilities: VERSION_1,
    })
    expect(readEvent({ type: 'cs3d:progress', id: null, loaded: 3, total: 10 })).toEqual({
      type: 'cs3d:progress',
      id: null,
      loaded: 3,
      total: 10,
    })
    expect(readEvent({ type: 'cs3d:loaded', id: null, combo: {}, ms: 2950 })).toEqual({
      type: 'cs3d:loaded',
      id: null,
      ms: 2950,
      actions: null,
      map: null,
    })
    expect(
      readEvent({ type: 'cs3d:error', id: 'a', code: 'context-lost', message: 'x', retryable: true }),
    ).toEqual({ type: 'cs3d:error', id: 'a', code: 'context-lost', retryable: true, kept: false })
    expect(readEvent({ type: 'cs3d:recovering', id: null, reason: 'context-lost', attempt: 1 })).toEqual({
      type: 'cs3d:recovering',
      id: null,
    })
    expect(readEvent({ type: 'cs3d:state', id: 'a', status: 'loading' })).toEqual({
      type: 'cs3d:state',
      id: 'a',
    })
  })

  it('reads the version 2 fields', () => {
    const ready = readEvent({
      type: 'cs3d:ready',
      version: 2,
      webgl2: true,
      features: ['map'],
      maps: [{ id: 'de_vertigo', name: 'Vertigo' }],
      defaultMap: 'de_vertigo',
    })
    expect(ready).toMatchObject({ type: 'cs3d:ready', capabilities: { version: 2, defaultMap: 'de_vertigo' } })
    expect(
      readEvent({
        type: 'cs3d:loaded',
        id: 'l1',
        combo: { agent: 4613 },
        map: 'de_vertigo',
        actions: ['inspect', 'light', 'heavy', 'kick', 3],
        ms: 900,
      }),
    ).toEqual({ type: 'cs3d:loaded', id: 'l1', ms: 900, actions: ['inspect', 'light', 'heavy'], map: 'de_vertigo' })
    expect(readEvent({ type: 'cs3d:loaded', id: null, actions: 'inspect', map: 7 })).toMatchObject({
      actions: null,
      map: null,
    })
    expect(
      readEvent({ type: 'cs3d:error', id: 'l2', code: 'unknown-agent', retryable: false, kept: true }),
    ).toMatchObject({ kept: true })
    expect(readEvent({ type: 'cs3d:key', id: null, key: 'Escape' })).toEqual({ type: 'cs3d:key', id: null, key: 'Escape' })
  })

  it.each([
    ['a string', 'cs3d:ready'],
    ['null', null],
    ['no type', { id: null }],
    ['an unknown type', { type: 'cs3d:captured', id: null }],
    ['another prefix', { type: 'other:ready', webgl2: true }],
    ['a numeric id', { type: 'cs3d:loaded', id: 3, ms: 1 }],
    ['progress without numbers', { type: 'cs3d:progress', id: null, loaded: '3', total: 10 }],
    ['an error without a code', { type: 'cs3d:error', id: null, retryable: true }],
    ['an error without retryable', { type: 'cs3d:error', id: null, code: 'context-lost' }],
    ['ready without webgl2', { type: 'cs3d:ready' }],
    ['a key without a key', { type: 'cs3d:key', id: null }],
  ])('ignores %s', (_, data) => {
    expect(readEvent(data)).toBeNull()
  })
})

describe('failureFor', () => {
  it('gives each code its own short text', () => {
    expect(failureFor('no-webgl2', false)).toEqual({
      kind: 'no-webgl2',
      text: "3D isn't available in this browser.",
      retryable: false,
    })
    expect(failureFor('assets-unavailable', true)).toEqual({
      kind: 'other',
      text: 'The 3D view could not be loaded.',
      retryable: true,
    })
    expect(failureFor('context-lost', true)).toEqual({
      kind: 'other',
      text: 'Your graphics card stopped the 3D view.',
      retryable: true,
    })
    for (const code of [
      'bad-params',
      'unknown-knife',
      'unknown-gloves',
      'unknown-knife-finish',
      'unknown-gloves-finish',
    ]) {
      expect(failureFor(code, false)).toEqual({
        kind: 'cannot-draw',
        text: "This combo can't be shown in 3D.",
        retryable: false,
      })
    }
  })

  it('never says a combo cannot be drawn for an agent or a map', () => {
    for (const code of ['unknown-agent', 'unknown-map']) {
      expect(failureFor(code, false)).toEqual({
        kind: 'other',
        text: 'The 3D view could not be loaded.',
        retryable: false,
      })
    }
    expect(unavailableText('unknown-agent')).toBe("That agent isn't available.")
    expect(unavailableText('unknown-map')).toBe("That map isn't available.")
    expect(unavailableText('unknown-knife')).toBeNull()
  })

  it('treats an unknown code by its retryable flag', () => {
    expect(failureFor('something-new', true)).toEqual({
      kind: 'other',
      text: 'The 3D view could not be loaded.',
      retryable: true,
    })
    expect(failureFor('something-new', false).retryable).toBe(false)
  })

  it('makes a time limit retryable', () => {
    expect(failureFor('timeout', false)).toEqual({
      kind: 'other',
      text: 'The 3D view could not be loaded.',
      retryable: true,
    })
  })
})
