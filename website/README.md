# Combo Skin website

[![website](https://github.com/shb327/combo-skin/actions/workflows/website.yml/badge.svg)](https://github.com/shb327/combo-skin/actions/workflows/website.yml)

Combo Skin helps CS2 players find good-looking glove and knife combinations, for themselves or for a friend.

## What the site does

In Counter-Strike 2, players equip cosmetic gloves and knives, each available in many finishes. Picking a pair that looks good together is hard when there are hundreds of options. Today a visitor can:

- **Browse gloves**: pick one of 8 glove types, then one of its finishes (94 in total).
- **Browse knives**: pick one of 20 knife types, then one of its finishes (576 in total).
- **See combos for a glove or knife finish**: the knives that suit a glove finish, or the gloves that suit a knife finish, best rated first, each with a rating, both finish pictures, the pattern seeds and float ranges that suit it ("Any" where any will do), sometimes a short description, and a link to the other item's combos.
- **Search** gloves and knives by name from the top bar.

Combos come from the Combo Skin API ([`api/`](../api/README.md)): they are entered in the admin dashboard, and only published combos are shown. In-game screenshots of each combo are planned; until then a card shows the catalog pictures of its gloves and knife.

## Screenshots

![Home page with the "Find your perfect combo" heading and search-by-gloves and search-by-knives cards](docs/screenshots/home.png)

![Search by gloves: a grid of the eight glove types with the number of finishes for each](docs/screenshots/search-gloves.png)

![Combos for Specialist Gloves | Crimson Kimono: "18 combos" under the finish name, then cards for Karambit and M9 Bayonet | Doppler (Ruby), each with the glove and knife pictures side by side, a score, a "See all ... combos" link to the knife's page, and glove and knife pattern and float rows reading "Any"](docs/screenshots/combos.png)

## Getting started

Prerequisites: [Node.js](https://nodejs.org/) 24 and [npm](https://docs.npmjs.com/) 11.

```bash
cd website
npm ci
npm run dev
```

Open the local address Vite prints (port 5173 by default). No `.env` file is needed; see Configuration for the optional settings.

Combos pages read the API at `http://localhost:8000` by default. To see combos, start the API with Docker Compose as described in [`api/README.md`](../api/README.md); combos appear once they are published in the admin dashboard. Without the API, every other page works, and a combos page says "Combos could not be loaded." with a "Try again" button.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the [Vite](https://vite.dev/) dev server with hot reload. |
| `npm run build` | Type-checks (`tsc -b`) and builds the production bundle into `dist/`. |
| `npm run lint` | Runs ESLint over the project. |
| `npm test` | Runs the tests with [Vitest](https://vitest.dev/), against a fake API. |
| `npm run preview` | Serves the production build from `dist/` locally. |
| `npm run api:types` | Regenerates `src/api/schema.d.ts` from `../api/openapi.json`. Run it after the API's OpenAPI snapshot changes. |
| `npm run api:types:check` | Exits 1 if `src/api/schema.d.ts` is out of date. |

CI runs `npm ci`, `npm run api:types:check`, `npm run lint`, `npm test` and `npm run build` on every push and pull request.

## Configuration

Optional settings live in `website/.env`, which is never committed (see [`.env.example`](.env.example)):

| Variable | Example | Meaning |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `https://api.example.com` | Optional. The API's origin; `http://localhost:8000` when unset. Exactly an origin: `http` or `https`, a host and an optional port, with no path, trailing slash, query or user info; plain `http` only for `localhost`. Any other value stops the dev server and the build with an error naming the variable. |
| `DEV_ALLOWED_HOSTS` | `tunnel.example.com` | Optional. Comma-separated extra hosts the dev server accepts, for example a tunnel to your machine. Dev server only. |

Finish images load from Steam's image servers, using the URLs in `src/data/catalog.json` (see Data); the browser sends them no referrer. Combo cards show the same catalog pictures, from the URLs in the API's answer, and only from Steam's image host. Glove and knife type images and the home page artwork are stored in the repository, imported in code and bundled by the build.

The API answers the site's requests from any origin (see Public CORS in [`api/README.md`](../api/README.md)); the site sends them without cookies.

`VITE_` variables, including `VITE_API_BASE_URL`, are built into the client bundle, so never put a secret in `.env`.

To reach the dev server through a tunnel, add the tunnel's host to `website/.env` and restart `npm run dev`:

```bash
DEV_ALLOWED_HOSTS=tunnel.example.com
```

Without it, Vite answers requests for any other host with 403. `DEV_ALLOWED_HOSTS` has no `VITE_` prefix, so it never reaches the browser bundle. Keep real tunnel hosts in `.env` only, never in committed files.

## Project structure

| Path | Contents |
| --- | --- |
| `src/pages/` | One component per route: `Home`, `SearchGloves`, `GloveFinishes`, `SearchKnives`, `KnifeFinishes`, `Combos`. Routes are defined in `src/App.tsx`. |
| `src/components/` | Shared UI: app bar with search, hero, item cards, footer. |
| `src/api/` | The API client (`client.ts`, the only module that makes requests), its types generated from the OpenAPI snapshot (`schema.d.ts`), the combos query (`queries.ts`), and the API origin and picture host rules. |
| `src/data/` | The generated knife and glove catalog (`catalog.json`, read by `gloves.ts` and `knives.ts`). |
| `src/assets/` | Images bundled with the site: logos, glove and knife type images, the home page artwork (`hero/`). |
| `src/test/` | Test helpers: the fake API and a renderer for the whole site. Tests sit next to the code as `*.test.ts(x)`. |
| `CS2_FINISHES.md` | Why knife finish counts differ between knives in CS2. |

The `@` import alias points to `src/`.

## Data

**Knife and glove finishes** come from `catalog.json`: every knife and glove type in CS2 and every finish it can have, with its display name and a Steam image URL. It is generated from the game's item data by the API's catalog tooling, so never edit it by hand. To change the catalog, or the order types and finishes are shown in, see the Catalog section of [`api/README.md`](../api/README.md). The data comes from [ByMykel/CSGO-API](https://github.com/ByMykel/CSGO-API) under the MIT licence; see [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).

Type and finish slugs (`bloodhound`, `doppler-phase-2`) are the ones in the site's URLs, and they never change once assigned.

**Combos** are not in the repository. The combos pages ask the API for the published combos of their finish (`GET /gloves/{type}/{finish}/combos`, `GET /knives/{type}/{finish}/combos`) and show them in the order the API returns: highest rating first. Combos are added, rated and published in the admin dashboard ([`admin/`](../admin/README.md)).
