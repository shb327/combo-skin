import { describe, expect, it } from 'vitest'
import { ORIGIN, fakeApi, json } from '@/test/fakeApi'
import { ApiError, createApi } from './client'

describe('createApi', () => {
  it('reads a finish with GET, no credentials and no redirects', async () => {
    const fake = fakeApi()
    fake.reply(json([]))
    const api = createApi({ baseUrl: ORIGIN, fetch: fake.fetch })
    expect(await api.finishCombos('knives', 'karambit', 'doppler-ruby')).toEqual([])
    expect(fake.requests).toEqual([
      {
        url: `${ORIGIN}/knives/karambit/doppler-ruby/combos`,
        method: 'GET',
        credentials: 'omit',
        redirect: 'error',
      },
    ])
  })

  it('encodes slugs, so a request stays on the API origin', async () => {
    const fake = fakeApi()
    fake.reply(json([]))
    await createApi({ baseUrl: ORIGIN, fetch: fake.fetch }).finishCombos('gloves', 'a/b', '..')
    expect(new URL(fake.requests[0].url).origin).toBe(ORIGIN)
    expect(fake.requests[0].url).not.toContain('/a/b/')
  })

  it('names why a request failed', async () => {
    const fake = fakeApi()
    const api = createApi({ baseUrl: ORIGIN, fetch: fake.fetch })
    fake.reply(json({ detail: 'Not Found' }, 404), json({}, 503), 'network-error')
    for (const reason of ['not_found', 'http', 'network']) {
      await expect(api.finishCombos('gloves', 'specialist', 'mogul')).rejects.toEqual(
        new ApiError(reason as ApiError['reason']),
      )
    }
  })

  it('reads the combo counts with GET, no credentials and no redirects', async () => {
    const fake = fakeApi()
    const counts = { gloves: { specialist: { mogul: 2 } }, knives: { karambit: { fade: 1 } } }
    fake.reply(json(counts))
    const api = createApi({ baseUrl: ORIGIN, fetch: fake.fetch })
    expect(await api.comboCounts()).toEqual(counts)
    expect(fake.requests).toEqual([
      { url: `${ORIGIN}/combo-counts`, method: 'GET', credentials: 'omit', redirect: 'error' },
    ])
  })

  it('keeps and ignores keys it does not know in the counts', async () => {
    const fake = fakeApi()
    fake.reply(json({ gloves: {}, knives: {}, later: { anything: true } }))
    const counts = await createApi({ baseUrl: ORIGIN, fetch: fake.fetch }).comboCounts()
    expect(counts).toEqual({ gloves: {}, knives: {}, later: { anything: true } })
  })

  it.each([
    ['a 404', json({ detail: 'Not Found' }, 404), 'not_found'],
    ['a 503', json({}, 503), 'http'],
    ['no response', 'network-error' as const, 'network'],
    ['a list', json([]), 'http'],
    ['no knives', json({ gloves: {} }), 'http'],
    ['a type that is not an object', json({ gloves: { specialist: 2 }, knives: {} }), 'http'],
    ['a count of 0', json({ gloves: { specialist: { mogul: 0 } }, knives: {} }), 'http'],
    ['a negative count', json({ gloves: {}, knives: { karambit: { fade: -1 } } }), 'http'],
    ['a fractional count', json({ gloves: { specialist: { mogul: 1.5 } }, knives: {} }), 'http'],
    ['a count as text', json({ gloves: { specialist: { mogul: '2' } }, knives: {} }), 'http'],
  ])('refuses counts after %s', async (_, reply, reason) => {
    const fake = fakeApi()
    fake.reply(reply)
    await expect(createApi({ baseUrl: ORIGIN, fetch: fake.fetch }).comboCounts()).rejects.toEqual(
      new ApiError(reason as ApiError['reason']),
    )
  })
})
