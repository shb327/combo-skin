/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from "@tailwindcss/vite";
import * as path from "node:path";
import { devApiOrigin, imageBaseUrl, viewerOrigin } from "./src/api/origin";
import { refuseRemovedSettings } from "./scripts/removedSettings";
import { dataProxy } from "./src/api/devData";

export default defineConfig(({ mode }) => {
  // DEV_ALLOWED_HOSTS and DEV_API_BASE_URL have no VITE_ prefix, so they never reach client code.
  const env = loadEnv(mode, __dirname, '')
  const allowedHosts = (env.DEV_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean)
  // Settings that no longer exist stop the dev server and the build, naming their replacement.
  refuseRemovedSettings({
    VITE_API_BASE_URL: process.env.VITE_API_BASE_URL ?? env.VITE_API_BASE_URL,
    VITE_IMAGE_ORIGIN: process.env.VITE_IMAGE_ORIGIN ?? env.VITE_IMAGE_ORIGIN,
  })
  // The local API that answers /data/ on the dev and preview servers. Fails, naming the variable.
  const api = devApiOrigin(process.env.DEV_API_BASE_URL ?? env.DEV_API_BASE_URL)
  // Fails, naming VITE_IMAGE_BASE_URL, our bucket of screenshots and catalog pictures.
  const images = imageBaseUrl(process.env.VITE_IMAGE_BASE_URL ?? env.VITE_IMAGE_BASE_URL)
  // And for VITE_VIEWER_ORIGIN, the 3D viewer shown by "View in 3D".
  const viewer = viewerOrigin(process.env.VITE_VIEWER_ORIGIN ?? env.VITE_VIEWER_ORIGIN)

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        // Production serves /data/ as files; the dev and preview servers ask the local API.
        name: 'combo-skin-dev-data',
        configureServer(server) {
          server.middlewares.use(dataProxy(api))
        },
        configurePreviewServer(server) {
          server.middlewares.use(dataProxy(api))
        },
      },
    ],
    define: {
      'import.meta.env.VITE_IMAGE_BASE_URL': JSON.stringify(images),
      'import.meta.env.VITE_VIEWER_ORIGIN': JSON.stringify(viewer),
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
