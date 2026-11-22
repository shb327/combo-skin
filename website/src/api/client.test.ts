import { describe, expect, it } from 'vitest'
import { COUNTS_PATH, ORIGIN, fakeApi, json, pagesFallback } from '@/test/fakeApi'
import { ApiError, createApi } from './client'

describe('createApi', () => {
  it('reads a finish’s data file on the site’s own origin, with GET, no credentials and no redirects', async () => {
    const fake = fakeApi()
    fake.reply(json([]))
    const api = createApi({ baseUrl: ORIGIN, fetch: fake.fetch })
    expect(await api.finishCombos('knives', 'karambit', 'doppler-ruby')).toEqual([])
    expect(fake.requests).toEqual([
      {
        url: `${ORIGIN}/data/knives/karambit/doppler-ruby.json`,
        method: 'GET',
        credentials: 'omit',
        redirect: 'error',
      },
    ])
  })

  it.each([
    ['a/b', 'mogul'],
    ['..', '..'],
    ['specialist', '%2e%2e'],
    ['specialist', '//elsewhere.example'],
    ['Specialist', 'mogul'],
    ['', 'mogul'],
  ])('refuses the slugs %s and %s as not found, before fetch', async (type, finish) => {
    const fake = fakeApi()
    const api = createApi({ baseUrl: ORIGIN, fetch: fake.fetch })
    await expect(api.finishCombos('gloves', type, finish)).rejects.toEqual(new ApiError('not_found'))
    expect(fake.requests).toEqual([])
  })

  it.each(['https://combo.example/data', 'https://combo.example/', '/data', 'combo.example'])(
    'refuses %s as the site’s origin',
    (baseUrl) => {
      expect(() => createApi({ baseUrl, fetch: fakeApi().fetch })).toThrow(/origin/)
    },
  )

  it('names why a request failed', async () => {
    const fake = fakeApi()
    const api = createApi({ baseUrl: ORIGIN, fetch: fake.fetch })
    fake.reply(
      json({ detail: 'Not Found' }, 404),
      pagesFallback(),
      json({}, 503),
      json({ not: 'a list' }),
      'network-error',
    )
    for (const reason of ['not_found', 'not_found', 'http', 'http', 'network']) {
      await expect(api.finishCombos('gloves', 'specialist', 'mogul')).rejects.toEqual(
        new ApiError(reason as ApiError['reason']),
      )
    }
  })

  it('reads the combo counts from /data/combo-counts.json', async () => {
    const fake = fakeApi()
    const counts = { gloves: { specialist: { mogul: 2 } }, knives: { karambit: { fade: 1 } } }
    fake.reply(json(counts))
    const api = createApi({ baseUrl: ORIGIN, fetch: fake.fetch })
    expect(await api.comboCounts()).toEqual(counts)
    expect(COUNTS_PATH).toBe('/data/combo-counts.json')
    expect(fake.requests).toEqual([
      { url: `${ORIGIN}/data/combo-counts.json`, method: 'GET', credentials: 'omit', redirect: 'error' },
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
    ['the page Pages serves for a missing file', pagesFallback(), 'not_found'],
    ['a 503', json({}, 503), 'http'],
    ['no response', 'network-error' as const, 'network'],
    ['a list', json([]), 'http'],
    ['no knives', json({ gloves: {} }), 'http'],
    ['a type that is not an object', json({ gloves: { specialist: 2 }, knives: {} }), 'http'],
    ['a count of 0', json({ gloves: { specialist: { mogul: 0 } }, knives: {} }), 'http'],
    ['a negative count', json({ gloves: {}, knives: { karambit: { fade: -1 } } }), 'http'],
    ['a fractional count', json({ gloves: { specialist: { mogul: 1.5 } }, knives: {} }), 'http'],
    ['a count as text', json({ gloves: { specialist: { mogul: '2' } }, knives: {} }), 'http'],
    ['JSON that does not parse', new Response('{', { headers: { 'Content-Type': 'application/json' } }), 'http'],
  ])('refuses counts after %s', async (_, reply, reason) => {
    const fake = fakeApi()
    fake.reply(reply)
    await expect(createApi({ baseUrl: ORIGIN, fetch: fake.fetch }).comboCounts()).rejects.toEqual(
      new ApiError(reason as ApiError['reason']),
    )
  })
})
