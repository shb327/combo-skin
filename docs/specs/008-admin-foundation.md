# 008: Admin dashboard foundation

**Status:** Implemented
<!-- Lifecycle: Draft → Approved → Implemented → Audited -->

**Section:** admin
**Branch:** 008-admin-foundation

## Summary

Create the `admin/` section: a Vite, React and TypeScript app where the owner and the admins they create manage the site. It logs in against the API of spec 007, keeps the session working across reloads and sends the user back to login when it ends, talks to the API only through a client typed from `api/openapi.json`, and gives the later screens a shell to live in. The first of those screens, in the next specs, is entering combos (knife and glove from the catalog, float, seed, rating, description and screenshots), so this spec builds the base they need and no product screens.

## Goals and non-goals

**Goals**

- An `admin/` npm project on the same stack and look as the website: Vite, React 19, TypeScript, Tailwind v4, Montserrat, the website's background and accent colours.
- Login, "who am I" on load, logout and every error code of spec 007's login endpoints, with the user returned to where they were after their session ends.
- One API client, typed from the committed OpenAPI snapshot, that sends credentials only to the configured API origin and the CSRF token on writes; CI fails when the generated types are stale.
- An app shell: layout, navigation (Home, By gloves, By knife), a home page that offers the two directions, placeholders for the combo screens of later specs, the logged-in admin's username, logout, and a not-found page.
- Tests, lint, type check and build, an `admin` GitHub Actions workflow, `admin/README.md`, and the root README updated.

**Non-goals**

- Combo, catalog or image upload screens, and any data beyond the admin's own session.
- Two-factor login, roles, account management in the browser, and "remember me".
- Any change to `api/`. Where the API would need a change, it is listed under Follow-ups in Design.
- Deployment, production web server headers, and an `admin` service in Docker Compose (see Design).
- A package shared with `website/`, and any change to `website/`.
- End-to-end tests against the real API in CI (see Design).

## Context

- There is no `admin/` directory. `README.md` (root) lists `website/` and `api/` and says an admin dashboard is planned in `admin/`.
- `website/` is the reference for stack and look. `website/package.json`: Vite 7, React 19.2, TypeScript 5.9, Tailwind v4 through `@tailwindcss/vite`, `react-router` 7, ESLint 9 with a flat config (`website/eslint.config.js`), no test runner. It also carries Chakra UI v2, Emotion and other libraries the admin does not need. `website/src/index.css` defines the theme tokens (`--color-background: #0A0A0C`, `--color-accent: #00DE12`) and the Montserrat font stack. `website/index.html` loads Montserrat from a third-party font host at runtime.
- `.github/workflows/website.yml` and `api.yml` set the CI conventions from specs 001 and 002: `push` and `pull_request` with no filters, `permissions: contents: read`, `concurrency` per ref with `cancel-in-progress`, actions pinned to commit SHAs (checkout v7.0.1, setup-node v7.1.0), `persist-credentials: false`, no secrets, Node 24 with the npm cache keyed on the lockfile, and a status badge in the root and section READMEs.
- `api/openapi.json` is the committed OpenAPI 3.1 snapshot; operation IDs are the route function names (spec 002). `api/README.md` says it is used to generate TypeScript types for the website and admin; nothing generates them yet. `uv run python -m combo_api.openapi --check` keeps it in sync with the API.
- Spec 007 (`docs/specs/007-admin-login.md`, Audited and merged into `main`) defines what this spec calls:
  - `POST /admin/login` (`admin_login`), JSON `{"username", "password"}`, username 1 to 64 and password 1 to 1024 characters; returns `{"admin": {"username"}, "csrf_token", "expires_at"}` and sets the session cookie.
  - `GET /admin/me` (`admin_me`): the same body for the current session, or 401. This is how a reloaded page gets its CSRF token back.
  - `POST /admin/logout` (`admin_logout`): needs an allowed `Origin` and, with a live session, the `X-CSRF-Token` header; returns 204.
  - Errors as `{"detail": "<code>"}`: 401 `invalid_credentials`, 401 `not_authenticated`, 403 `origin_not_allowed`, 403 `csrf_failed`, 415, 422, and 429 `too_many_attempts` with `Retry-After` in seconds.
  - CORS for the origins in `ADMIN_ORIGINS` only, whose example value is `http://localhost:5174`; credentials allowed; request headers `Content-Type` and `X-CSRF-Token`; `Retry-After` exposed. Another origin gets no CORS headers at all, so a browser cannot read its 403: the app sees a failed request, not an error code.
  - A session cookie that is HttpOnly, `SameSite=Strict` and host-only on the API's host. The admin and the API are the same site on different origins (subdomains of one domain in production, `localhost` ports locally), so requests carry it only with credentials included. `127.0.0.1` and `localhost` are different sites: the app must be opened at `localhost`.
  - Sessions end after 60 minutes idle or 12 hours from login, and on logout, disable or password change.
  - Admins are created only with an interactive command line tool; nothing can create one without a terminal.
- `compose.yaml` runs the database, migrations, catalog import and the API, published at `http://localhost:8000`. Spec 002 expected `website` and `admin` services to be added there later.
- `THIRD_PARTY_NOTICES.md` credits the catalog dataset; spec 007's branch also adds an entry to it.
- This work starts after spec 007 is merged into `main`, with this branch updated from `main`, so that `api/openapi.json` contains the three admin routes. Where the merged API differs from spec 007, the merged code and snapshot are followed and the difference is recorded in Implementation notes.

## Requirements

**Project**

- R1. `admin/` is an npm project with a committed `package-lock.json`, installed with `npm ci`, on Node 24, Vite, React 19, TypeScript (strict) and Tailwind v4. Its runtime dependencies are only those listed in Design.
- R2. `npm run dev` serves the app at `http://localhost:5174` and fails rather than moving to another port. `npm run preview` serves the build on the same port.
- R3. The app uses the website's look: Montserrat bundled with the app, background `#0A0A0C`, accent `#00DE12`, as Tailwind theme tokens with the website's names.
- R4. The API origin comes from `VITE_API_BASE_URL`, `http://localhost:8000` when unset. An invalid value stops the dev server and the build with an error that names the variable.

