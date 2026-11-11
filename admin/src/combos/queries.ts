/** Server state for the combo screens: query keys, loaders and the query client. Every loader
 * goes through the API client. */
import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Api } from '../api/client'
import type { components } from '../api/schema'
import { useApi } from '../api/useApi'

type Schemas = components['schemas']
export type AdminCombo = Schemas['AdminCombo']
export type Item = Schemas['Item']
export type Candidates = Schemas['Candidates']
export type FinishDetail = Schemas['FinishDetail']
export type Kind = 'glove' | 'knife'
export type Agent = Schemas['Agent']
export type ScreenshotSettings = Schemas['ScreenshotSettings']
export type ScreenshotState = Schemas['ScreenshotState']
export type Worker = Schemas['WorkerOut']
export type ComboStatus = AdminCombo['status']

/** One finish of the catalog, as the searches use it. */
export interface CatalogEntry {
  id: string
  kind: Kind
  typeSlug: string
  typeName: string
  finishSlug: string
  displayName: string
  label: string
  floatMin: number | null
  floatMax: number | null
  /** Our copy of the picture, and the game's as the fallback. */
  imageUrl: string
  fallbackUrl: string
}

export interface ComboFilters {
  glove_type?: string
  glove_finish?: string
  knife_type?: string
  knife_finish?: string
}

export const PAGE_SIZE = 500

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // A refusal shows with a "Try again" button; nothing refetches on its own, since every
      // request counts as activity and would keep an idle session alive.
      queries: { retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false, staleTime: 0 },
      mutations: { retry: false },
    },
  })
}

export const keys = {
  catalog: (kind: Kind) => ['catalog', kind] as const,
  finish: (kind: Kind, type: string, finish: string) => ['finish', kind, type, finish] as const,
  combos: ['combos'] as const,
  comboList: (filters: ComboFilters) => ['combos', 'list', filters] as const,
  combo: (id: string) => ['combos', 'one', id] as const,
  draftCount: ['combos', 'draft-count'] as const,
  batchFinishes: ['batch-finishes'] as const,
  candidates: ['candidates'] as const,
  workers: ['workers'] as const,
  candidatesFor: (type: string, finish: string, knifeFinish: string) => ['candidates', type, finish, knifeFinish] as const,
  knifeOrder: ['knife-order'] as const,
  agents: ['agents'] as const,
  screenshotSettings: ['screenshot-settings'] as const,
}

export const finishLabel = (item: { type_name: string; display_name: string }) =>
  `${item.type_name} | ${item.display_name}`

interface Catalog {
  /** Every active type, in display order, also one without active finishes. */
  types: { slug: string; name: string }[]
  entries: CatalogEntry[]
}

async function loadCatalog(api: Api, kind: Kind): Promise<Catalog> {
  const types =
    kind === 'glove' ? (await api.request('get', '/gloves')).data : (await api.request('get', '/knives')).data
  const details = await Promise.all(
    (types ?? []).map(async (type) => {
      const params = { params: { path: { type_slug: type.slug } } }
      const { data } =
        kind === 'glove'
          ? await api.request('get', '/gloves/{type_slug}', params)
          : await api.request('get', '/knives/{type_slug}', params)
      return data
    }),
  )
  const entries = details.flatMap((type) =>
    (type?.finishes ?? []).map((finish) => ({
      id: `${type?.slug}/${finish.slug}`,
      kind,
      typeSlug: type?.slug ?? '',
      typeName: type?.name ?? '',
      finishSlug: finish.slug,
      displayName: finish.display_name,
      label: `${type?.name} | ${finish.display_name}`,
      floatMin: finish.float_min,
      floatMax: finish.float_max,
      imageUrl: finish.image_url,
      fallbackUrl: finish.fallback_image_url,
    })),
  )
  return { types: (types ?? []).map(({ slug, name }) => ({ slug, name })), entries }
}

function useCatalogQuery<T>(kind: Kind, select: (catalog: Catalog) => T) {
  const api = useApi()
  return useQuery({ queryKey: keys.catalog(kind), queryFn: () => loadCatalog(api, kind), staleTime: Infinity, select })
}

const entriesOf = (catalog: Catalog) => catalog.entries

/** Every active finish of a kind, loaded once per page load. */
export function useCatalog(kind: Kind) {
  return useCatalogQuery(kind, entriesOf)
}

/** Every active type of a kind with its active finishes, from the same request as the search. */
export function useCatalogTypes(kind: Kind) {
  return useCatalogQuery(kind, catalogTypes)
}

