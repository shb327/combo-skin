import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FakeApi, json } from '../test/fakeApi'
import { picture } from '../test/fakeCatalog'
import { renderApp } from '../test/render'

const imagesIn = (element: HTMLElement) => [...element.querySelectorAll('img')]
const sources = (element: HTMLElement) => imagesIn(element).map((img) => img.getAttribute('src'))

function expectPicture(img: HTMLImageElement | undefined, src: string) {
  expect(img).toBeDefined()
  expect(img?.getAttribute('src')).toBe(src)
  expect(img?.getAttribute('referrerpolicy')).toBe('no-referrer')
  expect(img?.getAttribute('loading')).toBe('lazy')
}

function withCombo() {
  const fake = new FakeApi().withSession()
  const combo = fake.store.add({ glove: 'specialist/crimson-kimono', knife: 'karambit/doppler-ruby', rating: 9 })
  return { fake, combo }
}

describe('pictures', () => {
  it('show each knife type its Vanilla, and each glove type its fixed finish', async () => {
    renderApp('/knives', new FakeApi().withSession())
    await screen.findByRole('combobox', { name: 'Find a knife' })
    const knives = within(screen.getByRole('list', { name: 'Knife types' })).getAllByRole('listitem')
    expect(knives.map((k) => sources(k))).toEqual([
      [picture('butterfly', 'vanilla')],
      [picture('karambit', 'vanilla')],
      [picture('m9-bayonet', 'vanilla')],
    ])
    expectPicture(imagesIn(knives[0])[0], picture('butterfly', 'vanilla'))
  })

  it('show Specialist Gloves as Crimson Kimono and Sport Gloves as Pandora\'s Box', async () => {
    renderApp('/gloves', new FakeApi().withSession())
    await screen.findByRole('combobox', { name: 'Find gloves' })
    const gloves = within(screen.getByRole('list', { name: 'Glove types' })).getAllByRole('listitem')
    expect(gloves.map((g) => sources(g))).toEqual([
      [picture('specialist', 'crimson-kimono')],
      [picture('sport', 'pandoras-box')],
    ])
  })

  it('show a glove type without a fixed finish as its first finish', async () => {
    const fake = new FakeApi().withSession()
    fake.next('GET /gloves', json(200, [{ slug: 'new-gloves', name: 'New Gloves', def_index: 9, codename: 'n', finish_count: 2 }]))
    const finish = (slug: string) => ({
      slug, name: slug, phase: null, display_name: slug, paint_index: 1, paint_codename: null,
      rarity: { code: 'c', name: 'Extraordinary', color: '#eb4b4b' }, float_min: 0.06, float_max: 0.8,
      image_url: picture('new-gloves', slug), active: true,
    })
    fake.next('GET /gloves/{type}', json(200, {
      slug: 'new-gloves', name: 'New Gloves', def_index: 9, codename: 'n', finish_count: 2, finishes: [finish('first'), finish('second')],
    }))
    renderApp('/gloves', fake)
    await screen.findByRole('combobox', { name: 'Find gloves' })
    expect(sources(screen.getByRole('list', { name: 'Glove types' }))).toEqual([picture('new-gloves', 'first')])
  })

  it('show each finish on a type page', async () => {
    renderApp('/knives/karambit', new FakeApi().withSession())
    await screen.findByRole('heading', { name: 'Karambit' })
    const cards = within(screen.getByRole('list', { name: 'Finishes' })).getAllByRole('listitem')
    expect(cards.map((c) => sources(c))).toEqual([
      [picture('karambit', 'vanilla')],
      [picture('karambit', 'doppler-ruby')],
      [picture('karambit', 'doppler-sapphire')],
      [picture('karambit', 'blue-steel')],
    ])
    expectPicture(imagesIn(cards[1])[0], picture('karambit', 'doppler-ruby'))
  })

  it('show in search options', async () => {
    const { user } = renderApp('/gloves', new FakeApi().withSession())
    await user.type(await screen.findByRole('combobox', { name: 'Find gloves' }), 'kimono')
    expectPicture(imagesIn(screen.getAllByRole('option')[0])[0], picture('specialist', 'crimson-kimono'))
  })

  it('show on the finish page and beside each combo of its list', async () => {
    const { fake } = withCombo()
    renderApp('/gloves/specialist/crimson-kimono', fake)
    const row = await screen.findByRole('listitem', { name: 'Karambit | Doppler (Ruby)' })
    const main = screen.getByRole('main')
    expectPicture(imagesIn(main).find((img) => img.getAttribute('src') === picture('specialist', 'crimson-kimono')), picture('specialist', 'crimson-kimono'))
    expectPicture(imagesIn(row)[0], picture('karambit', 'doppler-ruby'))
    expect(imagesIn(row)).toHaveLength(1)
  })

  it('show on each batch row, and both items on the edit page', async () => {
    const { fake, combo } = withCombo()
    renderApp('/gloves/specialist/crimson-kimono/batch/doppler-ruby', fake)
    const knives = within(await screen.findByRole('list', { name: 'Knives' })).getAllByRole('listitem')
    expect(knives.map((k) => sources(k))).toEqual([
      [picture('karambit', 'doppler-ruby')],
      [picture('butterfly', 'doppler-ruby')],
      [picture('m9-bayonet', 'doppler-ruby')],
    ])
    window.history.pushState(null, '', `/combos/${combo.id}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
    await screen.findByRole('heading', { name: 'Edit combo' })
    await waitFor(() => expect(sources(screen.getByRole('main'))).toEqual([
      picture('specialist', 'crimson-kimono'),
      picture('karambit', 'doppler-ruby'),
    ]))
    for (const img of imagesIn(screen.getByRole('main'))) expectPicture(img, img.getAttribute('src') as string)
  })

  it('never come from another host, and a failed one is removed', async () => {
    const fake = new FakeApi().withSession()
    fake.next('GET /knives', json(200, [{ slug: 'karambit', name: 'Karambit', def_index: 507, codename: 'k', finish_count: 3 }]))
    const finish = (slug: string, image_url: string) => ({
      slug, name: slug, phase: null, display_name: slug, paint_index: 1, paint_codename: null,
      rarity: { code: 'c', name: 'Covert', color: '#eb4b4b' }, float_min: 0, float_max: 1, image_url, active: true,
    })
    fake.next('GET /knives/{type}', json(200, {
      slug: 'karambit', name: 'Karambit', def_index: 507, codename: 'k', finish_count: 3,
      finishes: [
        finish('other-host', 'https://example.com/a.png'),
        finish('plain-http', 'http://community.akamai.steamstatic.com/a.png'),
        finish('relative', '/a.png'),
        finish('good', picture('karambit', 'good')),
      ],
    }))
    renderApp('/knives/karambit', fake)
    await screen.findByRole('heading', { name: 'Karambit' })
    const cards = within(screen.getByRole('list', { name: 'Finishes' })).getAllByRole('listitem')
    expect(cards.map((c) => imagesIn(c).length)).toEqual([0, 0, 0, 1])
    fireEvent.error(imagesIn(cards[3])[0])
    expect(imagesIn(cards[3])).toHaveLength(0)
  })
})