**API client**

- R5. TypeScript types for the API are generated from `api/openapi.json` into a committed file. One command regenerates them; a check command fails when the file differs from what the snapshot generates. Neither needs network access or a running API.
- R6. Every request to the API goes through one client module. It sends requests only to the configured API origin, always with credentials included, and adds the session's CSRF token in `X-CSRF-Token` to every `POST`, `PUT`, `PATCH` and `DELETE` made with a session.
- R7. Request and response types for the API come only from the generated file.
- R8. When a write is refused with `csrf_failed`, the client fetches `/admin/me` once, takes the current CSRF token, and retries the write once.

**Login and session**

- R9. On load the app calls `/admin/me` once and shows a neutral loading state until it answers: the shell for a live session, the login page otherwise.
- R10. Every page except `/login` requires a session. Without one, the app shows the login page and keeps the requested path, including its query string, to return to after login.
- R11. The login page has a username and a password field and a submit button, and handles each outcome of `POST /admin/login` as described in API / data model.
- R12. When any request made with a session gets 401 `not_authenticated`, the app forgets the session, shows the login page with a notice that the session has ended, and returns to the same path after the next login.
- R13. When the session's absolute expiry passes, or the tab becomes visible again after at least a minute hidden, the app re-checks the session with `/admin/me`.
- R14. Logout calls `POST /admin/logout`. Only after it returns 204 does the app forget the session and show the login page; otherwise it stays logged in and shows an error.
- R15. Visiting `/login` with a live session goes to the home page.

**Shell**

- R16. With a session, every page shows a header with the logo, named "Combo Skin" for assistive technology, and "ADMIN" beside it, the admin's username and a logout button, and navigation with Home, By gloves and By knife; the current page is marked for assistive technology.
- R17. Home offers two directions, By gloves and By knife, each a link to its page. By gloves and By knife are placeholders that say the combo screens for that direction come in later specs. An unknown path shows a not-found page inside the shell with a link home.
- R18. Each page sets the document title to `<page> · Combo Skin admin`. The layout works without horizontal scrolling from 375 px wide.

**Checks and docs**

- R19. `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` each pass in `admin/`, and a bundle check script verifies the built files (Security).
- R20. A GitHub Actions workflow `admin` runs install, the types check, lint, tests, build and the bundle check on every push and pull request.
- R21. `admin/README.md` explains what the app is, prerequisites, getting started against the local API, the scripts, configuration, regenerating API types, tests and the project layout. The root `README.md` lists `admin/` and links to it.

