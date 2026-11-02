# 006: Catalog follow-ups

**Status:** Approved
<!-- Lifecycle: Draft → Approved → Implemented → Audited -->

**Section:** api, website
**Branch:** 006-catalog-follow-ups

## Summary

Close the follow-ups from the audit of spec 005. Finishes and types that leave the game stay in the committed snapshot, marked retired, so their slugs stay reserved without a database and the display order no longer has to be edited when something is retired. A reused codename gets a named error, not a database error. The single-finish route says whether the finish's type is retired. The OpenAPI file stops advertising 404 on routes that cannot return it. The website's catalog moves into its own bundle chunk, and the catalog tests check every criterion as written.

## Goals and non-goals

**Goals**

- Retired types and finishes kept in `snapshot.json`, carried forward by `refresh`, with their slugs reserved there and in the database.
- `refresh` reports what was retired or came back since the previous snapshot.
- `import` refuses a new type that reuses a stored codename, with a message naming both types.
- `item_type.active` in the single-finish response.
- 404 declared only on the slug routes in the OpenAPI schema.
- A website build with no chunk-size warning.
- Stronger catalog tests where the spec 005 audit found them thinner than their criteria.

**Non-goals**

- Placing the 22 new glove finishes in `display_order.json`. That is the owner's choice, made by editing the file.
- Images in the search dropdown (agreed in spec 005 as later work).
- A new data source, new endpoints, combos, deployment, or any schema change.
- Lazy-loading the catalog with a dynamic import. A separate chunk is enough for now.

## Context

Spec 005 (`docs/specs/005-knife-glove-catalog.md`, Audited) built the catalog. It must be merged into `main` before this work starts, and this branch updated from `main`.

