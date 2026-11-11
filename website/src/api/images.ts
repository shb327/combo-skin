import type { PublicCombo } from '@/api/client'

/** The game's public image host: the catalog's pictures as the game publishes them, kept as the
 * fallback for our copies. The same host and rule as the admin dashboard's
 * (admin/src/api/images.ts). */
export const GAME_IMAGE_ORIGIN = 'https://community.akamai.steamstatic.com'

/** Our public image bucket, VITE_IMAGE_BASE_URL: screenshots, and our copies of the catalog's
 * pictures under `catalog/`. */
export const IMAGE_BASE_URL = import.meta.env.VITE_IMAGE_BASE_URL
export const IMAGE_ORIGIN = new URL(IMAGE_BASE_URL).origin

/** A catalog picture's key in the bucket, as `api/src/combo_api/catalog/images.py` makes it. */
const COPY_KEY = /^catalog\/[0-9a-f]{32}\.png$/

function onOrigin(url: string | null | undefined, origin: string): string | null {
  if (!url) return null
  try {
    return new URL(url).origin === origin && url.startsWith(`${origin}/`) ? url : null
  } catch {
    return null
  }
}

/** The URL to show for a catalog picture: on our bucket or on the game's host, else null. */
export function pictureUrl(url: string | null | undefined): string | null {
  return onOrigin(url, IMAGE_ORIGIN) ?? onOrigin(url, GAME_IMAGE_ORIGIN)
}

/** Our copy of a catalog picture, from its key in the bundled catalog, or null for a key that is
 * not one. */
export function copyUrl(key: string | null | undefined): string | null {
  return key && COPY_KEY.test(key) ? `${IMAGE_BASE_URL}/${key}` : null
}

/** The URL to show for a screenshot version, or null for one that is not on our image host. */
export function screenshotUrl(url: string | null | undefined): string | null {
  return onOrigin(url, IMAGE_ORIGIN)
}

export interface ScreenshotSources {
  src: string
  srcSet: string
  width: number
  height: number
}

/** A screenshot's `src` (the middle version) and `srcset`, or null without a screenshot or when
 * any version is off our image host. */
export function screenshotSources(screenshot: PublicCombo['screenshot']): ScreenshotSources | null {
  if (!screenshot || screenshot.images.length === 0) return null
  const urls = screenshot.images.map((image) => screenshotUrl(image.url))
  if (urls.some((url) => url === null)) return null
  const middle = screenshot.images[Math.floor((screenshot.images.length - 1) / 2)]
  return {
    src: middle.url,
    srcSet: screenshot.images.map((image) => `${image.url} ${image.width}w`).join(', '),
    width: screenshot.width,
    height: screenshot.height,
  }
}