## Design

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| CSRF token in the browser | In memory only, in the session state of the React tree. After a reload the app calls `/admin/me`, which returns the same token for the same session (spec 007). Each tab fetches its own copy | `sessionStorage` or `localStorage`: readable by any script on the origin and kept after the session ends; `/admin/me` already restores it with one request, which the app makes on load anyway to learn whether a session exists. A cookie readable by script: the token's purpose is to be something a cookie-carrying cross-site request cannot supply. |
| Routing | `react-router` 7, the website's router, in declarative mode (`BrowserRouter`, `Routes`, nested layout route) | TanStack Router: typed routes, but a second router family in the repo and more setup. wouter: smaller, but differs from the website for a few kilobytes. Hand-written routing: history, nested layouts and links by hand. Data mode loaders: fit poorly with a session that is known only after `/admin/me` answers. |
| Data fetching | The typed client plus a small session context and hooks; no query library in this spec | TanStack Query: caching, retries and invalidation help once combo lists and edits arrive; the combos spec decides, and keeping every request in one client module keeps that change small. SWR: the same trade-off, with weaker support for writes. |
| Type generation | `openapi-typescript` (dev dependency) generates `admin/src/api/schema.d.ts` from `../api/openapi.json`; `openapi-fetch` is the typed runtime client. The generated file is committed. `npm run api:types` regenerates it and `npm run api:types:check` compares it, as `combo_api.openapi --check` does for the snapshot | Not committing it and generating before each build: reviews would not show how an API change reaches the admin, and every build would depend on the generator. `@hey-api/openapi-ts`, Orval, OpenAPI Generator: generate a runtime client and more code to review; Orval and OpenAPI Generator pull in larger toolchains. Hand-written types: drift from the API. |
| When the API changes | A pull request that changes `api/openapi.json` also regenerates the admin types, or the `admin` workflow fails; this follows spec 002's "a breaking change is fixed in the same pull request" | Path filters so API pull requests skip the admin check: spec 001 rejected path filters. |
| Test tools | Vitest with jsdom, Testing Library (`react`, `user-event`, `jest-dom`); test files next to the code as `*.test.ts(x)` | Jest: needs its own TypeScript and module setup next to Vite's. Vitest browser mode: a real browser in CI for little gain at this size. |
| API in tests | A hand-written fake: a `fetch` function passed to the client that routes by method and path, returns responses typed from the generated schema, and records every request (URL, method, credentials mode, headers, body) | MSW: a realistic network layer, but one more dependency for three endpoints, when the client already accepts a `fetch` function. The real API from Compose: creating an admin needs spec 007's interactive tool, so CI cannot log in without an API change (Follow-ups). Verified once by hand instead (criterion 30). |
| Styles shared with the website | Copy the two colour tokens and the font stack into `admin/src/index.css`, with the website's token names; copy the website's favicon and logo | A shared workspace package: npm workspaces, a second build target and a coupling to the website's Chakra and Emotion era for two colours and a font. Revisit when real components are shared. |
| Font | Montserrat from Fontsource (`@fontsource/montserrat`, weights 400, 500, 600 and 700, Latin subset), bundled, credited in `THIRD_PARTY_NOTICES.md` (SIL Open Font License 1.1) | The website's runtime link to a font host: a third-party request on every admin page view. A system font: does not match the website. |
| Runtime dependencies | `react`, `react-dom`, `react-router`, `openapi-fetch`, `@fontsource/montserrat`. Tailwind, Vite, TypeScript, ESLint, Vitest and the type generator are dev dependencies | An icon or component library: nothing in this spec needs one. |
| Versions | The website's majors: Vite 7, React 19.2, TypeScript 5.9, Tailwind 4, ESLint 9, `react-router` 7; Node 24 and npm 11 | Newer majors than the website: two upgrade paths for the same tools. |
| Docker Compose | Not now: `npm run dev` on the host against the API in Compose. How the admin is served is decided in the `deploy/` spec | An `admin` service with the Vite dev server: a bind mount, a container `node_modules` and file watching across the mount, for no gain over running on the host. One serving the build: needs the production serving decision first. |
| API origin | `VITE_API_BASE_URL`, default `http://localhost:8000`. It must be exactly an origin: `http` or `https`, a host, an optional port, no path, trailing slash, query, fragment or user info; `http` only for `localhost`. Validated in `vite.config.ts` by a small function that tests also cover. `admin/.env.example` lists it, commented out | A Vite dev proxy under a path such as `/api`: hides CORS until deployment and differs from the planned subdomain layout of spec 007. A runtime config file fetched at startup: one build for several environments, but an extra request before the app knows where the API is; the `deploy/` spec can revisit. Requiring the variable: makes a fresh clone fail to start. Accepted: a production build without it targets `localhost` and fails to log in, which is visible and sends nothing elsewhere. |
| Port | 5174 with `strictPort` for `dev` and `preview` | Vite's default of moving to the next free port: a different origin, which the API refuses with no readable error. |
| Session expiry | `not_authenticated` from any request made with a session ends it in the app; the login page shows a notice and returns to the path afterwards. The app also re-checks at `expires_at` and when a tab becomes visible after at least a minute hidden, so a user who comes back after the idle limit sees login at once rather than after filling a form | Periodic polling: each `/admin/me` counts as activity, so it would keep an idle session alive forever. Only reacting to 401: the user finds out on their next action. |
| Return path | The path and query string, in a `next` query parameter of `/login`. After login it is used only if it starts with a single `/`, has no backslash, and is not `/login`; otherwise the app goes home | Browser storage: R2 of Security. Any value: an open redirect. |
| `csrf_failed` | Re-fetch `/admin/me` once, retry the write once with the current token, then show an error. Safe because `require_admin` refuses before the route runs, so the refused write had no effect | Logging out: a token can be stale after a login in another tab replaced the session. Retrying without limit: hides a real fault. |
| Request failures | A request that fails without a response (API down, or this origin missing from `ADMIN_ORIGINS`, which the browser reports the same way) shows "cannot reach the API", naming both causes. A readable `origin_not_allowed` shows a configuration message naming `ADMIN_ORIGINS`. 5xx, 415, 422 and unknown codes show a generic message. Server text is never rendered | Showing the server's body: unknown content in the page. One message for everything: the owner could not tell a wrong password from a misconfiguration. |
| Logout failure | Stay logged in and show an error unless logout returns 204 (spec 007 returns 204 also when no session is left) | Forgetting the session locally on any error: the user on a shared computer would think they were logged out while the server session still works. |
| Unknown paths logged out | Login first, then the not-found page | A not-found page without a session: reveals which paths exist. |
| Search engines | `<meta name="robots" content="noindex, nofollow">` in `index.html`, which the app serves for every path; no sitemap; nothing on the website links to the admin. The `deploy/` spec adds an `X-Robots-Tag: noindex` header | `robots.txt` with `Disallow: /`: crawlers that obey it never fetch the page, never see `noindex`, and can still list the URL from links elsewhere; it also announces the path. |
| Content Security Policy | A CSP `<meta>` tag added to `index.html` at build time only: `default-src 'none'`; `script-src`, `style-src`, `font-src` and `img-src` `'self'`; `connect-src 'self'` plus the API origin; `base-uri 'none'`; `form-action 'none'`; `object-src 'none'`. Vite's asset inlining is turned off so fonts and images are files | No CSP: the requirement that requests go only to the API origin would rest on the code alone. In the dev server too: Vite's hot reload injects inline scripts. As a response header: needs the web server, which is the `deploy/` spec; `frame-ancestors` only works there (Follow-ups). |
| Guard rails in lint | ESLint rules fail on `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `navigator.sendBeacon` outside `src/api/client.ts`; on `localStorage`, `sessionStorage`, `indexedDB` and `document.cookie` anywhere; on `dangerouslySetInnerHTML`; and on `console.log`. A test runs ESLint on small samples to prove each rule fires | Code review only: easy to miss in later screens. |
| Login form | `method="post"` with no `action`, so a submit before the script runs never puts the password in the URL; `autocomplete` `username` and `current-password`; `maxlength` 64 and 1024 as in spec 007; the password is cleared after every failed attempt and is not kept after the request | A plain `<form>`: a native submit is a `GET` that puts both fields in the URL. |
| Layout | Header across the top, navigation in a sidebar on wide screens and a menu button below 768 px; the login page a centred form | Tabs only: no room for the sections still to come. |
| Branding | The logo, named "Combo Skin" for assistive technology, and "ADMIN" in capitals beside it, in the header and on the login page; no "Combo Skin admin" text there (owner's change, 2026-11-03). Document titles keep `<page> · Combo Skin admin` | The logo and the words "Combo Skin admin": the logo already says Combo Skin. |
| Sections | Two directions instead of one "Combos" section (owner's choice): By gloves at `/gloves` and By knife at `/knives`, the same path words as the website and the API catalog. Home shows both as links | One `/combos` section: the owner wants combos reached from the glove or the knife side. `/by-gloves` and `/by-knife`: longer, and unlike the website's paths. |
| Files | `admin/`: `package.json`, `package-lock.json`, `index.html`, `vite.config.ts` (Vite, Vitest, CSP and origin check), `tsconfig*.json`, `eslint.config.js`, `.env.example`, `.gitignore`, `README.md`, `scripts/api-types.mjs` (generate and `--check`), `scripts/check-bundle.mjs`; `src/main.tsx`, `src/App.tsx` (routes), `src/index.css`, `src/api/` (`schema.d.ts`, `client.ts`, `origin.ts`, `errors.ts`), `src/auth/` (session context, route guard, return path), `src/pages/` (Login, Home, ByGloves, ByKnife, NotFound), `src/components/` (layout, header, navigation), `src/test/` (fake API) | One `src/` folder per page with its own API calls: spreads requests across the app, which the client rule forbids. |
| CI workflow | `.github/workflows/admin.yml`, name `admin`, job `build`; triggers, permissions, concurrency, the same pinned checkout and setup-node SHAs, `persist-credentials: false` and Node 24 as `website.yml`, npm cache keyed on `admin/package-lock.json`; steps `npm ci`, `npm run api:types:check`, `npm run lint`, `npm test`, `npm run build` (which runs the type check), `npm run check:bundle` | `npm audit` in CI: depends on a live advisory service and fails on advisories unrelated to the change. Running the API in this workflow: see API in tests. |

**Follow-ups** (outside this spec):

- `api/`: a way to create a test admin without a terminal, for CI only, so an end-to-end login test can run against the Compose API.
- `api/`: if the merged spec 007 snapshot does not list the error codes as an enumeration, declaring them would let the admin type its error handling from the schema.
- `api/README.md`: its OpenAPI snapshot section should say to run `npm run api:types` in `admin/` after regenerating.
- `deploy/`: serve the admin build, set `VITE_API_BASE_URL` and `ADMIN_ORIGINS` for production, and send `X-Robots-Tag: noindex`, a CSP header with `frame-ancestors 'none'`, and HSTS.
- The combos spec: keep an unsaved combo form when the session ends mid-edit, and decide on a query library.

## API / data model

No API change. The app uses the three routes of spec 007 through the generated types.

**Configuration** (`admin/.env.example`, commented out):

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:8000` | API origin. Public: it ends up in the bundle, like every `VITE_` variable. |

