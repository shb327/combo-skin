/** Settings that no longer exist. Setting one stops the dev server and the build with a note
 * naming its replacement. Used by vite.config.ts. */
export function refuseRemovedSettings(env: Record<string, string | undefined>): void {
  if (env.VITE_API_BASE_URL) {
    throw new Error(
      'VITE_API_BASE_URL was replaced by DEV_API_BASE_URL: the site reads its data files from its ' +
        'own origin, and only the dev and preview servers read the API',
    )
  }
  if (env.VITE_IMAGE_ORIGIN) {
    throw new Error("VITE_IMAGE_ORIGIN was replaced by VITE_IMAGE_BASE_URL, the bucket's base URL")
  }
}
