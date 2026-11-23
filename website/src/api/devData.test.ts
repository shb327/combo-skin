import { describe, expect, it } from 'vitest'
import { apiPathFor, dataProxy } from './devData'

describe('apiPathFor', () => {
  it.each([
    ['/data/combo-counts.json', '/combo-counts'],
    ['/data/gloves/specialist/mogul.json', '/gloves/specialist/mogul/combos'],
    ['/data/knives/karambit/doppler-ruby.json', '/knives/karambit/doppler-ruby/combos'],
    ['/data/knives/karambit/doppler-ruby.json?x=1', '/knives/karambit/doppler-ruby/combos'],
  ])('maps %s to the API’s %s', (path, route) => {
    expect(apiPathFor(path)).toBe(route)
  })

  it.each([
    '/data/',
    '/data/gloves/specialist.json',
    '/data/agents/x/y.json',
    '/data/gloves/specialist/mogul',
    '/data/gloves/../admin/x.json',
    '/data/gloves/Specialist/mogul.json',
    '/data/gloves/a/b/c.json',
    '/admin/me',
  ])('maps %s to nothing', (path) => {
    expect(apiPathFor(path)).toBeNull()
  })
})

function response() {
  const sent = { status: 0, headers: {} as Record<string, string>, body: '' as string | Uint8Array }
  return {
    sent,
    set statusCode(code: number) {
      sent.status = code
    },
    setHeader(name: string, value: string) {
      sent.headers[name.toLowerCase()] = value
    },
    end(body?: string | Uint8Array) {
      sent.body = body ?? ''
    },
  }
}

describe('dataProxy', () => {
  it('answers a data path from the API, passing its status and type through', async () => {
    const asked: string[] = []
    const proxy = dataProxy('http://localhost:8000', async (url) => {
      asked.push(String(url))
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    const res = response()
    let passed = false
    await proxy({ url: '/data/gloves/specialist/mogul.json', method: 'GET' }, res, () => (passed = true))
    expect(asked).toEqual(['http://localhost:8000/gloves/specialist/mogul/combos'])
    expect(res.sent.status).toBe(200)
    expect(res.sent.headers['content-type']).toBe('application/json')
    expect(new TextDecoder().decode(res.sent.body as Uint8Array)).toBe('[]')
    expect(passed).toBe(false)
  })

  it('passes a 404 through', async () => {
    const proxy = dataProxy('http://localhost:8000', async () =>
      new Response('{"detail":"Not Found"}', { status: 404, headers: { 'Content-Type': 'application/json' } }),
    )
    const res = response()
    await proxy({ url: '/data/knives/karambit/nope.json', method: 'GET' }, res, () => {})
    expect(res.sent.status).toBe(404)
  })

  it('answers 404 for a data path with no route, without asking the API', async () => {
    let asked = false
    const proxy = dataProxy('http://localhost:8000', async () => {
      asked = true
      return new Response('')
    })
    const res = response()
    await proxy({ url: '/data/other.json', method: 'GET' }, res, () => {})
    expect(res.sent.status).toBe(404)
    expect(asked).toBe(false)
  })

  it('answers 502 when the API is down', async () => {
    const proxy = dataProxy('http://localhost:8000', async () => {
      throw new TypeError('fetch failed')
    })
    const res = response()
    await proxy({ url: '/data/combo-counts.json', method: 'GET' }, res, () => {})
    expect(res.sent.status).toBe(502)
  })

  it('leaves every other path to Vite', async () => {
    const proxy = dataProxy('http://localhost:8000', async () => new Response(''))
    let passed = false
    await proxy({ url: '/gloves/specialist', method: 'GET' }, response(), () => (passed = true))
    expect(passed).toBe(true)
  })
})
