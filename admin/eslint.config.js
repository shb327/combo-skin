import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// Guard rails: only src/api/client.ts may use the network, and nothing may use browser storage,
// cookies, raw HTML or console.log.
const network = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'].map((name) => ({
  name,
  message: 'Make requests through src/api/client.ts.',
}))
const storage = ['localStorage', 'sessionStorage', 'indexedDB'].map((name) => ({
  name,
  message: 'The admin keeps nothing in browser storage.',
}))
const properties = [
  ...['window', 'globalThis', 'self'].flatMap((object) => [
    ...['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'].map((property) => ({
      object,
      property,
      message: 'Make requests through src/api/client.ts.',
    })),
    ...['localStorage', 'sessionStorage', 'indexedDB'].map((property) => ({
      object,
      property,
      message: 'The admin keeps nothing in browser storage.',
    })),
  ]),
  { object: 'navigator', property: 'sendBeacon', message: 'Make requests through src/api/client.ts.' },
  { object: 'document', property: 'cookie', message: 'The session cookie is HttpOnly; the admin sets no cookies.' },
]
const rawHtml = {
  selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
  message: 'Never render HTML from strings.',
}

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    rules: {
      'no-restricted-globals': ['error', ...network, ...storage],
      'no-restricted-properties': ['error', ...properties],
      'no-restricted-syntax': ['error', rawHtml],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['src/api/client.ts'],
    rules: {
      'no-restricted-globals': ['error', ...storage],
      'no-restricted-properties': [
        'error',
        ...properties.filter((p) => p.message !== 'Make requests through src/api/client.ts.'),
      ],
    },
  },
  {
    // Tests check that storage and cookies stay empty, and run Node scripts.
    files: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'scripts/**'],
    rules: { 'no-restricted-globals': ['error', ...network], 'no-restricted-properties': 'off' },
  },
  {
    files: ['scripts/**', 'vite.config.ts', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'off' },
  },
])
