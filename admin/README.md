# Combo Skin admin

[![admin](https://github.com/shb327/combo-skin/actions/workflows/admin.yml/badge.svg)](https://github.com/shb327/combo-skin/actions/workflows/admin.yml)

The admin dashboard for Combo Skin: a Vite, React and TypeScript app where the owner and the admins they create manage the site. It logs in against the API in [`api/`](../api) and talks to it only through a client typed from the API's OpenAPI snapshot. It has login, the session, and the screens that enter and manage combos (see [Screens](#screens) and [`docs/specs/`](../docs/specs)).

## Prerequisites

- [Node.js](https://nodejs.org/) 24 and npm 11.
- The API running locally, for logging in: see [`api/README.md`](../api/README.md). It needs [Docker](https://docs.docker.com/get-started/) with Compose v2.

## Getting started

From the repository root, start the API with the example settings. They allow this app's origin, `http://localhost:5174`, in `ADMIN_ORIGINS`, and turn off the Secure cookie flag for plain http:

```bash
cp api/.env.example api/.env
docker compose up -d --wait
```

Create an admin account. The command asks for the password twice at a hidden prompt:

```bash
docker compose exec api python -m combo_api.admins create <username>
```

Then run the app:

```bash
cd admin
npm ci
npm run dev
```

Open http://localhost:5174 and log in. Use `localhost`, not `127.0.0.1`: the session cookie belongs to the API at `localhost:8000`, and the browser sends it only to the same site.

If login says it cannot reach the API, check that the API is running, and that `ADMIN_ORIGINS` in `api/.env` lists `http://localhost:5174`. An `api/.env` copied before admin login existed lacks that line; copy the admin lines from `api/.env.example` and restart the API.

## Screens

- **Home**: the two directions, By gloves and By knife; the number of combos and how many glove and knife finishes still have none; then how many drafts exist across all finishes, with **Publish all drafts** (asks first; unpublished combos stay unpublished), then links to the knife order and the screenshots page, which are not in the navigation.
- **By gloves** (`/gloves`): search for a glove finish by any words of its type and name ("kimono spec"), or browse: the glove types are listed under the search, and each type's page (`/gloves/<type>`) lists its finishes with their float range and how many combos and drafts each has. A finish's page shows its combos: knife, rating, conditions and status, with filters by status and knife finish and sorting by rating or last change. From there, **Add knife** creates one combo, and **Start a batch** enters many.
- **Batch**: pick a knife finish name (Ruby, Blue Steel, ...). Every knife type that has it is listed in the knife order, ticked; a knife type already paired with these gloves shows as "already exists", unticked, and can be ticked to update its rating and description; it keeps its current description unless you type one. The top rating fills the next knives 0.05 lower each, never below 0; any rating can be typed by hand, and the knives below follow it. Float ranges, pattern seeds, the screenshot agent and the description apply to every knife, and each knife can have its own (a knife's own agent can be "Default" while the batch has another). Save creates everything as drafts, all or nothing, then offers to publish the new combos.
- **By knife** (`/knives`, `/knives/<type>`): the same for knives, searched or browsed by type, adding gloves one at a time.
- **Edit** (`/combos/<id>`): rating, float ranges, pattern seeds, screenshot agent and description, saved with the version that was read. If someone else saved first, the page shows their values and yours, and you keep yours or take theirs. Publish, unpublish, and delete a draft or unpublished combo.
- **Knife order** (`/knife-order`): move knife types up, down or to a position, then save. Shared by every admin.
- **Screenshots** (`/screenshots`): the default agent, used by every combo without its own screenshot agent, with how many combos use it. Choosing another asks first.

**Screenshot agents.** Every combo form has a screenshot agent: the agent whose arms hold the knife and gloves in the combo's screenshot. It shows the chosen agent's picture and name, or "Default" with the default agent's; search by any words of a name (`darryl`, `nswc`) and pick with the keyboard, or choose **Use default**.

Ratings are typed with a dot or a comma and shown with two decimals; the Up and Down arrow keys step by 0.05. Float values take up to 4 decimals and must lie inside the finish's own range.

**Unsaved changes** are kept in memory, never in browser storage. When the session ends (60 minutes idle, or its 12-hour limit) with a form or batch unsaved, logging in again as the same admin in the same tab brings back every value, with a notice and a way to discard them. Leaving a form for another page keeps its values too. They are lost on a reload or a closed tab, which the browser warns about first; logging out asks before discarding them, and logging in as another admin discards them.

## Scripts

Run from `admin/`.

| Script | Does |
| --- | --- |
| `npm run dev` | Dev server at http://localhost:5174. Fails if the port is taken, instead of moving to another one the API would not allow |
| `npm run build` | Type check, then production build into `dist/` |
| `npm run typecheck` | Type check only (`tsc -b`) |
| `npm run lint` | ESLint |
| `npm test` | Vitest, once |
| `npm run preview` | Serves `dist/` at http://localhost:5174 |
| `npm run api:types` | Regenerates `src/api/schema.d.ts` from `../api/openapi.json` |
| `npm run api:types:check` | Exits 1 if `src/api/schema.d.ts` is out of date |
| `npm run check:bundle` | Checks `dist/` after a build: robots and Content Security Policy tags, nothing loaded from another host, no unexpected absolute URLs |

## Configuration

The app reads one setting, at build time:

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:8000` | The API origin: `http` or `https`, a host and an optional port, with no path or trailing slash. Plain `http` only for `localhost`. An invalid value stops `npm run dev` and `npm run build` with an error naming the variable |

Set it in the environment or in `admin/.env.local` (see [`.env.example`](.env.example)). Every `VITE_` variable is public: Vite writes its value into the built JavaScript. Never put a secret in one.

The built `index.html` carries a Content Security Policy that allows connections only to the app's own origin and this API origin, so a build talks only to the API it was built for. The dev server has no policy, because hot reload injects inline scripts.

## API types

`src/api/schema.d.ts` is generated by [openapi-typescript](https://openapi-ts.dev/) from the API's committed snapshot, `api/openapi.json`, and committed. Do not edit it by hand. Request and response types come only from it, and [openapi-fetch](https://openapi-ts.dev/openapi-fetch/) uses it to type each call.

After the API changes and `api/openapi.json` is regenerated (`uv run python -m combo_api.openapi` in `api/`), regenerate the types in the same pull request:

```bash
npm run api:types
```

The `admin` workflow runs `npm run api:types:check` and fails if they are out of date. Neither command needs the API running or the network.

## Tests

```bash
npm test
```

Tests use Vitest with jsdom and Testing Library, next to the code as `*.test.ts(x)`. They run against a fake API (`src/test/fakeApi.ts`, with a small catalog and combo store in `src/test/fakeCatalog.ts`): a `fetch` function that answers the login, catalog and combo routes with bodies typed from the schema and records every request. Login against the real API is checked by hand (see Getting started), because an admin can only be created at an interactive terminal.

Lint guard rails, tested in `src/lint.test.ts`: only `src/api/client.ts` may make network requests; nothing may use `localStorage`, `sessionStorage`, IndexedDB or `document.cookie`, render HTML from strings, or call `console.log`. The rules also catch these through other objects (`window.document.cookie`) and refuse aliases of browser globals (`const d = document`), so they cannot be sidestepped by accident.

## Project structure

| Path | Contents |
| --- | --- |
| `index.html` | Page shell, with the robots meta tag |
| `vite.config.ts` | Vite and Vitest configuration, the API origin check, the Content Security Policy |
| `eslint.config.js` | ESLint, with the guard rails |
| `scripts/api-types.mjs`, `scripts/check-bundle.mjs` | API types generation and check; the build check |
| `src/combos/` | Shared pieces of the combo screens: value parsing and checks, the batch rating fill and rows, finish search, the screenshot agent picker, mapping API refusals to fields, server state with TanStack Query, the unsaved changes store, and the form components |
| `src/main.tsx`, `src/App.tsx` | Entry point; routes |
| `src/index.css` | Tailwind, the website's colour tokens, Montserrat |
| `src/api/` | `schema.d.ts` (generated), `client.ts` (the only network code), `errors.ts` (messages), `origin.ts` (origin check) |
| `src/auth/` | Session provider and hook, the route guard, the return path after login |
| `src/components/` | Layout with header and navigation; page titles |
| `src/pages/` | Login, Home, finish search with the type grid, type pages and finish pages for both directions, add, batch, edit, knife order, screenshots, Not found |
| `src/test/` | Fake API, render helper, test setup |