- `api/src/combo_api/catalog/source.py:79` `normalise` builds a snapshot only from the dataset. Slugs of the previous snapshot are kept (lines 94 to 122) only for entries still in the dataset. An entry that leaves the dataset disappears from the snapshot, and nothing in the repository remembers its slug. The audit reproduced a later refresh giving a retired slug to a different paint kit. Only `import` against a database holding the old row refuses it, so CI and the website export would accept it.
- `api/src/combo_api/catalog/validate.py:58` `order_problems` fails when `display_order.json` lists a slug the snapshot lacks, so today a retired finish blocks `refresh` until it is removed from that file (recorded in spec 005's Implementation notes; `api/README.md` step 2 of the refresh procedure says so).
- `api/src/combo_api/catalog/importer.py:42` `slug_problems` checks slugs against stored rows, but not codenames. A new type with a stored codename under a new definition index raises a database `IntegrityError` at the flush (line 119). The transaction still rolls back.
- `api/src/combo_api/catalog/importer.py:80` deactivates rows missing from the snapshot (lines 157 to 164). Rows are never deleted.
- `api/src/combo_api/catalog/routes.py:19` sets the 404 response on the router, so `api/openapi.json` lists 404 for `GET /knives` and `GET /gloves`. `ItemTypeRef` (line 54) has no `active` field; `get_finish` returns a finish whatever its type's state.
- `api/src/combo_api/catalog/validate.py:82` reports a duplicate definition index by number only, not the two types.
- `website/src/pages/Combos.tsx:32` renders the finish image with `referrerPolicy` and without `loading="lazy"`. It is the page's main image, at the top.
- `website/vite.config.ts` has no chunking configuration. `npm run build` puts `website/src/data/catalog.json` in the main chunk, 575 kB (162 kB gzipped), over Vite's 500 kB warning.
- Tests the spec 005 audit found thinner than their criteria, all in `api/tests/catalog/`: import (rows checked by count only), newer import (only Karambit's rows), inactive slug reuse (the new finish not asserted in the message), inactive finish (list `finish_count` not checked), validation (no `float_min == float_max` case), display order (tail counts loose), export check (output made stale, not the snapshot).

## Requirements

- R1. Every type and finish in `snapshot.json` has a `retired` flag.
- R2. `refresh` keeps every type and finish of the previous snapshot that is missing from the dataset, unchanged except `retired: true`. A retired type's finishes are all retired. An entry that comes back in the dataset is no longer retired and keeps its slug.
- R3. A new finish or type whose slug matches a retired one of the same type (finishes) or kind (types) fails `refresh`, naming both, as any other clash does.
- R4. `refresh` prints the types and finishes retired since the previous snapshot, and those no longer retired, next to the list of unplaced finishes.
- R5. `display_order.json` may list retired slugs. Retired entries are skipped when computing order, so retiring a finish never requires editing that file.
- R6. `import` stores retired entries as inactive, inserting them if the database has no row for them, so their slugs are reserved there too. Entries absent from the snapshot are still deactivated, never deleted.
- R7. `import` refuses, before writing, a type whose codename is stored on a row with another definition index, naming both types.
- R8. The website export, `unlisted`, and the API's lists and type routes leave retired entries out. The single-finish route returns retired finishes, and its `item_type` includes `active`.
- R9. The OpenAPI schema lists 404 only for the four slug routes.
- R10. `npm run build` emits the catalog as its own chunk and prints no chunk-size warning.
- R11. Validation messages for a duplicate definition index name both types.
- R12. The catalog tests check the spec 005 criteria as written, as listed in Acceptance criteria.

## Design

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| Where retired slugs live | In `snapshot.json`: retired entries are carried forward with `retired: true` (owner's choice) | A separate `retired_slugs.json`: a second file to keep in step, and the display order would still have to be edited by hand. Database only (today): CI and the website never see it. |
| Snapshot format | `retired` is written on every type and finish, `false` or `true`, so the format stays explicit and a retirement is a one-line diff | Writing it only when `true`: a format where a missing key means something. The one-time diff adding `"retired": false` to every entry is accepted. |
| Data of retired entries | Kept as last seen, including the image URL | Clearing fields: the single-finish route still serves them for combos that refer to them. |
| Clash check | The existing per-type and per-kind clash checks in `normalise` run over retired entries too | A separate reserved-slug list: same result, more code. |
| Ordering | `ordered_types` and `ordered_finishes` skip retired entries; validation still requires every display order slug to exist in the snapshot, retired or not | Removing retired slugs from the order file: the manual step R5 removes. |
| Import of retired entries | Upserted like any other, with `active: false`; positions are computed over active entries only, and a retired row keeps the position it had | Skipping retired entries: on a fresh database their slugs would not be reserved. |
| Codename check | Part of the import's pre-write checks, next to the slug checks | Catching `IntegrityError`: the message could not name both types reliably. |
| Retired type, single-finish route | 200 with the finish (`active: false`) and `item_type.active: false` (owner's choice) | 404: a combo saved with that finish could no longer load it. |
| 404 in OpenAPI | Declared on the four slug routes only, not on the router | Leaving it on the router: documents a response the list routes never return. |
| Combos page image | Stays eagerly loaded: it is the page's main image, at the top. Recorded here, no code change | `loading="lazy"`: delays the one image the page is about. |
| Bundle | `build.rollupOptions.output.manualChunks` puts `src/data/catalog.json` in a `catalog` chunk, loaded in parallel with the main chunk; no change to how code imports it | A dynamic `import()`: every page using the catalog would need a loading state. Raising `chunkSizeWarningLimit`: hides the warning without changing anything. |
| Refresh report | Printed to standard error after writing: "Retired since <old commit>", "Back since <old commit>", then the unplaced list | A separate command: the information is only useful at refresh time. |

## API / data model

**Snapshot** (`api/src/combo_api/catalog/snapshot.json`): each type and finish gains `"retired": false` or `true`. Nothing else changes.

**Single-finish response** (`GET /knives/{type_slug}/{finish_slug}`, `GET /gloves/{type_slug}/{finish_slug}`): `item_type` gains `active`:

```json
{"item_type": {"slug": "karambit", "name": "Karambit", "def_index": 507, "kind": "knife", "active": true}}
```

**OpenAPI:** `GET /knives` and `GET /gloves` list only `200`. The four slug routes list `200`, `404` and `422`.

**Tables:** no change, no migration.

**Website export:** no format change. Retired entries are not in it.

## Security

- S1. No new endpoint, setting, dependency or network access. `refresh` remains the only command that uses the network.
- S2. Retired entries pass the same validation as active ones, including the image host rule.
- S3. Workflows keep read-only permissions, SHA-pinned actions and no secrets.

## Acceptance criteria

1. Every type and finish in `snapshot.json` has a boolean `retired`. At the spec 005 source commit, all are `false`, and `refresh --commit <that commit>` reproduces the file byte for byte.
2. Normaliser tests on the raw fixture: a finish in the previous snapshot but not in the dataset is kept with its slug and data and `retired: true`; a type missing from the dataset is kept with every finish retired; an entry that comes back is `retired: false` with its old slug.
3. A normaliser test where a new paint kit derives the slug of a retired finish of the same type fails, naming both finishes. A type clash with a retired type fails the same way.
4. A refresh test checks that standard error lists the newly retired and the returned entries.
5. A validation test passes a display order that lists a retired finish, and a refresh test with such an order writes the snapshot.
6. Ordering and export tests: retired types and finishes are absent from `ordered_types`, `ordered_finishes`, `unlisted` and the website export.
7. Import tests: a retired entry with no row is inserted inactive; a retired entry with an active row is deactivated with the same `id`, slug and position; a later snapshot where it is no longer retired reactivates it with the same `id`.
8. An import test with a type whose codename is stored under another definition index fails with a `CatalogError` naming both types, and the catalog is unchanged.
9. An import test compares every snapshot entry with its row, field by field, after importing into an empty catalog.
10. The newer-snapshot import test also checks that the total row counts of both tables only grow.
11. The inactive-slug import test asserts that the message names the new finish by type, name and `def_index:paint_index`.
12. Route tests: after a deactivation, `GET /knives` reports the reduced `finish_count`; `GET /knives/{type}/{finish}` for a finish of a retired type returns 200 with `active: false` and `item_type.active: false`, while the type route returns 404.
13. A test checks that the OpenAPI schema lists 404 for the four slug routes and not for `GET /knives` or `GET /gloves`; `uv run python -m combo_api.openapi --check` exits 0.
14. Validation tests: `float_min == float_max` fails; a duplicate definition index message names both types; a duplicate finish slug message names its type.
15. The display order tests assert exactly 8, 7 and 7 unplaced finishes after the listed ones for Driver, Specialist and Sport Gloves, and none for every other type, in the API and in the export.
16. An export test changes a finish name in a copy of the snapshot and checks that `export-website --check` against the committed export exits 1.
17. In `website/`, `npm run build` exits 0, prints no "larger than 500 kB" warning, and `dist/assets/` contains a separate chunk holding the catalog; the main chunk is under 500 kB.
18. With `npm run preview`, `/knives/karambit` shows 35 finishes with loaded images and `/gloves/specialist/mogul/combos` shows the finish image loaded.
19. `api/README.md`'s refresh procedure no longer asks to remove retired finishes from `display_order.json`, and it explains retired entries and the refresh report.
20. In `api/`: format check, lint, mypy, pytest (no skipped tests), the OpenAPI check and `export-website --check` exit 0. In `website/`: `npm ci`, `npm run lint`, `npm run build` exit 0.
21. After the branch is pushed, the `api` and `website` workflow runs for its latest commit succeed on GitHub.
22. `gitleaks dir . --no-banner --redact` on a clean clone and `gitleaks git` over the branch report no findings.

## Test plan

| Criterion | How it is checked |
| --- | --- |
| 1 | pytest: snapshot tests; `refresh` with the recorded commit, then `git diff --exit-code` on the snapshot |
| 2, 3, 4, 5 | pytest: normaliser, refresh and validation tests on the raw fixture (no network) |
| 6 | pytest: snapshot ordering and export tests |
| 7, 8, 9, 10, 11 | pytest: import tests through `db_session` |
| 12, 13 | pytest: route and OpenAPI tests through `client`; the `--check` command |
| 14, 15, 16 | pytest: validation, ordering and export tests |
| 17 | `npm run build`, read the output; `ls -l dist/assets/` |
| 18 | `npm run preview`, open both pages, evaluate `[...document.querySelectorAll('img')].filter(i => i.src.includes('steamstatic.com') && i.naturalWidth === 0)` and confirm it is empty |
| 19 | Read `api/README.md` |
| 20 | The commands in criterion 20 |
| 21 | The workflow run pages for the branch's latest commit (checked after the owner pushes) |
| 22 | `gitleaks dir . --no-banner --redact`; `gitleaks git --log-opts="main..006-catalog-follow-ups" --no-banner --redact` |

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

## Open questions

None. The owner chose to keep retired entries in the snapshot and to return a retired type's finishes with `item_type.active: false`.

## Implementation notes

Filled in during implementation: deviations from the design and why, follow-ups discovered, and which test covers each acceptance criterion.

## Audit

Filled in by the audit: one line per acceptance criterion (pass or fail, with evidence), the results of lint, tests, build and the secret scan, and a verdict of Pass, Pass with follow-ups, or Fail.
