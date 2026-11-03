/** A small catalog and combo store for the fake API: enough of spec 009's rules (pairings,
 * versions, statuses, all or nothing) for the combo screens. Names and images are placeholders. */
import type { components } from '../api/schema'

type Schemas = components['schemas']
export type AdminCombo = Schemas['AdminCombo']
export type Item = Schemas['Item']
export type Kind = 'glove' | 'knife'
type Status = AdminCombo['status']
type Conditions = Schemas['Conditions']

interface FakeFinish {
  slug: string
  name: string
  phase: string | null
  float_min: number | null
  float_max: number | null
  active: boolean
}

interface FakeType {
  slug: string
  name: string
  finishes: FakeFinish[]
}

const finish = (slug: string, name: string, range: [number, number] | null, more: Partial<FakeFinish> = {}) => ({
  slug,
  name,
  phase: null,
  float_min: range ? range[0] : null,
  float_max: range ? range[1] : null,
  active: true,
  ...more,
})
const vanilla = () => finish('vanilla', 'Vanilla', null)
const ruby = () => finish('doppler-ruby', 'Doppler', [0, 0.08], { phase: 'Ruby' })

export const CATALOG: Record<Kind, FakeType[]> = {
  glove: [
    {
      slug: 'specialist',
      name: 'Specialist Gloves',
      finishes: [
        finish('crimson-kimono', 'Crimson Kimono', [0.06, 0.8]),
        finish('fade', 'Fade', [0.06, 0.8]),
        finish('emerald-web', 'Emerald Web', [0.06, 0.8], { active: false }),
      ],
    },
    {
      slug: 'sport',
      name: 'Sport Gloves',
      finishes: [finish('vice', 'Vice', [0.06, 0.8]), finish('pandoras-box', "Pandora's Box", [0.06, 0.8])],
    },
  ],
  knife: [
    {
      slug: 'butterfly',
      name: 'Butterfly Knife',
      finishes: [vanilla(), ruby(), finish('blue-steel', 'Blue Steel', [0, 1])],
    },
    {
      slug: 'karambit',
      name: 'Karambit',
      finishes: [
        vanilla(),
        ruby(),
        finish('doppler-sapphire', 'Doppler', [0, 0.08], { phase: 'Sapphire' }),
        finish('blue-steel', 'Blue Steel', [0, 1]),
      ],
    },
    {
      slug: 'm9-bayonet',
      name: 'M9 Bayonet',
      finishes: [vanilla(), ruby(), finish('blue-steel', 'Blue Steel', [0.06, 0.8])],
    },
  ],
}

const RARITY = {
  glove: { code: 'rarity_ancient', name: 'Extraordinary', color: '#eb4b4b' },
  knife: { code: 'rarity_ancient_weapon', name: 'Covert', color: '#eb4b4b' },
}

const displayName = (f: FakeFinish) => (f.phase ? `${f.name} (${f.phase})` : f.name)

function find(kind: Kind, typeSlug: string, finishSlug: string) {
  const type = CATALOG[kind].find((t) => t.slug === typeSlug)
  const found = type?.finishes.find((f) => f.slug === finishSlug)
  return type && found ? { type, finish: found } : null
}

function catalogFinish(kind: Kind, f: FakeFinish, paintIndex: number): Schemas['Finish'] {
  return {
    slug: f.slug,
    name: f.name,
    phase: f.phase,
    display_name: displayName(f),
    paint_index: paintIndex,
    paint_codename: null,
    rarity: RARITY[kind],
    float_min: f.float_min,
    float_max: f.float_max,
    image_url: `https://example.com/images/${f.slug}.png`,
    active: f.active,
  }
}

