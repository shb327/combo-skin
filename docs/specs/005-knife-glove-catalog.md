# 005: Knife and glove catalog

**Status:** Audited
<!-- Lifecycle: Draft → Approved → Implemented → Audited -->

**Section:** api, website
**Branch:** 005-knife-glove-catalog

## Summary

Replace the hand-typed glove and knife lists with a catalog of every CS2 knife and glove finish, generated from the game's item data: item definition index, paint kit, names, rarity, float range and a working image for each finish. The API stores it in PostgreSQL, imports it from a committed snapshot with an idempotent command, and serves it through read endpoints. The website reads a static export of the same snapshot, so its finish images work again without the offline asset host and without any page URL changing. Combos, 3D viewers and the admin dashboard will all refer to finishes through this catalog.

## Goals and non-goals

**Goals**

- A committed, reviewed snapshot of every knife type and glove type in the game and every finish each one can have, with the game identifiers later features need.
- Stable slugs that keep every current website URL working.
- Catalog tables, a migration, and an import command that is safe to re-run after every game update.
- Read endpoints for knife types, glove types, their finishes, and one finish.
- Finish images that load on the website from a source that is online.

**Non-goals**

- Combos, admin login, the admin dashboard, and any write endpoint.
- Weapons other than knives, stickers, agents, keychains, and default (non-tradable) knives.
- StatTrak, souvenir, wear names, collections, cases, prices or pattern seeds as data.
- 3D viewing, and hosting images ourselves (including moving them to R2).
- The website calling the API, CORS, and deploying the API.
- Fetching data at import time or on a schedule. Refreshing the snapshot is a manual, reviewed step.
- A test runner for the website.

## Context

**Website**

- `website/src/data/gloves.ts` defines `Finish` (`id`, `name`), `GloveType`, and `gloveTypes`: 8 glove types with 72 finishes. `website/src/data/knives.ts` defines `KnifeType` and `knifeTypes`: 20 knife types sharing three hand-typed finish lists (35, 25 and 13 finishes, each including Vanilla and, where available, every Doppler and Gamma Doppler phase as its own finish), 576 finishes in all. Both have only slugs (`id`) and display names, and both export `getAllGloves` / `getAllKnives`, which build image URLs from `VITE_ASSET_BASE_URL`.
- `website/src/pages/GloveFinishes.tsx` and `website/src/pages/KnifeFinishes.tsx` each build finish image URLs as `<VITE_ASSET_BASE_URL>/<gloves|knives>/<type>/<finish>.png`. `website/src/pages/Combos.tsx` and `website/src/components/Search.tsx` use `getAllGloves` / `getAllKnives`. The host behind `VITE_ASSET_BASE_URL` is offline for good, so every finish image is broken. Type images (`SearchGloves.tsx`, `SearchKnives.tsx`) and combo screenshots are bundled from `website/src/assets/` and are not affected.
- `VITE_ASSET_BASE_URL` is declared in `website/src/vite-env.d.ts`, listed in `website/.env.example`, and documented in the Getting started and Configuration sections of `website/README.md`.
- Routes in `website/src/App.tsx`: `/gloves/:gloveId`, `/knives/:knifeId`, `/gloves/:itemId/:finishId/combos`, `/knives/:itemId/:finishId/combos`. Type and finish slugs are therefore part of public URLs. `website/src/data/combos.ts` refers to one glove finish by slug (`specialist` / `mogul`).
- `website/CS2_FINISHES.md` explains the knife finish tiers and states totals of 8 glove types and 72 glove finishes.
- The website has no test runner. `.github/workflows/website.yml` runs `npm ci`, `npm run lint`, `npm run build` and the `/src/` check from spec 003.

**API**

- `api/` (spec 002) serves only health and docs routes. Migrations: one revision, `0001_baseline`, with no tables. `api/tests/test_migrations.py::test_single_baseline_revision` asserts that `0001` is the only revision, and `::test_baseline_creates_only_version_table` checks the baseline's tables.
- `api/tests/conftest.py` provides `db_session` (rolled back after each test) and `client` (the app using that session). Spec 002's notes say tests that write rows go through these.
- The Docker image copies only the virtualenv, `src/`, `alembic.ini` and `migrations/`. `compose.yaml` runs `migrate` (one-shot `alembic upgrade head`) before `api`.
- `.github/workflows/api.yml` runs format check, lint, mypy, the OpenAPI snapshot check and pytest against PostgreSQL 18, then builds the image and runs a Compose smoke test.

**Data sources** (as checked on 2026-11-02)

- The game's item data is `items_game.txt`, with English names in `csgo_english.txt`. Both are published from each game update in the public SteamDatabase GameTracking-CS2 repository, which has no licence of its own; the content is Valve's. Which knives and gloves can carry which paint kit is not listed directly: it has to be derived from case and collection loot lists. The files contain no Steam image URLs. They also do not name Doppler phases: every Doppler paint kit's English name is "Doppler", and phases are a community convention keyed on the paint kit.
- ByMykel/CSGO-API (`github.com/ByMykel/CSGO-API`, MIT licence, copyright 2023 ByMykel) is a JSON dataset built automatically from those same game files on every update. Its `public/api/en/skins.json` gives, for each knife and glove finish: item definition index and codename, paint index and paint kit codename, English names, rarity (id, name, colour), float min and max, a `phase` field for Doppler and Gamma Doppler, and a Steam economy image URL. It lists Vanilla knives as entries with the knife's definition index and no paint index.
- At commit `cbe5eec1854bf882bf1d79d8d5fd2aac7d80e5bc` (2026-10-31) the dataset has 20 knife types with 576 finishes (including 20 Vanilla entries) and 8 glove types with 94 finishes. Its knife finishes match the website's lists exactly. Its gloves include 22 finishes the website lacks (8 Driver, 7 Specialist, 7 Sport).
- Talon Knife Doppler phases 1 to 4, Marble Fade and Damascus Steel are separate paint kits (852 to 856, 858) from the ones other knives use (418 to 421, 413, 410). A finish is therefore identified by its item definition index and paint index together, never by paint index alone.
- Deriving slugs from English names (rule in Design) reproduces all 28 current type slugs and 646 of the 648 current type and finish pairs. The two exceptions: Broken Fang Gloves | Yellow-banded (website `yellow-jacket`) and Moto Gloves | 3rd Commando Company (website `3rd-commando`).
- The dataset's knife and glove image URLs point to Steam's economy image CDN (a host under `steamstatic.com`) and return PNG images with transparent backgrounds.

