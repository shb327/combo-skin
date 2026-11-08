/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The API origin, checked and given a default in vite.config.ts. */
  readonly VITE_API_BASE_URL: string
  /** Where screenshots are loaded from, checked and given a default in vite.config.ts. */
  readonly VITE_IMAGE_ORIGIN: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