/** The catalog routes: `/gloves`, `/gloves/{type}`, `/gloves/{type}/{finish}` and the same for knives. */
export function catalogAnswer(kind: Kind, typeSlug?: string, finishSlug?: string): [number, unknown] {
  const types = CATALOG[kind]
  const summary = (t: FakeType, i: number): Schemas['TypeSummary'] => ({
    slug: t.slug,
    name: t.name,
    def_index: 500 + i,
    codename: `weapon_${t.slug}`,
    finish_count: t.finishes.filter((f) => f.active).length,
  })
  if (!typeSlug) return [200, types.map(summary)]
  const index = types.findIndex((t) => t.slug === typeSlug)
  if (index < 0) return [404, { detail: 'Not Found' }]
  const type = types[index]
  if (!finishSlug) {
    const detail: Schemas['TypeDetail'] = {
      ...summary(type, index),
      finishes: type.finishes.filter((f) => f.active).map((f, i) => catalogFinish(kind, f, i)),
    }
    return [200, detail]
  }
  const found = type.finishes.findIndex((f) => f.slug === finishSlug)
  if (found < 0) return [404, { detail: 'Not Found' }]
  const one: Schemas['FinishDetail'] = {
    ...catalogFinish(kind, type.finishes[found], found),
    item_type: { slug: type.slug, name: type.name, def_index: 500 + index, kind, active: true },
  }
  return [200, one]
}


function item(kind: Kind, typeSlug: string, finishSlug: string, conditions: Partial<Conditions> = {}): Item {
  const found = find(kind, typeSlug, finishSlug)
  if (!found) throw new Error(`No ${kind} ${typeSlug}/${finishSlug} in the fake catalog`)
  return {
    type_slug: typeSlug,
    type_name: found.type.name,
    finish_slug: finishSlug,
    display_name: displayName(found.finish),
    image_url: `https://example.com/images/${finishSlug}.png`,
    rarity: RARITY[kind],
    active: found.finish.active,
    float_min: found.finish.float_min,
    float_max: found.finish.float_max,
    float_from: conditions.float_from ?? null,
    float_to: conditions.float_to ?? null,
    seeds: conditions.seeds ?? [],
  }
}

export interface NewCombo {
  /** `<type>/<finish>` */
  glove: string
  knife: string
  rating: number
  status?: Status
  description?: string | null
  gloveConditions?: Partial<Conditions>
  knifeConditions?: Partial<Conditions>
  by?: string
}

type Problem = { loc: (string | number)[]; msg: string; type: string }
export type Answer = [number, unknown] | [204]

const refused = (...problems: [loc: (string | number)[], type: string][]): Answer => [
  422,
  { detail: problems.map(([loc, type]): Problem => ({ loc, msg: 'refused', type })) },
]
const conflict = (code: string): Answer => [409, { detail: code }]
const conditions = (c: Partial<Conditions> | undefined): Conditions => ({
  float_from: c?.float_from ?? null,
  float_to: c?.float_to ?? null,
  seeds: c?.seeds ?? [],
})

export class ComboStore {
  combos: AdminCombo[] = []
  knifeOrder = ['karambit', 'butterfly', 'm9-bayonet']
  private ids = 0
  private ticks = 0
  // Order of last change, for sort=updated.
  private changed = new Map<string, number>()

  private now() {
    this.ticks += 1
    return new Date(Date.UTC(2026, 10, 3, 12, 0, this.ticks)).toISOString()
  }

  private touch(combo: AdminCombo, by: string) {
    combo.updated_by = by
    combo.updated_at = this.now()
    this.changed.set(combo.id, this.ticks)
  }

  add(spec: NewCombo): AdminCombo {
    this.ids += 1
    const [gloveType, gloveFinish] = spec.glove.split('/')
    const [knifeType, knifeFinish] = spec.knife.split('/')
    const by = spec.by ?? 'placeholder-admin'
    const at = this.now()
    const combo: AdminCombo = {
      id: `c${String(this.ids).padStart(11, '0')}`,
      status: spec.status ?? 'draft',
      version: 1,
      rating: spec.rating,
      description: spec.description ?? null,
      glove: item('glove', gloveType, gloveFinish, spec.gloveConditions),
      knife: item('knife', knifeType, knifeFinish, spec.knifeConditions),
      created_at: at,
      created_by: by,
      updated_at: at,
      updated_by: by,
      published_at: spec.status === 'published' ? at : null,
    }
    this.combos.push(combo)
    this.changed.set(combo.id, this.ticks)
    return combo
  }

  get(id: string) {
    return this.combos.find((c) => c.id === id)
  }