## Requirements

- R1. A committed catalog snapshot lists every knife type and glove type in the game and every finish each can have. Each type has its kind (knife or glove), item definition index, codename, English name and slug. Each finish has its paint index, paint kit codename, English name, Doppler or Gamma Doppler phase where it has one, rarity, float min and max, image URL and slug.
- R2. Each Vanilla knife is a finish of its knife type with paint index 0, no paint kit codename and no float range. Each Doppler and Gamma Doppler phase is its own finish, named and slugged with its phase.
- R3. The snapshot records the source repository and the exact source commit it was generated from.
- R4. Every type slug and every type and finish slug pair on the website before this change exists in the catalog with the same slug.
- R5. Slugs never change once assigned. A refresh keeps the slug of every finish already in the snapshot, and the import refuses to change a slug already stored.
- R6. One command regenerates the snapshot from a named source commit. It refuses to write a snapshot that fails validation (R13), and it is the only step that needs network access.
- R7. The database holds the catalog in its own tables, created by a migration that upgrades and downgrades cleanly.
- R8. One command imports the committed snapshot into the database. Re-running it with the same snapshot changes nothing. Running it with a newer snapshot inserts new types and finishes, updates changed fields in place, and never deletes a row or changes a row's id or slug. Types and finishes no longer in the snapshot are marked inactive. The import writes everything or nothing.
- R9. The local Compose stack imports the catalog after migrating and before the API starts.
- R10. Read endpoints list knife types, list glove types, return one type with its active finishes, and return one finish by type slug and finish slug. Unknown slugs return 404.
- R11. The committed OpenAPI snapshot includes the new endpoints.
- R12. The website gets its types, finishes and finish images from a static export of the snapshot. Every finish card and combos page shows a loading image, no page URL changes, and nothing refers to `VITE_ASSET_BASE_URL` or the offline host.
- R13. Snapshot validation, run by the refresh, the import and the tests: definition indexes unique; slugs unique per kind (types) and per type (finishes) and in kebab-case; each painted finish has `0 <= float_min < float_max <= 1`; Vanilla has no float range; every finish named Doppler or Gamma Doppler has a phase from the known set; every image URL is HTTPS on a host under `steamstatic.com`; every slug in the display order file exists in the snapshot.
- R14. The source dataset's MIT licence is reproduced in the repository, and its use is attributed in the API and website READMEs.
- R15. Types and finishes appear in the website's current hand-made order, in both the API and the website. Finishes added by a game update appear after the ordered ones until they are placed by hand, and a refresh lists them.

