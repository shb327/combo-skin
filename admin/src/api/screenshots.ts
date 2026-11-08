import { onOrigin } from './images'

/** Screenshots come from our image host, VITE_IMAGE_ORIGIN, checked in vite.config.ts. */
export const SCREENSHOT_ORIGIN = import.meta.env.VITE_IMAGE_ORIGIN

/** The URL to show for a screenshot version, or null for one that is not on our image host. */
export function screenshotUrl(url: string | null | undefined): string | null {
  return onOrigin(url, SCREENSHOT_ORIGIN)
}
