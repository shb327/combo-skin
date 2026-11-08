import type { PublicCombo } from '@/api/client'

/** Pictures of catalog items come from the game's public image host. The same host and rule as
 * the admin dashboard's (admin/src/api/images.ts). */
export const IMAGE_ORIGIN = 'https://community.akamai.steamstatic.com'

/** Screenshots come from our image host, VITE_IMAGE_ORIGIN. */
export const SCREENSHOT_ORIGIN = import.meta.env.VITE_IMAGE_ORIGIN

function onOrigin(url: string | null | undefined, origin: string): string | null {
  if (!url) return null
  try {
    return new URL(url).origin === origin && url.startsWith(`${origin}/`) ? url : null
  } catch {
    return null
  }
}

/** The URL to show for a catalog picture, or null for one that is not on the image host. */
export function pictureUrl(url: string | null | undefined): string | null {
  return onOrigin(url, IMAGE_ORIGIN)
}

/** The URL to show for a screenshot version, or null for one that is not on our image host. */
export function screenshotUrl(url: string | null | undefined): string | null {
  return onOrigin(url, SCREENSHOT_ORIGIN)
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