**Routes:**

| Path | Without a session | With a session |
| --- | --- | --- |
| `/login` | Login page | Home |
| `/` | Login, then back | Home: links to By gloves and By knife |
| `/gloves` | Login, then back | By gloves placeholder |
| `/knives` | Login, then back | By knife placeholder |
| Anything else | Login, then back | Not found, in the shell |

**Login outcomes:**

| Response | What the user sees |
| --- | --- |
| 200 | The `next` path or home; header shows the username |
| 401 `invalid_credentials` | "Wrong username or password." Password cleared, username kept, focus on the password |
| 429 `too_many_attempts` | "Too many attempts." with the time left from `Retry-After`, counting down; submit disabled until it ends. Without a valid `Retry-After`: the message without a countdown, submit enabled |
| 403 `origin_not_allowed` | A configuration message naming `ADMIN_ORIGINS` |
| No response | "Cannot reach the API", naming the API not running and this origin missing from `ADMIN_ORIGINS` |
| Anything else | A generic error message |

Messages are shown in an element with `role="alert"`. While a login is in flight, submit is disabled. An empty field sends no request.

**Scripts** (`admin/package.json`):

| Script | Does |
| --- | --- |
| `dev` | Vite dev server on port 5174 |
| `build` | `tsc -b && vite build` |
| `typecheck` | `tsc -b` |
| `lint` | `eslint .` |
| `test` | `vitest run` |
| `preview` | Serves `dist/` on port 5174 |
| `api:types` | Regenerates `src/api/schema.d.ts` from `../api/openapi.json` |
| `api:types:check` | Exits 1 if `src/api/schema.d.ts` is stale |
| `check:bundle` | Checks `dist/` (Security S4 to S6) |

## Security

- S1. The source, the built files and the repository hold no secrets, tokens, passwords or accounts. The only environment variable the app reads is `VITE_API_BASE_URL`, and the README states that any `VITE_` variable is public.
- S2. The app writes nothing to `localStorage`, `sessionStorage`, IndexedDB or cookies. The CSRF token lives in memory only, and the session cookie stays HttpOnly and is never read by the app.
- S3. Requests with credentials go only to the configured API origin. No other module than the API client can make a network request, the client refuses a URL that is not a path on that origin, and the built CSP limits connections to the app's own origin and the API origin.
- S4. Nothing is loaded from a third-party host at runtime: fonts, scripts, styles and images are bundled, and the built `index.html` references no other host.
- S5. Admin pages carry `noindex, nofollow` for search engines.
- S6. The built `index.html` carries the Content Security Policy in Design, with no `'unsafe-inline'` or `'unsafe-eval'`.
- S7. The password and the CSRF token never appear in URLs, console output or rendered error messages. A login submit before the script runs cannot put the password in the URL.
- S8. After login the app only follows a return path inside the app.
- S9. The app never renders HTML from API responses.
- S10. The `admin` workflow has `contents: read` only, uses no secrets, runs on `pull_request` and not `pull_request_target`, pins every action to a commit SHA and does not persist checkout credentials.
- S11. Dependencies are installed from `package-lock.json` with `npm ci`, locally and in CI.

## Acceptance criteria

Commands run in `admin/` unless stated. "The fake" is the test fake API of Design.

**Project**

