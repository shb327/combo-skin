/** Screenshot states and reasons as fixed text, and the version the edit page shows. Text from a
 * worker is never shown. */
import { screenshotUrl } from '../api/screenshots'
import type { AdminCombo, ScreenshotState } from './queries'

export const STATE_LABELS: Record<ScreenshotState['state'], string> = {
  none: 'None',
  waiting: 'Waiting',
  done: 'Done',
  failed: 'Failed',
}

export const REASONS: Record<NonNullable<ScreenshotState['reason']>, string> = {
  render_failed: 'The viewer could not draw this combo.',
  asset_missing: 'An item or agent is missing from the viewer’s files.',
  timeout: 'Drawing this combo took too long.',
  lease_expired: 'The screenshot worker stopped answering.',
  abandoned: 'The screenshot worker asked for other work before answering.',
}

/** The 1280 version, or the version nearest it, when every URL is on our image host. */
export function screenshotImage(combo: AdminCombo): { src: string; width: number; height: number } | null {
  const images = combo.screenshot?.images ?? []
  if (!images.length || images.some((image) => screenshotUrl(image.url) === null)) return null
  const best = [...images].sort((a, b) => Math.abs(a.width - 1280) - Math.abs(b.width - 1280))[0]
  return { src: best.url, width: best.width, height: best.height }
}
