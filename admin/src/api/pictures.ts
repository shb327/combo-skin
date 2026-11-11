import { IMAGE_ORIGIN, onOrigin } from './images'
import { SCREENSHOT_ORIGIN } from './screenshots'

/** The URL to show for a catalog picture: our copy in the image bucket (VITE_IMAGE_ORIGIN), or
 * the game's picture on its image host. Anything else is null. Kept apart from `images.ts`,
 * which `vite.config.ts` imports before `import.meta.env` exists. */
export function catalogPictureUrl(url: string | null | undefined): string | null {
  return onOrigin(url, SCREENSHOT_ORIGIN) ?? onOrigin(url, IMAGE_ORIGIN)
}
