/** Pictures of catalog items come from the game's public image host until the screenshot
 * storage spec replaces them (spec 010, Finish images). It is the only host besides the app
 * that the Content Security Policy lets images load from; `scripts/check-bundle.mjs` names it
 * too. */
export const IMAGE_ORIGIN = 'https://community.akamai.steamstatic.com'

/** The URL to show for a catalog picture, or null for one that is not on the image host. */
export function pictureUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return parsed.origin === IMAGE_ORIGIN && url.startsWith(`${IMAGE_ORIGIN}/`) ? url : null
  } catch {
    return null
  }
}
