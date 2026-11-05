import { describe, expect, it } from 'vitest'
import { httpError } from '../api/errors'
import { REFUSED, REFUSALS, batchPlace, formField, problemMessage } from './problems'

function refusal(detail: unknown) {
  return httpError(new Response(null, { status: 422 }), { detail })
}

describe('httpError', () => {
  it('keeps only the path and code of each 422 entry', () => {
    const markup = '<b>x</b>'
    const failure = refusal([
      { loc: ['body', 'create', 1, 'knife', 'float_from'], msg: markup, type: 'float_outside_finish', input: markup, ctx: { x: markup } },
      { loc: 'not a list', type: 'value_error' },
      { msg: markup },
    ])
    expect(failure.code).toBeNull()
    expect(failure.problems).toEqual([{ loc: ['body', 'create', 1, 'knife', 'float_from'], type: 'float_outside_finish' }])
    expect(JSON.stringify(failure)).not.toContain(markup)
    expect(failure.message).not.toContain(markup)
  })

  it('has no problems for other bodies', () => {
    expect(refusal('combo_exists').problems).toEqual([])
    expect(httpError(new Response(null, { status: 500 }), null).problems).toEqual([])
  })
})

describe('batchPlace', () => {
  it('finds the row and the field', () => {
    const [problem] = refusal([{ loc: ['body', 'create', 1, 'knife', 'float_from'], type: 'float_outside_finish' }]).problems
    expect(batchPlace(problem)).toEqual({ list: 'create', index: 1, field: 'knife.float_from' })
    expect(problemMessage(problem.type)).toBe("Outside this finish's range.")
    expect(batchPlace({ loc: ['body', 'update', 0, 'rating'], type: 'decimal_max_places' })).toEqual({
      list: 'update',
      index: 0,
      field: 'rating',
    })
    expect(batchPlace({ loc: ['body', 'create', 2], type: 'duplicate_knife_type' })).toEqual({
      list: 'create',
      index: 2,
      field: null,
    })
  })

  it('leaves paths outside the rows to the summary', () => {
    expect(batchPlace({ loc: ['body', 'create'], type: 'too_long' })).toBeNull()
    expect(batchPlace({ loc: ['body'], type: 'value_error' })).toBeNull()
    expect(batchPlace({ loc: ['query', 'glove_type'], type: 'missing' })).toBeNull()
  })
})

describe('formField', () => {
  it.each([
    [['body', 'rating'], 'rating'],
    [['body', 'description'], 'description'],
    [['body', 'knife', 'float_from'], 'knife.float_from'],
    [['body', 'glove', 'seeds', 3], 'glove.seeds'],
    [['body', 'knife', 'finish_slug'], 'knife.finish'],
    [['body', 'version'], null],
    [['body'], null],
  ])('maps %j to %s', (loc, field) => {
    expect(formField({ loc, type: 'value_error' })).toBe(field)
  })
})

describe('problemMessage', () => {
  it('has a fixed message for each known code, and one for the rest', () => {
    for (const [type, message] of Object.entries(REFUSALS)) expect(problemMessage(type)).toBe(message)
    expect(problemMessage('something_new')).toBe(REFUSED)
    expect(problemMessage('toString')).toBe(REFUSED)
  })
})

describe('agent refusals', () => {
  it('belong to the screenshot agent field, with fixed messages', () => {
    expect(formField({ loc: ['body', 'screenshot_agent'], type: 'agent_retired' })).toBe('agent')
    expect(batchPlace({ loc: ['body', 'create', 1, 'screenshot_agent'], type: 'agent_not_found' })).toEqual({
      list: 'create',
      index: 1,
      field: 'agent',
    })
    expect(problemMessage('agent_retired')).toBe('This agent is no longer in the game.')
    expect(problemMessage('agent_not_found')).toBe('This agent is not in the catalog.')
  })
})
