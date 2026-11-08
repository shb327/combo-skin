/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from "@tailwindcss/vite";
import * as path from "node:path";
import { apiOrigin, imageOrigin } from "./src/api/origin";

export default defineConfig(({ mode }) => {
  // DEV_ALLOWED_HOSTS has no VITE_ prefix, so it is never exposed to client code.
  const env = loadEnv(mode, __dirname, '')
  const allowedHosts = (env.DEV_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean)
  // Fails, naming VITE_API_BASE_URL, before the dev server or a build starts.
  const origin = apiOrigin(process.env.VITE_API_BASE_URL ?? env.VITE_API_BASE_URL)
  // The same for VITE_IMAGE_ORIGIN, where screenshots are loaded from.
  const images = imageOrigin(process.env.VITE_IMAGE_ORIGIN ?? env.VITE_IMAGE_ORIGIN)

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(origin),
      'import.meta.env.VITE_IMAGE_ORIGIN': JSON.stringify(images),
    },
    server: {
      allowedHosts,
    },
    build: {
      rollupOptions: {
        output: {
          // The generated catalog is most of the app's data: give it its own chunk.
          manualChunks(id) {
            if (id.endsWith('/src/data/catalog.json')) return 'catalog'
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['src/test/setup.ts'],
      restoreMocks: true,
    },
  }
})
