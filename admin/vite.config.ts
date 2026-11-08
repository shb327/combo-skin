/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { IMAGE_ORIGIN } from './src/api/images'
import { apiOrigin, imageOrigin } from './src/api/origin'

const PORT = 5174

/** The Content Security Policy of the built app. Not in the dev server: hot reload injects
 * inline scripts. */
export function contentSecurityPolicy(origin: string, images: string): string {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    // Catalog pictures from the game's image host (spec 010), screenshots from ours (spec 015).
    `img-src 'self' ${IMAGE_ORIGIN} ${images}`,
    `connect-src 'self' ${origin}`,
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ].join('; ')
}

function csp(origin: string, images: string): Plugin {
  return {
    name: 'admin-csp',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy(origin, images) },
        injectTo: 'head-prepend',
      },
    ],
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, 'VITE_')
  // Fails, naming VITE_API_BASE_URL, before the dev server or a build starts.
  const origin = apiOrigin(process.env.VITE_API_BASE_URL ?? env.VITE_API_BASE_URL)
  // The same for VITE_IMAGE_ORIGIN, where screenshots are loaded from.
  const images = imageOrigin(process.env.VITE_IMAGE_ORIGIN ?? env.VITE_IMAGE_ORIGIN)

  return {
    plugins: [react(), tailwindcss(), csp(origin, images)],
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(origin),
      'import.meta.env.VITE_IMAGE_ORIGIN': JSON.stringify(images),
    },
    server: { port: PORT, strictPort: true },
    preview: { port: PORT, strictPort: true },
    build: {
      // Fonts and images stay files, so the CSP needs no data: sources.
      assetsInlineLimit: 0,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['src/test/setup.ts'],
      restoreMocks: true,
    },
  }
})