/** One finish, also a retired one. */
export function useFinish(kind: Kind, type: string, finish: string) {
  const api = useApi()
  return useQuery({
    queryKey: keys.finish(kind, type, finish),
    staleTime: Infinity,
    queryFn: async () => {
      const params = { params: { path: { type_slug: type, finish_slug: finish } } }
      const { data } =
        kind === 'glove'
          ? await api.request('get', '/gloves/{type_slug}/{finish_slug}', params)
          : await api.request('get', '/knives/{type_slug}/{finish_slug}', params)
      return data as FinishDetail
    },
  })
}

export async function loadCombos(api: Api, filters: ComboFilters): Promise<AdminCombo[]> {
  const items: AdminCombo[] = []
  for (;;) {
    const { data } = await api.request('get', '/admin/combos', {
      params: { query: { ...filters, limit: PAGE_SIZE, offset: items.length } },
    })
    const page = data?.items ?? []
    items.push(...page)
    if (!page.length || items.length >= (data?.total ?? 0)) return items
  }
}

/** Every combo of a finish, in as many pages as it takes. */
export function useCombos(filters: ComboFilters, enabled = true) {
  const api = useApi()
  return useQuery({ queryKey: keys.comboList(filters), queryFn: () => loadCombos(api, filters), enabled })
}

export function useCombo(id: string) {
  const api = useApi()
  return useQuery({
    queryKey: keys.combo(id),
    queryFn: async () => {
      const { data } = await api.request('get', '/admin/combos/{combo_id}', { params: { path: { combo_id: id } } })
      return data as AdminCombo
    },
  })
}

export function useDraftCount() {
  const api = useApi()
  return useQuery({
    queryKey: keys.draftCount,
    queryFn: async () => {
      const { data } = await api.request('get', '/admin/combos', { params: { query: { status: 'draft', limit: 1 } } })
      return data?.total ?? 0
    },
  })
}

export function useBatchFinishes() {
  const api = useApi()
  return useQuery({
    queryKey: keys.batchFinishes,
    queryFn: async () => (await api.request('get', '/admin/batches/finishes')).data ?? [],
  })
}

export function useCandidates(type: string, finish: string, knifeFinish: string) {
  const api = useApi()
  return useQuery({
    queryKey: keys.candidatesFor(type, finish, knifeFinish),
    queryFn: async () => {
      const { data } = await api.request('get', '/admin/batches/candidates', {
        params: { query: { glove_type: type, glove_finish: finish, knife_finish: knifeFinish } },
      })
      return data as Candidates
    },
  })
}

export function useKnifeOrder() {
  const api = useApi()
  return useQuery({
    queryKey: keys.knifeOrder,
    queryFn: async () => (await api.request('get', '/admin/knife-order')).data?.knife_types ?? [],
  })
}

/** Agents still in the game, Counter-Terrorists first; loaded once per page load. */
export function useAgents() {
  const api = useApi()
  return useQuery({
    queryKey: keys.agents,
    staleTime: Infinity,
    queryFn: async () => (await api.request('get', '/admin/agents')).data ?? [],
  })
}

/** The default screenshot agent, and how many combos use it. */
export function useScreenshotSettings() {
  const api = useApi()
  return useQuery({
    queryKey: keys.screenshotSettings,
    queryFn: async () => (await api.request('get', '/admin/screenshot-settings')).data as ScreenshotSettings,
  })
}

/** Every screenshot worker, revoked ones included. */
export function useWorkers() {
  const api = useApi()
  return useQuery({
    queryKey: keys.workers,
    queryFn: async () => (await api.request('get', '/admin/workers')).data ?? [],
  })
}

/** Team names, as the agent lists group them. */
export const TEAMS: Record<Agent['team'], string> = { ct: 'Counter-Terrorists', t: 'Terrorists' }

/** After any combo write: lists, counts, single combos, batch candidates and the number of
 * combos using the default agent are stale. */
export function useComboWrites() {
  const client = useQueryClient()
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: keys.combos }),
      client.invalidateQueries({ queryKey: keys.candidates }),
      client.invalidateQueries({ queryKey: keys.screenshotSettings }),
    ])
}

export interface CatalogType {
  slug: string
  name: string
  finishes: CatalogEntry[]
}

/** The types of a loaded catalog, in its order, each with its finishes. */
export function catalogTypes(catalog: Catalog): CatalogType[] {
  return catalog.types.map((type) => ({
    ...type,
    finishes: catalog.entries.filter((entry) => entry.typeSlug === type.slug),
  }))
}
