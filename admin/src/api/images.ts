/** Pictures of catalog items come from the game's public image host (spec 010, Finish images),
 * screenshots from our image host, VITE_IMAGE_ORIGIN (spec 015, `screenshots.ts`). They are the
 * only hosts besides the app that the Content Security Policy lets images load from;
 * `scripts/check-bundle.mjs` names them too. */
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

/** The URL to show for a catalog picture, or null for one that is not on the image host. */
export function pictureUrl(url: string | null | undefined): string | null {
  return onOrigin(url, IMAGE_ORIGIN)
}
