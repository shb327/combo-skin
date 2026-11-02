import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from "@tailwindcss/vite";
import * as path from "node:path";

export default defineConfig(({ mode }) => {
  // DEV_ALLOWED_HOSTS has no VITE_ prefix, so it is never exposed to client code.
  const env = loadEnv(mode, __dirname, '')
  const allowedHosts = (env.DEV_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean)

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    server: {
      allowedHosts,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