## Design

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| Data source | ByMykel/CSGO-API `public/api/en/skins.json`, pinned to a commit. It is generated automatically from `items_game.txt` and the English translations on every game update, so its accuracy is the game files' accuracy, plus image URLs, phases and the knife-to-finish mapping already resolved | Parsing `items_game.txt` and `csgo_english.txt` ourselves: the most direct source, but deriving which knife can have which paint kit means walking case loot lists, phase names would still be a hand-kept table, and the files contain no image URLs, so a second source would be needed for images anyway. Recorded as a fallback if the dataset stops being maintained: the snapshot format does not depend on it. |
| Licence | MIT. Its copyright and permission notice is reproduced in `THIRD_PARTY_NOTICES.md` at the repo root, which also states that Counter-Strike item names and images belong to Valve and that the project is not affiliated with Valve. Both READMEs link to it | Attribution in a footer only: MIT asks for the notice itself to travel with copies of the data. |
| Image source | The Steam economy image URL from the dataset, stored and served as is, until the project has its own server for images. Moving later only changes the stored URLs | Images extracted from the game files and hosted by us: needs a VPK and texture extraction pipeline and storage, which is out of scope (R2 is a later decision). The dataset's own image mirror on GitHub raw: not a CDN, rate-limited, not meant for hotlinking. |
| Snapshot vs fetch at import | A normalised snapshot committed at `api/src/combo_api/catalog/snapshot.json`. Import and tests read only that file. `refresh` downloads the dataset at a given commit, normalises, validates and rewrites the snapshot; the diff is reviewed in a pull request | Fetching at import time: imports and CI would depend on a third-party host, results would change between runs, and a bad upstream change would land unreviewed. Committing the raw dataset file: 4.7 MB, mostly weapons and wear duplicates we do not use. |
| Source commit | The dataset's latest commit on the day implementation starts, recorded in the snapshot. Later game updates come in as reviewed refresh pull requests | `cbe5eec` (the latest when this spec was written): already stale by the time the work starts, for no benefit. |
| Snapshot location | Inside the package, so the Docker image contains it without a Dockerfile change | `api/data/`: the image does not copy it. |
| Snapshot format | JSON, sorted keys, two-space indent, trailing newline; types ordered by definition index, finishes by paint index; finish names without the `★` prefix | Unordered output: every refresh would produce a noisy diff. |
| Refresh | `uv run python -m combo_api.catalog refresh --commit <40-hex sha>` downloads with the standard library over HTTPS; a full commit SHA is required | Branch names: the same command would give different results on different days. httpx at runtime: a new runtime dependency for a developer-only command. |
| Slug rule | Lowercase the English name, remove apostrophes, replace every run of other non-alphanumeric characters with `-`, trim `-`. Type slugs drop a trailing "Knife" or "Gloves" word first (`Bowie Knife` → `bowie`, `Broken Fang Gloves` → `broken-fang`). Finish slugs use the name followed by the phase (`Doppler` + `Phase 2` → `doppler-phase-2`); Vanilla is `vanilla` | Paint kit codenames as slugs: not human-readable, and they do not match the current URLs. Numeric ids in URLs: would change every current URL. |
| Slug assignment and clashes | A finish already in the snapshot (same definition index and paint index) keeps its slug. Otherwise `api/src/combo_api/catalog/slug_overrides.json` (keyed `"<def_index>:<paint_index>"`) is used if it has an entry; otherwise the rule. It starts with the two legacy slugs: `"4725:10086": "yellow-jacket"` and `"5033:10080": "3rd-commando"`. If two finishes of one type end up with the same slug, refresh fails and names both, until an override is added | Suffixing clashes automatically (`-2`): the result depends on processing order and is invisible in review. Renaming the two legacy slugs: would break two live URLs. |
| Doppler and Gamma Doppler | Taken from the dataset's `phase` field; display name `Doppler (Phase 2)`, matching the website. Known phases: Phase 1 to 4, Ruby, Sapphire, Black Pearl, Emerald. A Doppler or Gamma Doppler finish with no phase, or an unknown phase, fails validation | A phase table of our own keyed by paint index: duplicates what the dataset maintains, and still has to be updated by hand when new Doppler paint kits appear. |
| Vanilla | Finish with `paint_index` 0 (the game's "default" paint kit), name `Vanilla`, no paint kit codename, null floats, the dataset's Vanilla image | A nullable paint index: breaks the unique key on type and paint index. Leaving Vanilla out: the website lists it today. |
| Type codename | The item's `weapon.id` from painted entries (`weapon_knife_karambit`, `slick_gloves`). Vanilla entries carry a HUD name instead and are matched to their type by definition index | Using the HUD name: not the item's codename. |
| Tables | `item_types` and `finishes`, with an integer identity `id` as primary key, the game identifiers as unique natural keys, and slugs unique per kind and per type. Combos will reference `finishes.id` | Natural composite keys as primary keys: wider foreign keys for every later table. One table per kind: two identical tables. |
| Removed items | Never deleted; `active` set to false. Inactive rows are left out of lists but still returned by the single-finish endpoint with `active: false`, and their slugs stay reserved | Deleting: would break future combos that reference them. |
| Import | `uv run python -m combo_api.catalog import`: validates the snapshot, then upserts in one transaction, matching types on definition index and finishes on type and paint index; fails without writing if a stored slug differs from the snapshot's or a new slug collides with an existing row, active or not; prints counts of inserted, updated, deactivated and unchanged rows. Rows whose fields did not change are not written, so `updated_at` stays put | Truncate and reload: changes ids and breaks references. An Alembic data migration: every game update would need a new migration. |
| Import in Compose | A one-shot `catalog` service (same image) after `migrate`; `api` waits for it to complete | Running the import inside `migrate`: mixes schema and data steps. Manual import only: the local API would serve empty lists. |
| Endpoints | `/knives`, `/knives/{type_slug}`, `/knives/{type_slug}/{finish_slug}` and the same under `/gloves`, mirroring the website's routes; tag `catalog` | One `/types?kind=` route: less readable docs and generated client names. `/finishes/{id}`: no caller needs numeric ids yet. |
| Ordering | The website's current order, kept by hand in `api/src/combo_api/catalog/display_order.json`: type slugs per kind, and finish slugs per type. It starts as an exact copy of the order in `gloves.ts` and `knives.ts` on `main`. Listed types and finishes come first in the listed order; unlisted ones follow, types by definition index and finishes by paint index. The import stores each row's position, and the API and the export both use it. `refresh` and `export-website` print every unlisted finish so it can be placed | Types by name and finishes by name: loses the owner's curated order. Failing the refresh until every new finish is listed: a game update would block on an ordering choice. |
| Website data | Static export `website/src/data/catalog.json`, generated from the snapshot by `uv run python -m combo_api.catalog export-website`; `--check` fails when it is stale and runs in the `api` workflow. `gloves.ts` and `knives.ts` keep their exported names (`gloveTypes`, `knifeTypes`, `getAllGloves`, `getAllKnives`) and build them from the export; `Finish` gains `image` | The website reading the API: it is not deployed with the API yet and has no client or CORS setup. A Node generator: a second implementation of the slug and ordering rules. |
| Export size | About 230 KB raw, under 50 KB gzipped, mostly image URLs; bundled with the site | Lazy-loading the JSON: not worth it at this size. Revisit if the catalog grows a lot. |
| Image element | Finish images keep their current markup, plus `loading="lazy"` and `referrerpolicy="no-referrer"` | No referrer policy: every page view would send the visitor's page URL to Steam's CDN. |
| Scope | One spec for the API and the website. The website part is small: two data files, two pages, one environment variable and documentation | Splitting the website into its own spec: possible, but images stay broken until both land, and the export is shared logic best tested together. |

## API / data model

**Snapshot** (`api/src/combo_api/catalog/snapshot.json`, abridged):

```json
{
  "item_types": [
    {
      "codename": "weapon_knife_karambit",
      "def_index": 507,
      "finishes": [
        {
          "float_max": null,
          "float_min": null,
          "image_url": "<Steam economy image URL>",
          "name": "Vanilla",
          "paint_codename": null,
          "paint_index": 0,
          "phase": null,
          "rarity": {"code": "rarity_ancient_weapon", "color": "#eb4b4b", "name": "Covert"},
          "slug": "vanilla"
        },
        {
          "float_max": 0.08,
          "float_min": 0.0,
          "image_url": "<Steam economy image URL>",
          "name": "Doppler",
          "paint_codename": "am_doppler_phase2",
          "paint_index": 419,
          "phase": "Phase 2",
          "rarity": {"code": "rarity_ancient_weapon", "color": "#eb4b4b", "name": "Covert"},
          "slug": "doppler-phase-2"
        }
      ],
      "kind": "knife",
      "name": "Karambit",
      "slug": "karambit"
    }
  ],
  "source": {
    "commit": "<40-hex source commit>",
    "file": "public/api/en/skins.json",
    "license": "MIT",
    "repository": "ByMykel/CSGO-API"
  }
}
```

**Tables** (migration `0002_catalog`):

`item_types`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | integer identity | Primary key |
| `kind` | text | `knife` or `glove` (check constraint) |
| `def_index` | integer | Unique |
| `codename` | text | Unique |
| `slug` | text | Unique with `kind` |
| `name` | text | |
| `position` | integer | Display order within its kind, set by the import |
| `active` | boolean | Default true |
| `created_at`, `updated_at` | timestamptz | Set by the import |

`finishes`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | integer identity | Primary key; what combos will reference |
| `item_type_id` | integer | Foreign key to `item_types.id`, `ON DELETE RESTRICT` |
| `paint_index` | integer | 0 for Vanilla; unique with `item_type_id` |
| `paint_codename` | text, nullable | Null only for Vanilla |
| `slug` | text | Unique with `item_type_id` |
| `name` | text | English finish name, e.g. `Doppler` |
| `phase` | text, nullable | e.g. `Phase 2`, `Emerald` |
| `rarity_code`, `rarity_name`, `rarity_color` | text | |
| `float_min`, `float_max` | double precision, nullable | Both null or both set, `0 <= float_min < float_max <= 1` (check constraint) |
| `image_url` | text | |
| `position` | integer | Display order within its type, set by the import |
| `active` | boolean | Default true |
| `created_at`, `updated_at` | timestamptz | Set by the import |

**Endpoints** (tag `catalog`; `{kind}` below is `knives` or `gloves`, each a separate route):

| Route | Operation IDs | Response |
| --- | --- | --- |
| `GET /knives`, `GET /gloves` | `list_knife_types`, `list_glove_types` | `200`, list of `TypeSummary`, active types only |
| `GET /{kind}/{type_slug}` | `get_knife_type`, `get_glove_type` | `200` `TypeDetail` with active finishes; `404` if no type of that kind has the slug |
| `GET /{kind}/{type_slug}/{finish_slug}` | `get_knife_finish`, `get_glove_finish` | `200` `FinishDetail`, including inactive finishes; `404` otherwise |

```json
// TypeSummary
{"slug": "karambit", "name": "Karambit", "def_index": 507, "codename": "weapon_knife_karambit", "finish_count": 34}

// TypeDetail: TypeSummary plus
{"finishes": [Finish, ...]}

// Finish
{
  "slug": "doppler-phase-2",
  "name": "Doppler",
  "phase": "Phase 2",
  "display_name": "Doppler (Phase 2)",
  "paint_index": 419,
  "paint_codename": "am_doppler_phase2",
  "rarity": {"code": "rarity_ancient_weapon", "name": "Covert", "color": "#eb4b4b"},
  "float_min": 0.0,
  "float_max": 0.08,
  "image_url": "<Steam economy image URL>",
  "active": true
}

// FinishDetail: Finish plus
{"item_type": {"slug": "karambit", "name": "Karambit", "def_index": 507, "kind": "knife"}}
```

Types and finishes are returned in display order (`position`). `finish_count` counts active finishes, Vanilla included. `404` bodies are FastAPI's default `{"detail": "Not Found"}`.

**Website export** (`website/src/data/catalog.json`, generated, not edited by hand):

```json
{
  "gloves": [{"id": "bloodhound", "name": "Bloodhound Gloves", "finishes": [{"id": "bronzed", "name": "Bronzed", "image": "<Steam economy image URL>"}]}],
  "knives": [{"id": "bayonet", "name": "Bayonet", "finishes": [{"id": "vanilla", "name": "Vanilla", "image": "<Steam economy image URL>"}]}],
  "source": {"commit": "<source commit>"}
}
```

`id` is the slug and `name` the display name, matching the existing `Finish`, `GloveType` and `KnifeType` interfaces. Only active types and finishes are exported, in display order.

**Display order** (`api/src/combo_api/catalog/display_order.json`, edited by hand):

```json
{
  "finishes": {
    "glove/bloodhound": ["charred", "bronzed", "guerrilla", "snakebite"],
    "knife/bayonet": ["vanilla", "autotronic", "black-laminate"]
  },
  "types": {
    "glove": ["bloodhound", "driver", "hand-wraps"],
    "knife": ["bayonet", "bowie", "butterfly"]
  }
}
```

**Commands** (run in `api/`):

| Command | Network | Database | Effect |
| --- | --- | --- | --- |
| `uv run python -m combo_api.catalog refresh --commit <sha>` | yes | no | Rewrites `snapshot.json` |
| `uv run python -m combo_api.catalog import` | no | yes | Upserts the snapshot |
| `uv run python -m combo_api.catalog export-website [--check]` | no | no | Writes or checks `website/src/data/catalog.json` |

**Layout** (new paths under `api/src/combo_api/catalog/`): `__main__.py` (commands), `source.py` (download and normalise), `slugs.py`, `validate.py`, `models.py`, `importer.py`, `routes.py`, `export.py`, `snapshot.json`, `slug_overrides.json`, `display_order.json`. Tests in `api/tests/catalog/`, with a small raw dataset fixture for the normaliser and a fixture of the 648 website slugs, in their current order, taken from `main` before this change.

## Security

- S1. The new endpoints are read-only and expose only the catalog fields listed above. No write route is added.
- S2. The import and refresh commands are not reachable over HTTP.
- S3. Refresh downloads only from the source dataset's public repository at an explicit full commit SHA, over HTTPS, and writes nothing unless validation passes. CI never runs it.
- S4. Every stored and served image URL is HTTPS on a host under `steamstatic.com`; validation rejects anything else, so the website never renders an image from a host chosen by upstream data.
- S5. Finish images are requested with no referrer.
- S6. Catalog text is rendered by React as text, never as HTML.
- S7. No new secrets, settings, or private hosts; workflows keep read-only permissions, SHA-pinned actions and no secrets.
- S8. The import runs as the existing database user through the existing settings; no new database role or privilege.

## Acceptance criteria

1. `snapshot.json` records repository `ByMykel/CSGO-API`, file `public/api/en/skins.json`, licence MIT and a 40-character commit, and `refresh --commit <that commit>` on a clean checkout reproduces the file byte for byte.
2. The snapshot has 20 knife types with 576 finishes (Bayonet, Bowie, Butterfly, Falchion, Flip, Gut, Huntsman, Karambit, M9 Bayonet and Shadow Daggers 35 each; Navaja, Nomad, Paracord, Skeleton, Stiletto, Survival, Talon and Ursus 25 each; Classic and Kukri 13 each) and 8 glove types with 94 finishes, the counts at dataset commit `cbe5eec` (2026-10-31). Any difference at the source commit actually used is listed in Implementation notes, and the tests assert the counts of that commit.
3. Tests check these entries in the snapshot: Karambit Vanilla (def 507, paint 0, no codename, null floats); Karambit Doppler Phase 2 (paint 419, `am_doppler_phase2`, `doppler-phase-2`, floats 0 to 0.08); Talon Knife Doppler Phase 1 (def 523, paint 852); Karambit Gamma Doppler Emerald (paint 568, `gamma-doppler-emerald`); Specialist Gloves Mogul (def 5034, paint 10064, `mogul`, rarity Extraordinary, floats 0.06 to 0.8).
4. A test checks that every type slug and type and finish slug pair in the website slug fixture exists in the snapshot with the same slug, including `broken-fang` / `yellow-jacket` and `moto` / `3rd-commando`.
5. Validation tests: a snapshot with a duplicate definition index, a duplicate finish slug in one type, a non-kebab-case slug, `float_min >= float_max`, a Vanilla with floats, a Doppler without a phase, an image URL on another host, an `http:` image URL, or a display order entry with no matching type or finish each fails validation with a message naming the offending entry.
6. Normaliser tests on the raw fixture: Vanilla entries become paint index 0 under their knife's type; `★` is stripped; a finish already in the previous snapshot keeps its slug even after its English name changes; an override is applied; two new finishes deriving the same slug in one type fail with both named; refresh with a branch name instead of a full SHA exits non-zero without network access.
7. `uv run alembic upgrade head`, `downgrade base`, `upgrade head` succeed; `uv run alembic check` reports no new operations; `uv run alembic history` lists `0001` and `0002`, and the migration tests are updated for the second revision.
8. A test imports the snapshot into an empty catalog through `db_session` and finds every type and finish, with the counts of criterion 2.
9. A test imports twice: the second run reports zero inserted, updated and deactivated rows, and no row's `id`, `slug` or `updated_at` changes.
10. A test imports, then imports a modified snapshot with one finish removed, one finish's image URL changed and one new finish added: the removed finish is inactive with the same `id`, the changed one keeps its `id` and slug with the new URL, the new one is inserted, and nothing is deleted. Importing the original snapshot again reactivates the removed finish with its old `id`.
11. A test imports a snapshot whose slug for an existing finish differs from the stored one, and another whose new finish reuses an inactive finish's slug: both fail with an error naming the finish, and the catalog is unchanged.
12. With the Compose stack up, `docker compose ps -a` shows `catalog` exited 0 after `migrate`, and `GET /knives` on the local API returns 20 types.
13. API tests: `GET /knives` returns 20 types in the website's current order (Bayonet first, Kukri last), each with `finish_count`; `GET /gloves` returns 8 (Bloodhound first, Broken Fang last); `GET /knives/karambit` returns 35 finishes in the current order (Vanilla, Autotronic, Black Laminate first); `GET /knives/karambit/doppler-phase-2` returns the Finish of criterion 3 with `display_name` "Doppler (Phase 2)" and its `item_type`; `GET /gloves/specialist/mogul` returns 200; `GET /knives/specialist`, `GET /gloves/karambit`, `GET /knives/karambit/nope` and `GET /knives/nope` return 404.
14. API tests: an inactive finish is missing from its type's list and from `finish_count`, and `GET` on its slug returns it with `active: false`; an inactive type is missing from the type list and returns 404 on its type route.
15. A test checks that, for every type, the active finishes in the slug fixture appear in the API and the export in exactly the fixture's order and before any finish not in the fixture; that the 22 glove finishes not on the website before this change follow, ordered by paint index; and that `refresh` and `export-website` print those unlisted finishes.
16. `api/openapi.json` contains the six routes with the operation IDs in API / data model, and `uv run python -m combo_api.openapi --check` exits 0.
17. `uv run python -m combo_api.catalog export-website --check` exits 0 on the branch, and exits 1 after any change to `snapshot.json` that affects the export; the `api` workflow runs it.
18. `grep -rn VITE_ASSET_BASE_URL website --exclude-dir=node_modules --exclude-dir=dist` prints nothing, and no source file under `website/src` builds an image URL from a base URL.
19. On a fresh clone with no `website/.env`, `npm ci && npm run lint && npm run build` exits 0 in `website/`.
20. With `npm run preview`, every finish image on `/gloves/specialist`, `/gloves/broken-fang`, `/knives/karambit` and `/knives/kukri` has loaded (`naturalWidth > 0`) and carries `referrerpolicy="no-referrer"`; `/knives/karambit` shows 35 finishes and `/gloves/specialist` shows 19.
21. With `npm run preview`, `/gloves/specialist/mogul/combos`, `/gloves/broken-fang/yellow-jacket/combos`, `/gloves/moto/3rd-commando/combos` and `/knives/karambit/doppler-phase-2/combos` each show the finish's name and loaded image, and search shows results with images for "Karambit Doppler".
22. `gzip -c website/src/data/catalog.json | wc -c` prints less than 65536.
23. `THIRD_PARTY_NOTICES.md` contains the dataset's MIT copyright line and permission notice and the Valve statement; `api/README.md` and `website/README.md` link to it.
24. `api/README.md` documents the catalog commands, the snapshot, the refresh procedure, the Compose `catalog` service and the new endpoints; `website/README.md` no longer documents `VITE_ASSET_BASE_URL`, explains where finish data and images come from, and explains how to add a combo with the catalog slugs; `website/.env.example` no longer lists `VITE_ASSET_BASE_URL`; `website/CS2_FINISHES.md` states the catalog's totals.
25. In `api/`: `uv run ruff format --check .`, `uv run ruff check .`, `uv run mypy`, `uv run pytest` (no skipped tests) and the OpenAPI check all exit 0; `docker build -t combo-skin-api api` exits 0 and the image stays under 250 MB.
26. After the branch is pushed, the `api` and `website` workflow runs for its latest commit succeed on GitHub.
27. The only URLs added are to `github.com/shb327/combo-skin`, the source dataset's public repository, public documentation, and the Steam image URLs inside `snapshot.json` and `catalog.json`; `gitleaks dir . --no-banner --redact` on a clean clone reports no findings.

## Test plan

| Criterion | How it is checked |
| --- | --- |
| 1 | Read the `source` block; run `refresh` with the recorded commit, then `git diff --exit-code` on the snapshot |
| 2, 3, 4, 5 | pytest: snapshot and validation tests in `api/tests/catalog/` |
| 6 | pytest: normaliser and refresh tests on the raw fixture (no network) |
| 7 | pytest: migration tests; `uv run alembic check`; `uv run alembic history` |
| 8, 9, 10, 11 | pytest: import tests through `db_session` |
| 12 | `cp api/.env.example api/.env && docker compose up -d --wait`, `docker compose ps -a`, `curl` the local API, `docker compose down -v` |
| 13, 14, 15 | pytest: endpoint tests through `client` |
| 16 | pytest: OpenAPI tests; the `--check` command |
| 17 | The command; manual: edit one finish name in the snapshot, run `--check`, see exit 1, discard; read the workflow |
| 18 | The grep in criterion 18; read `GloveFinishes.tsx`, `KnifeFinishes.tsx`, `gloves.ts`, `knives.ts` |
| 19 | Fresh clone, the commands in criterion 19 |
| 20, 21 | `npm run preview`, open each page, evaluate `[...document.querySelectorAll('img')].filter(i => i.naturalWidth === 0)` and confirm it holds no finish image; read each finish image's `referrerpolicy` |
| 22 | The command in criterion 22 |
| 23, 24 | Read the files |
| 25 | The commands in criterion 25; `docker image inspect combo-skin-api --format '{{.Size}}'` |
| 26 | The workflow run pages for the branch's latest commit (checked after the owner pushes) |
| 27 | `git diff main --stat`, then `git diff main -- . ':!api/src/combo_api/catalog/snapshot.json' ':!website/src/data/catalog.json' \| grep -oE 'https?://[^ )>"]+'`; `gitleaks dir . --no-banner --redact` |

Section commands. In `api/`, with the Compose database up:

```bash
uv sync --locked
uv run ruff format --check .
uv run ruff check .
uv run mypy
uv run pytest
uv run python -m combo_api.openapi --check
uv run python -m combo_api.catalog export-website --check
```

In `website/`:

```bash
npm ci
npm run lint
npm run build
```

In the repo root:

```bash
docker build -t combo-skin-api api
docker compose up -d --wait
docker compose down -v
```

## Open questions

None. The owner answered the questions of the first draft: the ByMykel dataset as source, Steam CDN images until the project has its own server, a static export for the website, a committed snapshot, the latest source commit when implementation starts, the website's current hand-made order, and one spec for API and website. The answers are recorded in Design.

## Implementation notes

Source commit: `cbe5eec1854bf882bf1d79d8d5fd2aac7d80e5bc`, still the dataset's latest when implementation started, so the counts in criterion 2 apply unchanged.

### Deviations

**2026-11-02, criterion 21, search results (agreed with the owner).** Criterion 21 says search shows results "with images" for "Karambit Doppler". The search dropdown in `website/src/components/Search.tsx` has never shown images: it lists names only, on `main` as on this branch. Search now lists every Karambit Doppler phase from the catalog, and each result opens a page whose image loads. Agreed reading: the criterion checks that search finds the catalog's finishes. Adding images to search is new work for a later spec.

Smaller changes, none affecting requirements:

- `api/src/combo_api/catalog/snapshot.py` holds the snapshot and display order shapes, loading, writing and ordering. The Layout list in API / data model did not name a module for these.
- The shared naming convention for unique constraints in `api/src/combo_api/db.py` now uses every column (`uq_<table>_<col>_<col>`) instead of the first only. Without it, the two composite unique constraints on `finishes` would get the same name. No existing constraint changed: the catalog tables are the first with unique constraints.
- `website/tsconfig.app.json` sets `resolveJsonModule`, which TypeScript needs to type the import of `catalog.json`.
- The `api` workflow's Compose smoke test also checks that `GET /knives` returns 20 types.

### Criterion coverage

Test ids are relative to `api/`.

| Criterion | Covered by |
| --- | --- |
| 1 | `tests/catalog/test_snapshot.py::test_snapshot_records_its_source`, `::test_snapshot_is_written_canonically`; `refresh --commit cbe5eec…` on the branch, then `git diff --exit-code` on `snapshot.json`: no change |
| 2 | `tests/catalog/test_snapshot.py::test_snapshot_counts` |
| 3 | `tests/catalog/test_snapshot.py::test_karambit_vanilla`, `::test_karambit_doppler_phase_2`, `::test_talon_doppler_phase_1_has_its_own_paint_kit`, `::test_karambit_gamma_doppler_emerald`, `::test_specialist_mogul` |
| 4 | `tests/catalog/test_snapshot.py::test_every_website_slug_is_kept` against `tests/catalog/fixtures/website_slugs.json` (648 pairs from `main`) |
| 5 | `tests/catalog/test_validate.py` (duplicate definition index, duplicate finish slug, non-kebab-case slug, float range, Vanilla floats, missing and unknown phase, three bad image URLs, display order entries without a type or finish) |
| 6 | `tests/catalog/test_source.py::test_vanilla_becomes_paint_index_zero_of_its_knife`, `::test_star_is_stripped_and_phases_are_kept`, `::test_existing_finish_keeps_its_slug_after_a_rename`, `::test_override_sets_a_new_finish_slug`, `::test_clashing_new_slugs_fail_naming_both`, `::test_refresh_needs_a_full_commit_and_no_network`, `::test_refresh_writes_nothing_when_validation_fails` |
| 7 | `tests/test_migrations.py::test_upgrade_downgrade_upgrade`, `::test_models_match_migrations`, `::test_revision_history`, `::test_head_has_only_known_tables`; `uv run alembic check`: no new operations; `uv run alembic history`: `0001`, `0002` |
| 8 | `tests/catalog/test_importer.py::test_import_into_empty_catalog` |
| 9 | `tests/catalog/test_importer.py::test_second_import_changes_nothing` |
| 10 | `tests/catalog/test_importer.py::test_newer_snapshot_updates_in_place_and_never_deletes` |
| 11 | `tests/catalog/test_importer.py::test_stored_slug_never_changes`, `::test_inactive_slug_is_never_reused` |
| 12 | `docker compose up -d --build --wait`: `migrate` and `catalog` exited 0 (`698 inserted`), `GET /knives` returned 20 types, Bayonet first and Kukri last; a second `docker compose run --rm catalog` reported `698 unchanged` |
| 13 | `tests/catalog/test_routes.py::test_knife_types_in_display_order`, `::test_glove_types_in_display_order`, `::test_knife_type_with_finishes`, `::test_one_finish`, `::test_unknown_slugs_return_404` |
| 14 | `tests/catalog/test_routes.py::test_inactive_finish_and_type` |
| 15 | `tests/catalog/test_routes.py::test_every_type_lists_finishes_in_display_order`, `tests/catalog/test_export.py::test_export_keeps_website_slugs_and_order`, `::test_export_lists_unplaced_finishes`, `tests/catalog/test_snapshot.py::test_display_order_keeps_the_website_order`, `::test_new_glove_finishes_are_unlisted`, `tests/catalog/test_source.py::test_refresh_writes_a_valid_snapshot_and_lists_unplaced_finishes` |
| 16 | `tests/catalog/test_routes.py::test_schema_lists_catalog_operations`; `tests/test_openapi.py::test_snapshot_is_up_to_date` |
| 17 | `tests/catalog/test_export.py::test_export_is_up_to_date`, `::test_check_fails_on_stale_export`; `.github/workflows/api.yml` runs `export-website --check` |
| 18 | The grep prints nothing; `GloveFinishes.tsx`, `KnifeFinishes.tsx`, `gloves.ts` and `knives.ts` use each finish's `image` |
| 19 | Fresh clone with no `website/.env`: `npm ci`, `npm run lint`, `npm run build` exit 0; `dist` has no `/src/` paths |
| 20 | `npm run preview`: `/gloves/specialist` 19 finishes, `/gloves/broken-fang` 4, `/knives/karambit` 35 (Vanilla, Autotronic, Black Laminate first), `/knives/kukri` 13; every finish image loaded (`naturalWidth` 512) with `referrerpolicy="no-referrer"` |
| 21 | `npm run preview`: the four combos pages show "Specialist Gloves \| Mogul", "Broken Fang Gloves \| Yellow-banded", "Moto Gloves \| 3rd Commando Company" and "Karambit \| Doppler (Phase 2)", each with its image loaded and no referrer. Search for "Karambit Doppler" lists Black Pearl, Phase 1 to 4 and Ruby, as agreed in the deviation above |
| 22 | `tests/catalog/test_export.py::test_export_is_small`; `gzip -c website/src/data/catalog.json \| wc -c` prints 48463 |
| 23 | `THIRD_PARTY_NOTICES.md` holds the licence text from the dataset at the source commit and the Valve statement; both READMEs link to it |
| 24 | `api/README.md` Catalog section, Getting started, Running and Endpoints; `website/README.md` Getting started, Configuration and Data; `website/.env.example`; `website/CS2_FINISHES.md` Catalog Totals |
| 25 | `uv run ruff format --check .`, `uv run ruff check .`, `uv run mypy`, `uv run pytest` (89 passed, 0 skipped), the OpenAPI check: all exit 0; image 226,025,709 bytes |
| 26 | Workflow runs on commit 39aa267: `api` 41509823993 (jobs `check` and `docker` succeeded) and `website` 41509823985 (job `build` succeeded) |
| 27 | URLs added outside the generated files: the dataset repository and its raw file URL template, the Steam image host, the local API address in CI, and `example.com` placeholders in validation tests. `gitleaks dir .` on a clean clone and `gitleaks git` over the branch: no leaks |

### Follow-ups

- The website's main bundle is now 575 kB (162 kB gzipped), over Vite's 500 kB warning, because `catalog.json` is bundled. The build still exits 0. Loading the catalog with a dynamic `import()` would split it out.
- When a finish leaves the game, `refresh` fails until its slug is removed from `display_order.json`, as R13 requires. `api/README.md` says so in the refresh steps.
- The 22 glove finishes new to the site appear after the ordered ones, by paint index, until they are placed in `display_order.json`.

## Audit

**Date:** 2026-11-02 · **Branch:** 005-knife-glove-catalog · **Commit:** 66227ef
**Verdict:** Pass with follow-ups

All checks ran on a fresh clone of the branch, with `api/.env` copied from `api/.env.example` and no `website/.env`. Test ids are relative to `api/`. Where a committed test is weaker than its criterion, the behaviour was also checked with throwaway tests run in the clone and not committed ("probe" below).

| # | Criterion | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Snapshot records its source; refresh reproduces it | Pass | `tests/catalog/test_snapshot.py::test_snapshot_records_its_source`, `::test_snapshot_is_written_canonically`; `refresh --commit cbe5eec…` in the clone, then `git diff --exit-code` on `snapshot.json`: exit 0 |
| 2 | 20 knife types with 576 finishes, 8 glove types with 94 | Pass | `tests/catalog/test_snapshot.py::test_snapshot_counts` checks every knife type's count |
| 3 | Five named entries | Pass | `tests/catalog/test_snapshot.py::test_karambit_vanilla`, `::test_karambit_doppler_phase_2`, `::test_talon_doppler_phase_1_has_its_own_paint_kit`, `::test_karambit_gamma_doppler_emerald`, `::test_specialist_mogul` |
| 4 | Every website slug kept | Pass | `tests/catalog/test_snapshot.py::test_every_website_slug_is_kept`; the fixture matches `gloves.ts` and `knives.ts` on `main` (648 pairs, compared by script) |
| 5 | Validation failures named | Pass | `tests/catalog/test_validate.py`: every listed case raises `CatalogError` with the entry's label; see findings on test strength |
| 6 | Normaliser rules; refresh needs a full SHA and no network | Pass | `tests/catalog/test_source.py`: Vanilla, `★`, rename keeps slug, override, clash names both, branch name and short SHA exit 1 with `urlopen` patched to fail, nothing written on failure |
| 7 | Migration round trip; two revisions | Pass | `tests/test_migrations.py::test_upgrade_downgrade_upgrade`, `::test_models_match_migrations`, `::test_revision_history`; `uv run alembic check`: "No new upgrade operations detected"; `alembic history`: `0001`, `0002` |
| 8 | Import into an empty catalog | Pass | `tests/catalog/test_importer.py::test_import_into_empty_catalog` (counts per kind); probe: every snapshot entry matches its row field by field |
| 9 | Second import changes nothing | Pass | `tests/catalog/test_importer.py::test_second_import_changes_nothing` compares `id`, `slug`, `updated_at` of every row; Compose re-run reports `698 unchanged` |
| 10 | Newer snapshot updates in place, never deletes | Pass | `tests/catalog/test_importer.py::test_newer_snapshot_updates_in_place_and_never_deletes`; probe: 671 finish rows and 28 type rows after the newer import |
| 11 | Changed or reused slugs refused, nothing written | Pass | `tests/catalog/test_importer.py::test_stored_slug_never_changes`, `::test_inactive_slug_is_never_reused`; probe: the error also names the new finish (`507:9999`) |
| 12 | Compose imports before the API starts | Pass | Clone: `docker compose up -d --wait` exit 0; `migrate` and `catalog` exited 0 (`698 inserted`); `GET /knives` returned 20 types, Bayonet first and Kukri last; `docker compose run --rm catalog`: `698 unchanged` |
| 13 | Endpoints, order and 404s | Pass | `tests/catalog/test_routes.py::test_knife_types_in_display_order`, `::test_glove_types_in_display_order`, `::test_knife_type_with_finishes`, `::test_one_finish`, `::test_unknown_slugs_return_404` (six paths) |
| 14 | Inactive finish and type | Pass | `tests/catalog/test_routes.py::test_inactive_finish_and_type`; probe: `GET /knives` reports Karambit's `finish_count` as 34 after Fade is deactivated |
| 15 | Display order in API, export, refresh output | Pass | `tests/catalog/test_routes.py::test_every_type_lists_finishes_in_display_order`, `tests/catalog/test_export.py::test_export_keeps_website_slugs_and_order`, `::test_export_lists_unplaced_finishes`, `tests/catalog/test_snapshot.py::test_display_order_keeps_the_website_order`, `::test_new_glove_finishes_are_unlisted` (22), `tests/catalog/test_source.py::test_refresh_writes_a_valid_snapshot_and_lists_unplaced_finishes` |
| 16 | Six operations in the OpenAPI snapshot | Pass | `tests/catalog/test_routes.py::test_schema_lists_catalog_operations`; `uv run python -m combo_api.openapi --check`: exit 0, also without `api/.env` |
| 17 | Export check fails when stale; runs in CI | Pass | `tests/catalog/test_export.py::test_export_is_up_to_date`, `::test_check_fails_on_stale_export`; manual: one finish renamed in `snapshot.json`, `export-website --check` exit 1, restored, exit 0; `.github/workflows/api.yml` runs it |
| 18 | No `VITE_ASSET_BASE_URL`, no image base URL | Pass | The grep prints nothing; `grep -rnE "import\.meta\.env\|BASE_URL" website/src` prints nothing |
| 19 | Clean website install, lint, build | Pass | Clone, no `website/.env`: `npm ci`, `npm run lint`, `npm run build` exit 0; no `/src/` in `dist` |
| 20 | Finish pages show loaded images with no referrer | Pass | `npm run preview` of the clone's build: `/gloves/specialist` 19, `/gloves/broken-fang` 4, `/knives/karambit` 35 (Vanilla, Autotronic, Black Laminate first), `/knives/kukri` 13; every finish image loaded (none failed), `referrerpolicy="no-referrer"`, `loading="lazy"` |
| 21 | Combos pages and search | Pass | The four combos pages show the finish name with its image loaded (`naturalWidth` 512) and no referrer; search for "Karambit Doppler" lists Black Pearl, Phase 1 to 4 and Ruby, under the reading agreed in Implementation notes |
| 22 | Export under 64 KiB gzipped | Pass | `gzip -c website/src/data/catalog.json \| wc -c`: 48463; `tests/catalog/test_export.py::test_export_is_small` |
| 23 | Notices and links | Pass | `THIRD_PARTY_NOTICES.md` matches the dataset's `LICENSE` at the source commit and has the Valve statement; both READMEs link to it |
| 24 | Documentation | Pass | `api/README.md` Catalog, Getting started, Running, Endpoints, Layout; `website/README.md` Getting started, Configuration, Data; `website/.env.example`; `website/CS2_FINISHES.md` Catalog Totals |
| 25 | API checks; image under 250 MB | Pass | Clone: format check, lint, mypy, pytest (89 passed, 0 skipped), OpenAPI check all exit 0; `docker build -t combo-skin-api api` exit 0, 226,029,038 bytes |
| 26 | CI succeeds on GitHub | Pass | Commit 66227ef: `api` and `website` runs succeeded (also on 39aa267, recorded in Implementation notes) |
| 27 | Only allowed URLs; no secrets | Pass | URLs added outside generated files: the dataset repository and raw-file template, the Steam image host, the local API in CI, and `example.com` placeholders in validation tests; gitleaks clean (below) |

| Check | Command | Result |
| --- | --- | --- |
| Lint | `uv run ruff format --check .`, `uv run ruff check .`; `npm run lint` | Pass |
| Type check | `uv run mypy` (strict) | Pass |
| Tests | `uv run pytest` (89 passed, 0 skipped), locally and in CI | Pass |
| Snapshot checks | `uv run python -m combo_api.openapi --check`, `uv run python -m combo_api.catalog export-website --check` | Pass |
| Build | `npm ci && npm run build`; `docker build -t combo-skin-api api`; `docker compose up -d --wait` | Pass |
| Secret scan | `gitleaks git --log-opts="main..005-knife-glove-catalog"`, `gitleaks dir .` on the clean clone | Pass |
| Public exposure | Manual review of the diff and log: no hosts, addresses or local paths beyond those in criterion 27; local tool configuration is ignored and nothing private or `.env` is tracked; all 12 commits authored by the owner with one-line messages and no trailers | Pass |
| Design conformance | Manual review and an independent read of the code against Design, API / data model and Security | Pass, with unrecorded minor differences (see findings) |

**Findings**

- (follow-up) Slug reservation lives only in the database. A finish that leaves the game drops out of the next snapshot, and its slug is then removed from `display_order.json`. After that nothing in the repository remembers it, so a later refresh can give the same slug to a different finish (probe: a new paint kit named like a retired one derives the retired slug). Refresh, validation, the export check and CI all pass. Only `import` against a database holding the old row refuses it. The website export would serve the retired URL for the new finish. Fix: keep retired entries in the snapshot (or a committed list of retired slugs) and check new slugs against it in `refresh`.
- (follow-up) A new type that reuses an inactive type's codename under a new definition index passes the slug checks, then fails `import` with a database `IntegrityError` instead of a named `CatalogError`. It still writes nothing (probe). Validation should check codenames against stored rows too.
- (follow-up) Unrecorded difference: the item image in the `website/src/pages/Combos.tsx` header has `referrerPolicy` but not `loading="lazy"`, which Design asks for on finish images. It sits above the fold, so eager loading is reasonable; record it or add the attribute.
- (follow-up) Unrecorded difference: `api/src/combo_api/catalog/routes.py` declares the 404 response on the router, so `api/openapi.json` lists 404 for `GET /knives` and `GET /gloves`, which never return it. API / data model lists 404 only for the slug routes.
- (follow-up) The spec does not say what the finish route returns when its type is inactive. The code returns the finish (200) while the type route returns 404. Decide and record it.
- (follow-up) Tests are thinner than some criteria, though the probes confirm the behaviour. Criterion 8 checks counts per kind, not every row's fields. Criterion 10 checks only Karambit's rows. Criterion 11 does not assert that the offending finish is named. Criterion 14 does not check `finish_count` on `GET /knives` after a deactivation. Criterion 5's float case does not try `float_min == float_max`, and its duplicate-index message does not name the two types. Criterion 15's API test allows 7 or 8 trailing finishes instead of asserting 8, 7 and 7. Criterion 17's test makes the output stale rather than the snapshot.
- (follow-up) Recorded in Implementation notes, still open: the website bundle is 575 kB (162 kB gzipped), over Vite's warning; refresh fails while `display_order.json` lists a finish that left the game; the 22 new glove finishes are not placed yet.