1. On a fresh clone with no `admin/.env`, `npm ci`, `npm run api:types:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` and `npm run check:bundle` each exit 0; `npm run build` prints no chunk-size warning.
2. `node -p "Object.keys(require('./package.json').dependencies).sort().join(' ')"` prints exactly `@fontsource/montserrat openapi-fetch react react-dom react-router`.
3. `npm run dev` serves the app at `http://localhost:5174`; with that port already in use, `npm run dev` and `npm run preview` exit with an error instead of using another port.
4. Unit tests of the origin check accept `http://localhost:8000` and `https://api.example.com`, and refuse `api.example.com`, `https://api.example.com/`, `https://api.example.com/v1`, `https://api.example.com?x=1`, `http://api.example.com`, `https://admin@api.example.com` and `*`. `VITE_API_BASE_URL=api.example.com npm run build` exits non-zero with an error naming `VITE_API_BASE_URL`.
5. `src/index.css` defines `--color-background: #0A0A0C` and `--color-accent: #00DE12` in `@theme` and sets Montserrat first in the font stack; after a build, the CSS in `dist/assets/` contains both colours and `dist/assets/` contains Montserrat font files. Manual: the login page and the shell show the dark background, the accent colour and Montserrat.

**API types and client**

6. `npm run api:types:check` exits 0 on the branch. After adding a property to a response schema in `api/openapi.json` without regenerating, it exits 1 naming `src/api/schema.d.ts`; `npm run api:types` then makes it exit 0 again. Neither command makes a network request or needs the API running.
7. Removing `csrf_token` from the login response in `src/api/schema.d.ts` makes `npm run typecheck` fail (manual, reverted afterwards); `src/api/` defines no hand-written request or response types for the API's routes.
8. Tests with the fake: every recorded request's URL starts with the configured origin followed by `/`, and its credentials mode is `include`; `GET /admin/me` and `POST /admin/login` carry no `X-CSRF-Token`; `POST /admin/logout` with a session carries the session's token; login sends `Content-Type: application/json`.
9. Tests: the client throws, without a request, when given an absolute URL, a path starting with `//`, or a path without a leading `/`.
10. A test: a write that gets 403 `csrf_failed` leads to exactly one `GET /admin/me` and one retry carrying the token from that response; a second `csrf_failed` shows an error and causes no further request; a 401 from that `/admin/me` goes to login.
11. A test runs ESLint on samples and checks that each rule in Design's guard rails fires: `fetch` in a page file, `localStorage`, `sessionStorage`, `indexedDB`, `document.cookie`, `dangerouslySetInnerHTML` and `console.log`; and that `fetch` in `src/api/client.ts` passes.

**Login and session**

12. Tests: on load the app sends one `GET /admin/me` and shows only a loading state until it answers; a 200 shows the shell with the username, a 401 shows the login page; neither shows the other first.
13. Tests: a successful login from `/login?next=%2Fgloves%3Fa%3D1` sends one `POST /admin/login` with the typed username and password and lands on `/gloves?a=1` with the username in the header; from `/login` it lands on `/`.
14. Tests: each login outcome in API / data model shows its message in a `role="alert"` element. For `invalid_credentials` the password field is empty, the username kept and the password focused. For 429 with `Retry-After: 90` (fake timers) submit stays disabled and the remaining time counts down until 90 seconds pass, then submit is enabled; with no or an invalid `Retry-After`, submit is enabled. A rejected `fetch` shows the "cannot reach the API" message, and a 500 with a body of `<b>x</b>` shows the generic message and not that text.
15. Tests: the login inputs are found by their labels, have `autocomplete` `username` and `current-password`, `maxlength` 64 and 1024 and `required`; the form has `method="post"` and no `action`; submitting with an empty field sends no request; a second submit while the first is in flight sends nothing.
16. Tests: visiting `/knives?a=1` without a session shows login and, after logging in, `/knives?a=1`. With a session, a request that gets 401 `not_authenticated` shows the login page with the session-ended notice and the current path in `next`, and a new login returns there.
17. Tests: after login with `next` set to each of `//example.com`, `https://example.com`, `/\example.com`, `javascript:alert(1)` and `/login`, the app lands on `/`.
18. Tests with fake timers: when `expires_at` passes, the app sends `GET /admin/me` and a 401 shows login with the notice. A tab that becomes visible after more than a minute hidden sends one `GET /admin/me`; one hidden for less than a minute sends none. Before `expires_at`, no `/admin/me` is sent while the tab stays visible and idle.
19. A test: `/login` with a session goes to `/`.
20. Tests: logout sends `POST /admin/logout` with the token; on 204 the login page shows and visiting `/gloves` afterwards shows login, not the placeholder. On 500, a readable `origin_not_allowed` or a rejected `fetch`, the shell stays with the username and an error is shown.

**Shell**

21. Tests: with a session the header shows the logo, named "Combo Skin", and "Admin" styled in capitals, without the text "Combo Skin admin", the username and a logout button; the login page shows the logo and an "Admin" heading in capitals, without that text either; the navigation has Home, By gloves and By knife links, in that order, and the current one has `aria-current="page"`; Home has a By gloves link to `/gloves` and a By knife link to `/knives`; `/gloves` and `/knives` show their placeholders; `/nope` shows the not-found page inside the shell with a link to `/`. Without a session, `/nope` shows login with `next=%2Fnope`.
22. Tests: the document title is `Home · Combo Skin admin`, `By gloves · Combo Skin admin`, `By knife · Combo Skin admin`, `Not found · Combo Skin admin` and `Log in · Combo Skin admin` on the matching pages.
23. Manual: at 375 px and at 1440 px wide, the login page, Home, By gloves and By knife show no horizontal scroll bar and the navigation is reachable.

**Security**

