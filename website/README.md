# Combo Skin website

[![website](https://github.com/shb327/combo-skin/actions/workflows/website.yml/badge.svg)](https://github.com/shb327/combo-skin/actions/workflows/website.yml)

Combo Skin helps CS2 players find good-looking glove and knife combinations, for themselves or for a friend.

## What the site does

In Counter-Strike 2, players equip cosmetic gloves and knives, each available in many finishes. Picking a pair that looks good together is hard when there are hundreds of options. Today a visitor can:

- **Browse gloves**: pick one of 8 glove types, then one of its finishes (72 in total).
- **Browse knives**: pick one of 20 knife types, then one of its finishes (576 in total).
- **See combos for a glove finish**: in-game screenshots of that glove paired with a knife, each with a rating, a short description and, where it matters, the pattern seed or float.
- **Search** gloves and knives by name from the top bar.

Combos are curated by hand and currently exist for a few glove finishes. Combos listed from the knife side (which gloves suit a given knife) are not implemented yet.

## Screenshots

![Home page with the "Find your perfect combo" heading and search-by-gloves and search-by-knives cards](docs/screenshots/home.png)

![Search by gloves: a grid of the eight glove types with the number of finishes for each](docs/screenshots/search-gloves.png)

![Combos for Specialist Gloves | Mogul: in-game screenshots of the gloves with an M9 Bayonet and a Karambit, each with a score](docs/screenshots/combos.png)

## Getting started

Prerequisites: [Node.js](https://nodejs.org/) 24 and [npm](https://docs.npmjs.com/) 11.

```bash
cd website
npm ci
npm run dev
```

Open the local address Vite prints (port 5173 by default). No `.env` file is needed; see Configuration for the optional settings.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the [Vite](https://vite.dev/) dev server with hot reload. |
| `npm run build` | Type-checks (`tsc -b`) and builds the production bundle into `dist/`. |
| `npm run lint` | Runs ESLint over the project. |
| `npm run preview` | Serves the production build from `dist/` locally. |

CI runs `npm ci`, `npm run lint` and `npm run build` on every push and pull request.

## Configuration

Optional settings live in `website/.env`, which is never committed (see [`.env.example`](.env.example)):

| Variable | Example | Meaning |
| --- | --- | --- |
| `DEV_ALLOWED_HOSTS` | `tunnel.example.com` | Optional. Comma-separated extra hosts the dev server accepts, for example a tunnel to your machine. Dev server only. |

Finish images load from Steam's image servers, using the URLs in `src/data/catalog.json` (see Data); the browser sends them no referrer. Glove and knife type images, combo screenshots and the home page artwork are stored in the repository, imported in code and bundled by the build.

`VITE_` variables are built into the client bundle, so never put a secret in `.env`.

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
| `src/data/` | The site's content: the generated knife and glove catalog (`catalog.json`, read by `gloves.ts` and `knives.ts`) and the curated combos (`combos.ts`). |
| `src/assets/` | Images bundled with the site: logos, glove and knife type images, combo screenshots. |
| `CS2_FINISHES.md` | Why knife finish counts differ between knives in CS2. |

The `@` import alias points to `src/`.

## Data

All content lives in `src/data/`.

**Knife and glove finishes** come from `catalog.json`: every knife and glove type in CS2 and every finish it can have, with its display name and a Steam image URL. It is generated from the game's item data by the API's catalog tooling, so never edit it by hand. To change the catalog, or the order types and finishes are shown in, see the Catalog section of [`api/README.md`](../api/README.md). The data comes from [ByMykel/CSGO-API](https://github.com/ByMykel/CSGO-API) under the MIT licence; see [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).

Type and finish slugs (`bloodhound`, `doppler-phase-2`) are the ones in the site's URLs, and they never change once assigned.

**Add a combo.** Put the screenshot in `src/assets/combos/<finish>/`, then in `src/data/combos.ts` import it at the top of the file:

```ts
import mogul5 from '@/assets/combos/mogul/5.jpeg'
```

Find the `gloveCombos` entry for the glove type and finish (or add one with `gloveTypeId` and `gloveFinishId`), and add a combo to its `combos`, using the import as the image. `gloveTypeId` and `gloveFinishId` are the catalog slugs from the finish's URL: `/gloves/specialist/mogul` is `specialist` and `mogul`.

```ts
{
  id: 'mogul-5',
  image: mogul5,
  knifeId: '',
  knifeName: 'Karambit | Doppler (Ruby)',
  rating: 8.5,
  description: 'A short note on why the pair works.',
  knifePattern: '412', // optional; also glovePattern, gloveFloat, knifeFloat
}
```

Always import images: a string path such as `'/src/...'` works on the dev server but is missing from the build, and CI fails the build check if one slips in. The `Combos` page lists every combo for the glove finish in the URL.
