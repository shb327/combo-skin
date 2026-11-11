/** Screenshots and our copies of the catalog's pictures come from our image host,
 * VITE_IMAGE_ORIGIN (`screenshots.ts`, `pictures.ts`); the game's public image host is the
 * pictures' fallback. They are the only hosts besides the app that the Content Security Policy
 * lets images load from; `scripts/check-bundle.mjs` names them too. */
export const IMAGE_ORIGIN = 'https://community.akamai.steamstatic.com'

/** The URL if it is on `origin`, else null. */
export function onOrigin(url: string | null | undefined, origin: string): string | null {
  if (!url) return null
  try {
    return new URL(url).origin === origin && url.startsWith(`${origin}/`) ? url : null
  } catch {
    return null
  }
}