24. `npm run check:bundle` checks the built `dist/` and exits 1 if any of these fails: `index.html` has the robots meta tag of Design; it has the CSP meta tag of Design with `connect-src` equal to `'self'` and the built API origin, and without `'unsafe-inline'` or `'unsafe-eval'`; no `<script>`, `<link>`, `<img>` or CSS `url()` in `dist/` points to another host; every absolute `http` or `https` URL in `dist/` is the API origin or on the script's short, commented allow-list of URLs that are never fetched (such as XML namespaces and the React error reference). A test runs the check on small sample `dist` folders and shows it fails for an external font link, a missing robots tag and a CSP with `'unsafe-inline'`.
25. A test runs a full flow (load, failed login, login, a `csrf_failed` retry, logout) with known password and CSRF token values, and checks that `localStorage` and `sessionStorage` are empty, `document.cookie` is empty, no console method received either value, neither appears in `window.location` at any step, and neither appears in the rendered page except the password inside its input.
26. `grep -rhoE 'import\.meta\.env\.[A-Z_]+' src | sort -u` prints only `import.meta.env.VITE_API_BASE_URL` (and Vite's own `DEV`, `PROD` or `MODE` if used); `gitleaks dir admin --no-banner --redact` from the repo root, after a build, reports no findings.
27. Manual, against the local stack (see criterion 30), with `npm run build && npm run preview`: the browser console shows no CSP violations while logging in, reloading and logging out; the network panel shows requests only to `localhost:5174` and `localhost:8000`; the storage panel shows nothing in local or session storage and IndexedDB, and the only cookie is the API's HttpOnly session cookie.

**CI and docs**

28. `.github/workflows/admin.yml` passes `actionlint`; triggers on `push` and `pull_request` with no filters and no `pull_request_target`; sets `permissions: contents: read` only; every `uses:` references a 40-character SHA (the check of spec 001 criterion 4 prints nothing); has no `secrets.` reference; sets `persist-credentials: false`; sets up Node 24 with the npm cache keyed on `admin/package-lock.json`; runs the steps in Design in `admin/`; cancels superseded runs for the same ref.
29. After the branch is pushed, the `admin` workflow run for its latest commit succeeds on GitHub.
30. Manual, following `admin/README.md` literally on a fresh clone with spec 007 merged: the Compose stack starts from `api/.env.example`, an admin is created with spec 007's tool, and `npm run dev` at `http://localhost:5174`: login with a wrong password shows the wrong-credentials message; login works; a reload keeps the session; logout returns to login. With `ADMIN_ORIGINS` emptied in `api/.env` and the API restarted, logging in shows the "cannot reach the API" message. With `SESSION_IDLE_MINUTES=5` in `api/.env` and the API restarted, a tab hidden for more than five minutes shows login with the notice when it becomes visible, and logging in returns to the page it was on.
31. `admin/README.md` has the `admin` badge (`https://github.com/shb327/combo-skin/actions/workflows/admin.yml/badge.svg`, linking to `https://github.com/shb327/combo-skin/actions/workflows/admin.yml`) in its first five lines and sections for what the app is, prerequisites, getting started, scripts, configuration (including that `VITE_` values are public and the app must be opened at `localhost`), API types, tests and project structure.
32. The root `README.md` has the `admin` badge in its first five lines, an `admin/` row in its project table linking `admin/README.md`, and mentions only `deploy/` as planned; `THIRD_PARTY_NOTICES.md` credits Montserrat under the SIL Open Font License 1.1.
33. `git diff --stat main...008-admin-foundation -- api website compose.yaml` prints nothing.
34. The only URLs in the changed files point to `github.com/shb327/combo-skin`, public documentation, `localhost` addresses, or `example.com` placeholders; `gitleaks dir . --no-banner --redact` on a clean clone and `gitleaks git --log-opts="main..008-admin-foundation" --no-banner --redact` report no findings.

## Test plan

| Criterion | How it is checked |
| --- | --- |
| 1 | Fresh clone into a temporary directory, then the commands in criterion 1; read the build output |
| 2 | The command in criterion 2 |
| 3 | `npm run dev` and open the URL; manual: occupy port 5174 (for example with `npm run preview` in another terminal), then run `npm run dev` |
| 4 | Vitest: origin check tests; the build command in criterion 4 |
| 5 | Read `src/index.css`; `grep -il '0a0a0c' dist/assets/*.css`, `grep -il '00de12' dist/assets/*.css`, `ls dist/assets` shows Montserrat font files; manual look in the browser |
| 6 | The commands in criterion 6, with the snapshot edit discarded afterwards; run with networking off |
| 7 | Manual: edit, `npm run typecheck`, revert; read `src/api/` |
| 8, 9, 10 | Vitest: client tests with the fake |
| 11 | Vitest: lint rules test using ESLint's Node API |
| 12 to 20 | Vitest with Testing Library, `user-event` and fake timers: session and login tests |
| 21, 22 | Vitest: shell tests |
| 23 | Manual: browser developer tools at both widths |
| 24 | `npm run build && npm run check:bundle`; Vitest: bundle check tests on sample folders |
| 25 | Vitest: full flow test with console spies |
| 26 | The commands in criterion 26 |
| 27, 30 | Manual, with the local stack as described |
| 28 | `actionlint .github/workflows/admin.yml`; the grep checks from spec 001 criteria 4 and 5; `grep -n pull_request_target .github/workflows/admin.yml` prints nothing; read the workflow |
| 29 | The workflow run page for the branch's latest commit (checked after the owner pushes) |
| 31, 32 | `head -5 README.md admin/README.md`; read the README sections, the project table and `THIRD_PARTY_NOTICES.md` |
| 33, 34 | The commands in the criteria; `grep -rnoE 'https?://[^ )>"]+' README.md THIRD_PARTY_NOTICES.md admin .github/workflows/admin.yml --exclude-dir=node_modules --exclude-dir=dist` |

Section commands, run in `admin/`:

```bash
npm ci
npm run api:types:check
npm run lint
npm run typecheck
npm test
npm run build
npm run check:bundle
```

## Open questions

None. The owner chose every recommendation in Design: the CSRF token in memory only; `react-router` 7 with the typed client and small hooks, the query library left to the combos spec; `openapi-typescript` and `openapi-fetch` with the generated file committed; Vitest, Testing Library and a hand-written fake API; copying the colour tokens and the font; `npm run dev` on the host only; `VITE_API_BASE_URL` with a `localhost` default; a `noindex` meta tag now, an `X-Robots-Tag` header in `deploy/` and no `robots.txt`. The owner also replaced the single Combos section with two directions, By gloves and By knife (Design, Sections).

## Implementation notes

The branch was rebased onto `main` after spec 007 was merged (pull request 8), so `api/openapi.json` has the three admin routes. The merged API matches spec 007 as this spec describes it. Two details reach the generated types: the login password is a write-only password field, and errors are typed as `{"detail": string}`, not an enumeration of codes (the Follow-ups item stays open).

Locked versions: React 19.3.1, `react-router` 7.18.5, `openapi-fetch` 0.17.0, `openapi-typescript` 7.13.0, Vite 7.3.7, Vitest 5.1.0 with jsdom 29.1.1, TypeScript 5.9.3, Tailwind 4.3.4, ESLint 9.39.5, `@fontsource/montserrat` 5.3.0. They are the website's majors; React is a newer 19 minor than the website's 19.2.

### Deviations

None that change a requirement. Smaller additions and choices:

- **Files.** Besides those in Design: `src/auth/useSession.ts` holds the session context and hook, apart from the provider in `session.tsx`, because React's fast refresh lint rule wants component files to export only components. `src/pages/Placeholder.tsx` is shared by By gloves and By knife. Also `src/components/useTitle.ts` (page titles), `src/test/render.tsx` and `src/test/setup.ts` (test helpers), `src/vite-env.d.ts`, `src/logo.svg` (the website's logo), and the tests `src/lint.test.ts`, `src/flow.test.tsx`, `scripts/api-types.test.ts`, `scripts/check-bundle.test.ts`.
- **The client's interface.** `createApi` returns `me`, `login`, `logout`, and `request`, which is `openapi-fetch`'s typed `request` with the path check, the CSRF header, the retry and error mapping around it, for later screens. The client also refuses, in a middleware, any built request whose URL is not under the API origin, and its path check also refuses backslashes.
- **Lint exceptions.** The storage and cookie rules apply to tests too. The full-flow test reads `localStorage`, `sessionStorage` and `document.cookie` to prove they stay empty, with three line-level, commented exceptions.
- **After logout.** The login page shows without a return path. A page visited after that keeps its return path again, as R10 says.
- **A failed first `/admin/me`** for a reason other than 401 (the API down) shows the login page, where a login attempt then shows "cannot reach the API".
- **Bundle check allow-list.** URLs that are never fetched: the W3C namespaces under `http://www.w3.org/` (React and the logo), `https://react.dev/errors/` (React), `https://reactrouter.com/` and `https://github.com/ungap/url-search-params` (react-router warning text), and exactly `http://localhost`, react-router's base for parsing relative URLs. An entry ending in `/` allows everything under it; others match exactly.
- **Header on small screens (2026-11-03).** Found during the 375 px check (criterion 23): the product name and the logout button wrapped, and the username was cut to two letters. Below 640 px the logo is hidden and the username takes its own line.
- **A test race (2026-11-03).** The `admin` pull request run for commit fae1feb failed once in `returns to the requested path and query`: the address changes a moment before the shell renders, and the test looked for the username in between. It now waits for it.

