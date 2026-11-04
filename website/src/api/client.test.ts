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
})
