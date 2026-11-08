/** A finish's combo list view (spec 017): sort and filters in the address, and the window's
 * scroll position kept in memory per list address while a combo is open. */
import type { ComboStatus } from './queries'

export type Sort = 'rating' | 'updated'
export type StatusFilter = 'all' | ComboStatus

export interface ListView {
  sort: Sort
  status: StatusFilter
  /** A knife finish slug, or empty for every knife finish. */
  knife: string
}

const STATUS_VALUES: StatusFilter[] = ['all', 'draft', 'published', 'unpublished']

/** The view an address asks for; unknown values fall back to the defaults. */
export function readView(params: URLSearchParams): ListView {
  const status = params.get('status') as StatusFilter | null
  return {
    sort: params.get('sort') === 'updated' ? 'updated' : 'rating',
    status: status && STATUS_VALUES.includes(status) ? status : 'all',
    knife: params.get('knife') ?? '',
  }
}

/** The address query of a view, defaults left out. */
export function viewParams(view: ListView): URLSearchParams {
  const params = new URLSearchParams()
  if (view.sort !== 'rating') params.set('sort', view.sort)
  if (view.status !== 'all') params.set('status', view.status)
  if (view.knife) params.set('knife', view.knife)
  return params
}

const scrolls = new Map<string, number>()

/** Called when a combo link of the list at `url` is followed. */
export function rememberScroll(url: string) {
  scrolls.set(url, window.scrollY)
}

/** The position to go back to once the list at `url` has rendered, used once. */
export function takeScroll(url: string): number | undefined {
  const y = scrolls.get(url)
  scrolls.delete(url)
  return y
}