- **Branding (2026-11-03, owner's change).** After implementation the owner asked for the logo and "ADMIN" in capitals, without the text "Combo Skin admin", in the header and on the login page. R16, criterion 21 and a Design row (Branding) were updated to match. The logo, now the only brand mark, also shows below 640 px.

### Changes after a review before the audit (2026-11-03)

An independent read of the tests and code against this spec, before the audit, found these. All are fixed with tests or recorded here; none changes a requirement.

Fixed in code:

- **Logout accepted any 2xx.** R14 and Design say only 204 ends the session. The client now treats any other status as a failure (`src/api/client.test.ts::logout`).
- **Per-request options could send a call elsewhere.** `request` passed its options to `openapi-fetch` unchanged, so a caller could give another `fetch`, base URL or middleware. Only `params`, `body`, `headers`, `signal` and `parseAs` are kept now, and the origin check moved into the client's `fetch`, after every middleware. A request outside the origin raises its own error, not "cannot reach the API" (`::per-request options`).
- **Redirects were followed.** Requests now use `redirect: 'error'`, so a redirect cannot carry the CSRF header to another host (`::requests`).
- **Return path.** `safeNext` returns the parsed path and query, and refuses one that parses to `//host` (for example `/.//example.com`) (`src/App.test.tsx::login::ignores the return path %s`).
- **Lint guard rails.** They now also catch the same names through any object (`window.navigator.sendBeacon`, `window.document.cookie`, `top.fetch`), aliases of `window`, `document`, `console` and the like, a spread `dangerouslySetInnerHTML`, and `.js` files under `src/` (`src/lint.test.ts`). The fake API's method is named `respond`, so the rule needs no exception for it.
- **Bundle check.** It now reads every HTML file with single or double quotes, unescapes `\/` in JavaScript, matches absolute URLs in any letter case, and reports protocol-relative URLs in strings and CSS imports (`scripts/check-bundle.test.ts`).
- `package.json` requires npm 11, and `admin/.gitignore` ignores every `.env*` file except `.env.example`.

Tests made stricter (criteria 12, 13, 14, 15, 21, 25): loading goes straight to the shell or to login, never showing the other in between (watched with a mutation observer); the username is found inside the header; the 500 message is exactly the generic text and the server's markup appears nowhere, even as text; submit stays disabled at 89 seconds of a 90-second `Retry-After`; an empty username, an empty password and a submit that skips the browser's `required` check send nothing; the placeholders' "comes in a later version" text is checked; the full-flow test records every address the app moves to and spies on every console method. Tests now render the app in `StrictMode`, as `main.tsx` does, and still see one `/admin/me`.

Recorded, unchanged:

- Design's Files lists header and navigation components; both are in `src/components/Layout.tsx`.

### Follow-ups

- The Content Security Policy is a `<meta>` tag; `frame-ancestors` needs the `deploy/` spec's response header (already in Design's follow-ups).
- On load, the app does not say that the API is unreachable until a login is tried.