  /** Another admin changes a combo's content, as in a version conflict. */
  changeAsAnother(id: string, changes: Partial<Pick<AdminCombo, 'rating' | 'description'>>, by = 'another-admin') {
    const combo = this.get(id)
    if (!combo) throw new Error(`No combo ${id}`)
    Object.assign(combo, changes)
    combo.version += 1
    this.touch(combo, by)
  }

  private pairing(gloveType: string, gloveFinish: string, knifeType: string, knifeFinish: string) {
    return this.combos.find(
      (c) =>
        c.glove.type_slug === gloveType &&
        c.glove.finish_slug === gloveFinish &&
        c.knife.type_slug === knifeType &&
        c.knife.finish_slug === knifeFinish,
    )
  }

  list(query: URLSearchParams): Answer {
    const filters: [string, (c: AdminCombo) => string][] = [
      ['glove_type', (c) => c.glove.type_slug],
      ['glove_finish', (c) => c.glove.finish_slug],
      ['knife_type', (c) => c.knife.type_slug],
      ['knife_finish', (c) => c.knife.finish_slug],
      ['status', (c) => c.status],
    ]
    let found = this.combos.filter((c) =>
      filters.every(([name, value]) => !query.has(name) || value(c) === query.get(name)),
    )
    found =
      query.get('sort') === 'updated'
        ? found.sort((a, b) => (this.changed.get(b.id) ?? 0) - (this.changed.get(a.id) ?? 0))
        : found.sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id))
    const limit = Number(query.get('limit') ?? 100)
    const offset = Number(query.get('offset') ?? 0)
    return [200, { total: found.length, items: found.slice(offset, offset + limit) }]
  }

  create(body: Schemas['ComboIn'], by: string): Answer {
    const glove = find('glove', body.glove.type_slug, body.glove.finish_slug)
    const knife = find('knife', body.knife.type_slug, body.knife.finish_slug)
    if (!glove) return refused([['body', 'glove', 'finish_slug'], 'finish_not_found'])
    if (!knife) return refused([['body', 'knife', 'finish_slug'], 'finish_not_found'])
    if (!glove.finish.active) return refused([['body', 'glove', 'finish_slug'], 'finish_retired'])
    if (this.pairing(body.glove.type_slug, body.glove.finish_slug, body.knife.type_slug, body.knife.finish_slug)) {
      return conflict('combo_exists')
    }
    const combo = this.add({
      glove: `${body.glove.type_slug}/${body.glove.finish_slug}`,
      knife: `${body.knife.type_slug}/${body.knife.finish_slug}`,
      rating: body.rating,
      description: body.description ?? null,
      gloveConditions: conditions(body.glove),
      knifeConditions: conditions(body.knife),
      by,
    })
    return [201, combo]
  }

  read(id: string): Answer {
    const combo = this.get(id)
    return combo ? [200, combo] : [404, { detail: 'combo_not_found' }]
  }

  update(id: string, body: Schemas['ComboUpdate'], by: string): Answer {
    const combo = this.get(id)
    if (!combo) return [404, { detail: 'combo_not_found' }]
    if (body.version !== combo.version) return conflict('version_conflict')
    combo.rating = body.rating
    combo.description = body.description ?? null
    Object.assign(combo.glove, conditions(body.glove))
    Object.assign(combo.knife, conditions(body.knife))
    combo.version += 1
    this.touch(combo, by)
    return [200, combo]
  }

  remove(id: string, version: number): Answer {
    const combo = this.get(id)
    if (!combo) return [404, { detail: 'combo_not_found' }]
    if (combo.status === 'published') return conflict('combo_published')
    if (version !== combo.version) return conflict('version_conflict')
    this.combos = this.combos.filter((c) => c !== combo)
    return [204]
  }

  setStatus(body: Schemas['PublishRequest'], publish: boolean, by: string): Answer {
    let targets: AdminCombo[]
    if (publish && body.all_drafts) {
      targets = this.combos.filter((c) => c.status === 'draft')
    } else {
      const ids = body.ids ?? []
      const unknown = ids.findIndex((id) => !this.get(id))
      if (unknown >= 0) return refused([['body', 'ids', unknown], 'combo_not_found'])
      targets = ids.map((id) => this.get(id) as AdminCombo)
    }
    let changed = 0
    for (const combo of targets) {
      if (publish && combo.status !== 'published') {
        combo.status = 'published'
        combo.published_at = this.now()
      } else if (!publish && combo.status === 'published') {
        combo.status = 'unpublished'
      } else continue
      this.touch(combo, by)
      changed += 1
    }
    return [200, { changed }]
  }

  private orderedKnives() {
    return this.knifeOrder.map((slug) => CATALOG.knife.find((t) => t.slug === slug) as FakeType)
  }

  batchFinishes(): Answer {
    const names = new Map<string, { slug: string; display_name: string; knife_types: number }>()
    for (const type of CATALOG.knife) {
      for (const f of type.finishes.filter((x) => x.active)) {
        const entry = names.get(f.slug) ?? { slug: f.slug, display_name: displayName(f), knife_types: 0 }
        entry.knife_types += 1
        names.set(f.slug, entry)
      }
    }
    return [200, [...names.values()].sort((a, b) => a.display_name.localeCompare(b.display_name))]
  }

  candidates(query: URLSearchParams): Answer {
    const gloveType = query.get('glove_type') ?? ''
    const gloveFinish = query.get('glove_finish') ?? ''
    const knifeFinish = query.get('knife_finish') ?? ''
    const glove = find('glove', gloveType, gloveFinish)
    if (!glove) return refused([['query', 'glove_finish'], 'finish_not_found'])
    const candidates = this.orderedKnives()
      .filter((t) => t.finishes.some((f) => f.slug === knifeFinish && f.active))
      .map((t) => {
        const existing = this.pairing(gloveType, gloveFinish, t.slug, knifeFinish)
        return {
          knife: item('knife', t.slug, knifeFinish),
          existing: existing
            ? {
                id: existing.id,
                status: existing.status,
                version: existing.version,
                rating: existing.rating,
                description: existing.description,
              }
            : null,
        }
      })
    const named = CATALOG.knife.flatMap((t) => t.finishes).find((f) => f.slug === knifeFinish)
    return [
      200,
      {
        glove: item('glove', gloveType, gloveFinish),
        knife_finish: { slug: knifeFinish, display_name: named ? displayName(named) : null },
        candidates,
      },
    ]
  }

  saveBatch(body: Schemas['BatchIn'], by: string): Answer {
    const { type_slug: gloveType, finish_slug: gloveFinish } = body.glove
    const create = body.create ?? []
    const update = body.update ?? []
    for (const [i, row] of create.entries()) {
      if (!find('knife', row.knife_type, body.knife_finish)) {
        return refused([['body', 'create', i, 'knife_type'], 'finish_not_found'])
      }
    }
    for (const [i, row] of update.entries()) {
      if (!this.get(row.id)) return refused([['body', 'update', i, 'id'], 'combo_not_found'])
    }
    for (const row of create) {
      if (this.pairing(gloveType, gloveFinish, row.knife_type, body.knife_finish)) return conflict('combo_exists')
    }
    for (const row of update) {
      if (this.get(row.id)?.version !== row.version) return conflict('version_conflict')
    }
    const created = create.map((row) => {
      const [, combo] = this.create(
        {
          glove: { type_slug: gloveType, finish_slug: gloveFinish, ...conditions(row.glove) },
          knife: { type_slug: row.knife_type, finish_slug: body.knife_finish, ...conditions(row.knife) },
          rating: row.rating,
          description: row.description,
        },
        by,
      ) as [number, AdminCombo]
      return combo
    })
    const updated = update.map((row) => {
      const combo = this.get(row.id) as AdminCombo
      combo.rating = row.rating
      combo.description = row.description ?? null
      combo.version += 1
      this.touch(combo, by)
      return combo
    })
    return [200, { created, updated }]
  }

  getKnifeOrder(): Answer {
    return [200, { knife_types: this.orderedKnives().map((t) => ({ slug: t.slug, name: t.name })) }]
  }

  replaceKnifeOrder(body: Schemas['KnifeOrderIn']): Answer {
    const all = CATALOG.knife.map((t) => t.slug).sort()
    if ([...body.slugs].sort().join() !== all.join()) return refused([['body', 'slugs'], 'knife_order_mismatch'])
    this.knifeOrder = [...body.slugs]
    return this.getKnifeOrder()
  }
}