### Criterion coverage

Test ids are relative to `admin/`.

| Criterion | Covered by |
| --- | --- |
| 1 | Fresh clone, no `admin/.env`: the seven commands exit 0; `npm run build` prints no chunk-size warning |
| 2 | `node -p "Object.keys(require('./package.json').dependencies).sort().join(' ')"` prints `@fontsource/montserrat openapi-fetch react react-dom react-router` |
| 3 | `npm run dev` serves http://localhost:5174 (used for criterion 30); with the port held, `npx vite` and `npx vite preview` exit 1 with "Port 5174 is already in use" |
| 4 | `src/api/origin.test.ts` (all values of the criterion, plus `#x`, `ftp:`, upper case and empty); `VITE_API_BASE_URL=api.example.com npx vite build` exits 1 with an error naming `VITE_API_BASE_URL` |
| 5 | `src/index.css`; the built CSS contains `#0a0a0c` and `#00de12` and `dist/assets/` has the Montserrat `woff2` and `woff` files; in the browser the pages use Montserrat (loaded from the bundle), background `rgb(10, 10, 12)` and the accent colour |
| 6 | `scripts/api-types.test.ts`; `npm run api:types:check` exits 0 |
| 7 | Removing `csrf_token` from `AdminSession` in `src/api/schema.d.ts` makes `tsc -b` fail in `client.ts` and `fakeApi.ts` (reverted); `src/api/` aliases the generated types and defines none of its own |
| 8 | `src/api/client.test.ts::requests` |
| 9 | `src/api/client.test.ts::requests::refuse %s without sending anything` |
| 10 | `src/api/client.test.ts::csrf_failed` (three tests); `src/App.test.tsx::csrf_failed twice`, `::session end::goes to login when the CSRF refresh finds the session ended` |
| 11 | `src/lint.test.ts` |
| 12 | `src/App.test.tsx::loading` (four tests, under `StrictMode`) |
| 13 | `src/App.test.tsx::login::returns to the requested path and query`, `::goes home without a return path` |
| 14 | `src/App.test.tsx::login::keeps the username and clears the password after wrong credentials`, `::counts down Retry-After and keeps submit disabled until it ends`, `::enables submit without a usable Retry-After`, `::shows a fixed message for %s` |
| 15 | `src/App.test.tsx::login::has labelled fields with the right attributes, in a post form`, `::sends nothing with an empty field, or while a login is in flight` |
| 16 | `src/App.test.tsx::session end::asks for login first, then returns to the path`, `::shows login with a notice when a request finds the session ended, and returns after` |
| 17 | `src/App.test.tsx::login::ignores the return path %s` |
| 18 | `src/App.test.tsx::session end::re-checks when expires_at passes`, `::re-checks after a minute hidden, not after less` |
| 19 | `src/App.test.tsx::login::sends a live session from /login to home` |
| 20 | `src/App.test.tsx::logout::ends the session after a 204`, `::stays logged in after %s` |
| 21 | `src/App.test.tsx::shell::has the header, the navigation and the placeholders`, `::shows not found inside the shell`, `::asks for login before not found` |
| 22 | `src/App.test.tsx::shell::titles %s`, `::titles the login page` |
| 23 | In the browser at 375 and 1440 px: the login page, Home, By gloves and By knife have `scrollWidth` equal to the window width; below 768 px the Menu button opens the navigation (`aria-expanded="true"`), above it the sidebar shows. The header fix under Deviations came from this check |
| 24 | `scripts/check-bundle.test.ts` (the three samples of the criterion and eleven more); `npm run build && npm run check:bundle` exits 0 |
| 25 | `src/flow.test.tsx` |
| 26 | The grep prints only `import.meta.env.VITE_API_BASE_URL`; `gitleaks dir admin --no-banner --redact` after a build: no leaks |
| 27 | Local stack from `api/.env.example`, `npm run build && npm run preview`: login, reload, logout, login, reload and logout show no CSP message in the console; the network list shows requests only to `localhost:5174` and `localhost:8000`; session storage and IndexedDB are empty, and the app added nothing to local storage or cookies. The browser used for the check already held another local app's entries for `localhost`, left untouched. A logout `POST` shows as aborted in the network list after its 204, because the client does not read the empty body; the app handles it as a success |
| 28 | actionlint 1.7.12 exits 0; no `uses:` without a 40-character SHA; no `secrets.` or `pull_request_target`; read the workflow |
| 29 | Commit fe06a1c: `admin` push run 41615586535 and pull request run 41615590588 succeeded (117 tests). The pull request run for fae1feb (41612274975) failed on the test race under Deviations |
| 30 | Fresh clone of the branch, `admin/README.md` followed literally with a throwaway Compose stack from `api/.env.example` and a placeholder admin made with spec 007's tool (both deleted afterwards): a wrong password shows the wrong-credentials message; login works; reloads keep the session; logout returns to login. With `ADMIN_ORIGINS` emptied and the API restarted, login shows "cannot reach the API". With `SESSION_IDLE_MINUTES=5` and the API restarted, a page hidden for 5 minutes 48 seconds shows login with the session-ended notice when visible again, and logging in returns to the page. The browser used cannot hide a tab, so hidden and visible were signalled by overriding `document.visibilityState` and firing `visibilitychange`, as the browser does |
| 31 | `admin/README.md` |
| 32 | `README.md`, `THIRD_PARTY_NOTICES.md` (Montserrat with the full SIL Open Font License 1.1) |
| 33 | `git diff --stat main...008-admin-foundation -- api website compose.yaml` prints nothing |
| 34 | URL grep of the changed files; `gitleaks dir .` and `gitleaks git` over the branch: no leaks |

## Audit

Filled in by the audit: one line per acceptance criterion (pass or fail, with evidence), the results of lint, tests, build and the secret scan, and a verdict of Pass, Pass with follow-ups, or Fail.
