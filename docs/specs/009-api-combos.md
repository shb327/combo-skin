# 009: Combos API

**Status:** Audited
<!-- Lifecycle: Draft → Approved → Implemented → Audited -->

**Section:** api, admin
**Branch:** 009-api-combos

## Summary

Add combos to the API: a combo recommends one glove finish and one knife finish from the catalog as a pair, with a rating, an optional description, and optional float ranges and pattern seeds for each item. Admins create, edit, publish, unpublish and remove combos one at a time or in batches (one glove finish, one knife finish name, many knife types), and keep the knife order that batches follow. The public reads published combos for a glove finish or a knife finish. The owner enters the first 200 combos, and later about 2,000, through the admin dashboard, whose combo screens are the next spec; this spec gives them the data and the endpoints.

## Goals and non-goals

**Goals**

- Tables for combos and the knife order, created by migration `0004`, referring to catalog finishes and recording who created and last changed each combo, and when.
- Admin endpoints behind `require_admin`: create, read, list with filters, update, publish, unpublish and remove combos; the finish names a batch can use; batch candidates; saving a batch in one request, all or nothing; reading and replacing the knife order.
- Public endpoints: the published combos of a glove finish and of a knife finish, sorted by rating.
- Validation against the catalog: float ranges inside the finish's own range, pattern seeds in the game's range, ratings with at most 2 decimals, retired finishes refused for new combos, length limits.
- The OpenAPI snapshot, the admin app's generated API types and `api/README.md` updated; tests for every criterion against the real database.

**Non-goals**

- The dashboard's combo screens, including the batch screen with its rating step and batch-wide rules (see Design, Batch defaults).
- Screenshots and image uploads (R2 is its own spec), automatic screenshots.
- The website reading combos from the API.
- Pattern groups (blue gems, fades and similar) as data, combo variations (several combos for one pairing), prices.
- A per-combo public page or route.
- Two-factor login, roles, and deployment.
- A command that exports and imports combos alone. Combos move to the server's database with a whole-database dump and restore (Design).

## Context

Specs 005 to 008 are Audited and merged into `main`.

- **Catalog** (specs 005, 006). `api/src/combo_api/catalog/models.py`: `item_types` (`kind` `knife` or `glove`, `def_index`, `codename`, `slug` unique per kind, `position`, `active`) and `finishes` (`item_type_id`, `paint_index` unique per type, `slug` unique per type, `name`, `phase`, rarity, `float_min` and `float_max` as `double precision`, both null for Vanilla, `image_url`, `position`, `active`). Rows are never deleted; ids never change; slugs never change and stay reserved when an entry is retired. A retired type's finishes are all retired. The module docstring says combos will reference `finishes.id`. Catalog ids are identity values assigned by `import` in insertion order, so two databases imported from different snapshot histories can give one finish different ids.
- 20 knife types (slugs `bayonet`, `bowie`, `butterfly`, `classic`, `falchion`, `flip`, `gut`, `huntsman`, `karambit`, `kukri`, `m9-bayonet`, `navaja`, `nomad`, `paracord`, `shadow-daggers`, `skeleton`, `stiletto`, `survival`, `talon`, `ursus`) and 8 glove types. One finish name has one slug on every knife type: `doppler-ruby` exists on 18 knife types, `blue-steel` on 20, and no knife finish slug stands for two different names. Talon's Doppler phases are their own paint kits but share the other knives' slugs. Every glove finish has the float range 0.06 to 0.8; knife ranges vary (0 to 0.08 for Dopplers, 0 to 1, 0.4 to 1 and others); Vanilla has none.
- `api/src/combo_api/catalog/routes.py`: `GET /knives`, `/knives/{type_slug}`, `/knives/{type_slug}/{finish_slug}` and the same under `/gloves`, tag `catalog`, mirroring the website's paths. Unknown slugs return FastAPI's `{"detail": "Not Found"}`. The single-finish route returns retired finishes with `active: false`.
- `api/src/combo_api/catalog/display_order.json`: the catalog's display order. Knife types are alphabetical there, which is not the order the owner wants for batches.
- **Admins** (spec 007). `api/src/combo_api/admins/deps.py`: `require_admin` (alias `AdminDep`) returns `CurrentAdmin(id, username)`; it refuses without a live session (401 `not_authenticated`), and for `POST`, `PUT`, `PATCH` and `DELETE` without an allowed `Origin` or the session's CSRF token (403). It adds `Cache-Control: no-store`. `ADMIN_RESPONSES` declares the 401 and 403 responses. Errors are `{"detail": "<code>"}`. Admins are never deleted, only disabled. CORS allows `GET`, `POST`, `PUT`, `PATCH`, `DELETE` and the request headers `Content-Type` and `X-CSRF-Token` only.
- `api/tests/admins/test_require_admin.py::test_every_write_route_requires_an_admin` fails when a write route other than login and logout lacks `require_admin`. It does not check `GET` routes, so an admin read route without the dependency would pass.
- `api/src/combo_api/main.py`: 422 bodies keep FastAPI's list with `loc`, `msg` and `type` only. Operation IDs are the route function names.
- `api/migrations/versions/`: `0001_baseline`, `0002_catalog`, `0003_admins`. `api/tests/test_migrations.py` asserts the exact revision chain and the exact tables at head.
- `api/tests/conftest.py`: tests run against a migrated `<POSTGRES_DB>_test` database through `db_session` (rolled back after each test) and `client`. `api/tests/admins/support.py` has `login` and `write_headers` helpers with placeholder accounts.
- **Admin dashboard** (spec 008). `admin/src/api/schema.d.ts` is generated from `api/openapi.json` by `npm run api:types`; the `admin` workflow fails when it is stale. The dashboard's API base is an origin with no path (`VITE_API_BASE_URL`, checked in `admin/src/api/origin.ts`). It has two directions, By gloves (`/gloves`) and By knife (`/knives`), as placeholders.
- **Website**. `website/src/data/combos.ts` holds one glove finish's combos by hand: knife name, rating (for example 8.88), description, and optional glove and knife pattern and float strings. `website/src/pages/Combos.tsx` shows them at `/gloves/:itemId/:finishId/combos`; `/knives/:itemId/:finishId/combos` shows none yet. It draws the rating as a score out of 10.
- There is no combo table, endpoint or test today.

## Requirements

**Data**

- R1. Migration `0004` creates the `combos` and `knife_order` tables, seeds the knife order (R7), and upgrades and downgrades cleanly.
- R2. A combo pairs one glove finish and one knife finish from the catalog. There is at most one combo per pairing. The pairing of a combo never changes after it is created.
- R3. Each item of a combo (the gloves and the knife) has an optional float range, from and to, with at most 4 decimals, `from < to`; and a list of pattern seeds, each from 0 to 1000, no duplicates, at most 100, stored in ascending order. An empty list means any pattern.
- R4. Each combo has a rating from 0 to 10 with at most 2 decimals, stored exactly and returned as a JSON number, and an optional plain-text description of at most 1000 characters.
- R5. A combo's status is `draft`, `published` or `unpublished`. New combos are drafts. Only published combos are public.
- R6. Each combo records the admin who created it and when, the admin who last changed it and when (content or status), when it was last published, and a version number that increases with every content change.
- R7. The knife order is one saved list of knife types, shared by all admins. It starts as Butterfly, Karambit, M9 Bayonet, Talon, Skeleton, Stiletto, Bayonet, Flip, Nomad, Huntsman, Falchion, Bowie, Classic, Ursus, Kukri, Paracord, Survival, Gut, Shadow Daggers, Navaja. Active knife types missing from it follow in catalog order; retired ones are skipped.

**Admin endpoints**

- R8. Every route under `/admin/`, except login, logout and "who am I", depends on `require_admin`. A test fails if one does not.
- R9. Create one combo from a glove finish, a knife finish, a condition object per item, a rating and a description. A pairing that already has a combo is refused (409).
- R10. Read one combo by its id. List combos filtered by glove type, glove finish, knife type, knife finish and status, sorted by rating or by last change, with paging and the total count.
- R11. Update a combo's rating, description and both condition objects, given the version it was read at. A stale version is refused (409) and nothing changes.
- R12. Publish combos given their ids, or every draft at once; unpublish combos given their ids. Each request applies to all of its combos or to none. Publishing a published combo, or unpublishing one that is not published, changes nothing.
- R13. Remove a combo given the version it was read at. A published combo cannot be removed until it is unpublished. Removal deletes the row.
- R14. List the knife finish names a batch can use. Given a glove finish and a knife finish name, list batch candidates: every active knife type with an active finish of that name, in knife order, with the existing combo for that pairing if there is one.
- R15. Save a batch in one request: new combos for one glove finish and one knife finish name across several knife types, and rating and description changes to existing combos of the same batch. The batch is saved entirely or not at all.
- R16. Read the knife order; replace it with a list naming every active knife type exactly once.

**Public endpoints**

- R17. `GET /gloves/{type}/{finish}/combos` and `GET /knives/{type}/{finish}/combos` return the published combos of that finish, highest rating first, with both items' names, images and conditions. They return no draft or unpublished combo and no admin data. An unknown finish returns 404; a known finish without combos returns an empty list.

**Validation**

- R18. Finishes are named by type slug and finish slug, glove or knife by their place in the request. An unknown finish, or one of the wrong kind, is refused. A retired finish, or a finish of a retired type, is refused for new combos; existing combos with one can still be read, updated, published and removed.
- R19. A float range must lie inside the finish's own float range from the catalog, bounds included. A finish without a float range (Vanilla) takes no float range and no pattern seeds.
- R20. Every refused request returns a status and code from API / data model, and writes nothing. Validation failures are 422 bodies in FastAPI's list format whose `loc` points at the offending field, including the item's index in a batch.

**Docs and checks**

- R21. Creating, updating, publishing, unpublishing and removing combos, saving batches and replacing the knife order are logged with the admin's username.
- R22. `api/openapi.json` includes the new routes, `admin/src/api/schema.d.ts` is regenerated from it, and `api/README.md` documents combos, the endpoints and the knife order.

## Design

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| How combos reference finishes (owner's choice) | Foreign keys to `finishes.id`, `ON DELETE RESTRICT`. The API never shows catalog ids: requests and responses name finishes by type slug and finish slug, which never change and stay reserved (specs 005, 006). Moving combos to the server's database is a whole-database dump and restore, in which catalog ids travel with the catalog; the `deploy/` spec documents it | Game identifiers (definition index and paint index) stored in each combo: survive a combo-only copy, but give up the foreign key, so nothing in the database stops a combo naming a finish that does not exist, and every read needs a two-column join. Slugs stored in each combo: the same, with longer keys. A portable export and import command for combos alone: not needed while the server's database starts as a copy of the laptop's, and possible later without an API change, since the API never shows catalog ids. |
| Combo identity (owner's choice) | A `public_id` of 12 characters from `0-9a-z`, from the operating system's secure random generator, unique; it is the `id` in every URL and response. The integer primary key stays internal | The integer id in URLs: changes if combos are ever copied to another database, and counts combos for anyone who sees one. A slug built from the pairing (`specialist-crimson-kimono--karambit-doppler-ruby`): long, and once variations allow several combos per pairing it needs a suffix anyway. A UUID: 36 characters in every URL for no gain at this size. |
| Room for variations | One row per combo, carrying both items' conditions and the rating. Phase 1 adds a unique constraint on the pairing. Variations later drop that constraint and add a label column; combos are already identified by `public_id`, and every response is a list of combos, so several combos per pairing need no new response shape | A pairing table with child rows now: a join and a second id for a feature not built. |
| Paths (owner's choice) | Admin routes under `/admin/` (`/admin/combos`, `/admin/batches/...`, `/admin/knife-order`), next to login. Public routes extend the catalog's paths, `/gloves/{type}/{finish}/combos` and `/knives/{type}/{finish}/combos`, the same paths as the website's combos pages. No path holds a host or a prefix. At deployment the API gets its own subdomain, where these paths stay as they are | `/combos?glove=...`: unlike the catalog and the website. A prefix such as `/api` on the website's host: works with a proxy that strips it and FastAPI's `root_path`, but spec 008 requires `VITE_API_BASE_URL` to be an origin without a path, so the dashboard's origin rule would have to change. |
| Removing combos (owner's choice) | Hard delete, only of a draft or unpublished combo, and only at the version it was read at. A published combo must be unpublished first (409 `combo_published`). The removed combo's content is written to the log | Soft delete or archive: unpublish already hides a combo from the public without losing it; a second hidden state would need a partial unique index on the pairing and a filter in every query. Deleting published combos directly: one click takes a combo off the website. |
| Two admins editing (owner's choice) | Optimistic locking: `version` starts at 1 and increases with every content change (rating, description, conditions). Update and remove carry the version read; a different stored version gets 409 `version_conflict` and nothing changes. Status changes do not use or change the version, so publishing never makes another admin's open edit fail | Last write wins: one admin's rating silently replaces another's. `If-Match` with ETags: needs a CORS header the API does not allow yet, for the same check. Locking a combo while it is open: needs lock expiry and release. |
| Batch defaults and the 0.05 rating step (owner's choice) | Applied by the dashboard. The batch save request carries each combo's final rating, description and conditions; the API stores what it is sent and validates every value. No batch-wide rule is stored | Computed by the API from the top knife's rating and the batch-wide rules: the owner can change any value before saving, so the API would need the defaults and every override anyway, and the rule would live in two places. A candidates endpoint that returns suggested ratings: a round trip whenever the top rating changes. |
| Rating storage (owner's choice) | `numeric(4,2)` with a check from 0 to 10. The API accepts a JSON number with at most 2 decimals (8.88 yes, 8.885 no) and returns a JSON number, not a string | `double precision`: 8.88 is not exact in binary, and stepping by 0.05 drifts. An integer of hundredths: exact, but every reader must divide by 100. |
| Float range storage (owner's choice) | Four nullable `numeric(5,4)` columns, `glove_float_from`, `glove_float_to`, `knife_float_from`, `knife_float_to`; check constraints: each pair both null or `0 <= from < to <= 1`. At most 4 decimals in the API. The finish's own range is checked by the API, comparing decimals parsed from the catalog value's shortest form, so 0.06 is 0.06 | `double precision`: 0.1 is not exact, and a range typed as 0.06 could fail against the catalog's 0.06. More decimals: wear ranges for combos are written with two or three. A text range as the website has today: cannot be checked. |
| Seed storage (owner's choice) | Two `integer[]` columns, `glove_seeds` and `knife_seeds`, not null, default empty; check constraints: no null element, every element from 0 to 1000, at most 100 elements. The API refuses duplicates and stores the list sorted | A child table of seeds: a join on every read for a short list with no identity. `jsonb`: no element type check in the database. |
| Seed range | 0 to 1000, the range of the game's pattern seed | 1 to 1000: would refuse seed 0, which the game uses. |
| Description | Plain text, trimmed; empty becomes null; at most 1000 characters after trimming; control characters other than line breaks refused. Never HTML | A longer limit: the website shows it in a card. Markdown: nothing renders it yet. |
| Status | `draft`, `published`, `unpublished`. Publishing works from `draft` or `unpublished`; "publish everything new" publishes only `draft`, so a combo an admin took down is not put back by accident | Two states with a flag for "was published": the same information, less readable filters. |
| Pairing changes | Not allowed. A combo on the wrong finish is removed and created again | Editable finishes: a combo would move between pages and could collide with another pairing during an edit. |
| Batch key | The knife finish slug (for example `doppler-ruby`, `blue-steel`), which names the same finish on every knife type (Context). The finish names list shows display names, `Doppler (Ruby)` | Matching on the English name: `Doppler` alone covers every phase. Paint indexes: Talon's Dopplers differ from the other knives'. |
| Batch request | One glove finish, one knife finish slug, `create` items (a knife type slug, rating, description, both condition objects) and `update` items (combo id, version, rating, description); at most 50 items; a knife type at most once. Every check runs before any write; the first refusal stops the request. Existing combos in a batch change rating and description only, as the owner's batch screen offers | One request per knife: a failure halfway leaves half a batch. Conditions on `update` items: the batch screen offers rating and description only. |
| Remembering batches | Not stored. The batch save response returns the created combos, so the dashboard can publish them by id; "everything new" covers the rest | A batches table: nothing reads it in this spec. |
| Publish and unpublish | `POST /admin/combos/publish` with `ids` (1 to 500) or `all_drafts: true`, and `POST /admin/combos/unpublish` with `ids` (1 to 500). Unknown ids refuse the whole request (422) | One route per combo and action: a batch would need many requests, not all or nothing. |
| Knife order storage | Table `knife_order` of `(position, type_slug)`, seeded by migration `0004` with the owner's order. Slugs, not foreign keys, because in Compose the migration runs before the catalog import, and knife type slugs never change. Reads join it with the active knife types; replacing it rewrites every row. Last write wins, logged | A foreign key to `item_types`: the migration could not seed it on an empty catalog. A JSON file in the repository: admins could not change it. |
| List sorting and ties | Admin list: `sort=rating` (default: rating, highest first) or `sort=updated` (last change, newest first), then the internal id. Public lists: rating, highest first; ties by the other item's order: knives in knife order then finish display order, gloves in catalog display order | Unordered ties: pages would shuffle between requests. |
| Paging | Admin list only: `limit` 1 to 500, default 100, and `offset`; the body has `total` and `items`. Public lists return every published combo of the finish | Cursor paging: more complex for at most a few thousand rows. Paging public lists: one finish has at most a few hundred possible pairings. |
| Retired finishes | Refused for new combos (create and batch create) with 422 `finish_retired`; left out of batch finishes and candidates. Existing combos keep working, and public lists still show them, with `active: false` on that item | Hiding combos of retired finishes: retired items still exist in inventories. |
| Domain errors | Checks against the catalog and the database (unknown or retired finish, float range, Vanilla) are 422 bodies in FastAPI's list format with their own `type` codes, so a batch error points at its item | A `{"detail": "<code>"}` body: says what failed, not where. |
| Conflict errors | 409 with `{"detail": "<code>"}`: `combo_exists`, `version_conflict`, `combo_published`. 404 `combo_not_found` for an unknown combo id in a path | 422 for conflicts: the request is valid; the stored state differs. |
| Route guard | The existing guard test is extended: every route whose path starts with `/admin/`, other than `admin_login`, `admin_logout` and `admin_me`, must depend on `require_admin`, whatever its method | Write routes only (today): an admin list without the dependency would expose drafts and admin usernames. |
| Tags and operation IDs | Admin routes tag `admin`, public routes tag `combos`; operation IDs are the function names in API / data model | A new `admin-combos` tag: two admin tags for one dashboard. |
| Logging | Logger `combo_api.combos`, key=value fields as in spec 007 | No logs: removals could not be undone by hand. |
| Layout | `api/src/combo_api/combos/`: `models.py`, `schemas.py` (request and response models), `ids.py` (public ids), `rules.py` (catalog checks), `admin_routes.py`, `public_routes.py`. Tests in `api/tests/combos/` | Adding to `catalog/`: the catalog is game data, combos are the project's own. |
| Compose and CI | No new service or workflow. The `api` workflow's Compose smoke test also checks that a public combos route returns `[]` and `GET /admin/combos` returns 401. The `admin` workflow's existing types check covers the regenerated types | Seeding sample combos in Compose: every combo needs an admin, and admins are created only at a terminal. |
| Dashboard | Only `admin/src/api/schema.d.ts` changes, regenerated. The By gloves and By knife screens, and keeping an unsaved form when the session ends (spec 008 follow-up), are the next spec | Building the screens here: a second large change in one review. |

## API / data model

**Tables** (migration `0004_combos`):

`combos`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigint identity | Primary key, internal |
| `public_id` | text | Unique; check `^[0-9a-z]{12}$` |
| `glove_finish_id` | integer | Foreign key to `finishes.id`, `ON DELETE RESTRICT` |
| `knife_finish_id` | integer | Foreign key to `finishes.id`, `ON DELETE RESTRICT`, indexed |
| `glove_float_from`, `glove_float_to` | numeric(5,4), nullable | Both null, or `0 <= from < to <= 1` |
| `knife_float_from`, `knife_float_to` | numeric(5,4), nullable | Same |
| `glove_seeds`, `knife_seeds` | integer[] | Not null, default `{}`; no null element, each 0 to 1000, at most 100 |
| `rating` | numeric(4,2) | 0 to 10 |
| `description` | text, nullable | At most 1000 characters |
| `status` | text | `draft`, `published` or `unpublished` |
| `version` | integer | Starts at 1 |
| `published_at` | timestamptz, nullable | Last publication |
| `created_at`, `updated_at` | timestamptz | |
| `created_by`, `updated_by` | integer | Foreign keys to `admins.id`, `ON DELETE RESTRICT` |

Unique `(glove_finish_id, knife_finish_id)`. That the glove finish is a glove and the knife finish a knife is checked by the API, since a check constraint cannot read another table.

`knife_order`

| Column | Type | Notes |
| --- | --- | --- |
| `position` | integer | Primary key, from 1 |
| `type_slug` | text | Unique; a knife type slug |

Seeded with `butterfly`, `karambit`, `m9-bayonet`, `talon`, `skeleton`, `stiletto`, `bayonet`, `flip`, `nomad`, `huntsman`, `falchion`, `bowie`, `classic`, `ursus`, `kukri`, `paracord`, `survival`, `gut`, `shadow-daggers`, `navaja`.

**Shapes** (JSON):

```json
// Conditions: one item's requirements
{"float_from": 0.01, "float_to": 0.28, "seeds": [179, 387]}

// ItemIn: a finish and its conditions
{"type_slug": "specialist", "finish_slug": "crimson-kimono", "float_from": null, "float_to": null, "seeds": []}

// Item: an item as returned
{
  "type_slug": "karambit", "type_name": "Karambit",
  "finish_slug": "doppler-ruby", "display_name": "Doppler (Ruby)",
  "image_url": "<Steam economy image URL>", "rarity": {"code": "...", "name": "Covert", "color": "#eb4b4b"},
  "active": true,
  "float_from": 0.0, "float_to": 0.01, "seeds": []
}

// AdminCombo
{
  "id": "k3v9x0m2q7ab", "status": "draft", "version": 1,
  "rating": 9.5, "description": null,
  "glove": Item, "knife": Item,
  "created_at": "...", "created_by": "<username>",
  "updated_at": "...", "updated_by": "<username>",
  "published_at": null
}

// PublicCombo
{"id": "k3v9x0m2q7ab", "rating": 9.5, "description": null, "glove": Item, "knife": Item}
```

`active` on an item is false when the finish or its type is retired. Omitted `float_from`, `float_to` and `seeds` mean null, null and `[]`. Ratings and floats are JSON numbers.

**Admin endpoints** (tag `admin`; all depend on `require_admin` and declare `ADMIN_RESPONSES`; responses carry `Cache-Control: no-store`):

| Route | Operation ID | Request | Response |
| --- | --- | --- | --- |
| `GET /admin/combos` | `list_combos` | Query: `glove_type`, `glove_finish` (needs `glove_type`), `knife_type`, `knife_finish` (needs `knife_type`), `status`, `sort` (`rating` or `updated`), `limit`, `offset` | `200 {"total": n, "items": [AdminCombo]}` |
| `POST /admin/combos` | `create_combo` | `{"glove": ItemIn, "knife": ItemIn, "rating", "description"}` | `201` AdminCombo; `409 combo_exists` |
| `GET /admin/combos/{id}` | `get_combo` | | `200` AdminCombo; `404 combo_not_found` |
| `PUT /admin/combos/{id}` | `update_combo` | `{"version", "rating", "description", "glove": Conditions, "knife": Conditions}` | `200` AdminCombo; `404`; `409 version_conflict` |
| `DELETE /admin/combos/{id}?version=n` | `remove_combo` | | `204`; `404`; `409 version_conflict` or `combo_published` |
| `POST /admin/combos/publish` | `publish_combos` | `{"ids": [...]}` or `{"all_drafts": true}`, exactly one | `200 {"changed": n}` |
| `POST /admin/combos/unpublish` | `unpublish_combos` | `{"ids": [...]}` | `200 {"changed": n}` |
| `GET /admin/batches/finishes` | `list_batch_finishes` | | `200 [{"slug", "display_name", "knife_types": n}]`, by display name |
| `GET /admin/batches/candidates` | `get_batch_candidates` | Query: `glove_type`, `glove_finish`, `knife_finish` | `200` Candidates |
| `POST /admin/batches` | `save_batch` | Batch | `200 {"created": [AdminCombo], "updated": [AdminCombo]}`; `409 combo_exists` or `version_conflict` |
| `GET /admin/knife-order` | `get_knife_order` | | `200 {"knife_types": [{"slug", "name"}]}` |
| `PUT /admin/knife-order` | `replace_knife_order` | `{"slugs": [...]}` | `200`, as `GET` |

```json
// Candidates
{
  "glove": Item,                       // conditions empty
  "knife_finish": {"slug": "doppler-ruby", "display_name": "Doppler (Ruby)"},
  "candidates": [
    {"knife": Item, "existing": null},
    {"knife": Item, "existing": {"id": "...", "status": "published", "version": 2, "rating": 9.1, "description": "..."}}
  ]
}

// Batch
{
  "glove": {"type_slug": "specialist", "finish_slug": "crimson-kimono"},
  "knife_finish": "doppler-ruby",
  "create": [
    {"knife_type": "butterfly", "rating": 9.5, "description": null,
     "glove": Conditions, "knife": Conditions}
  ],
  "update": [
    {"id": "k3v9x0m2q7ab", "version": 2, "rating": 9.45, "description": "..."}
  ]
}
```

Candidates are in knife order; only active knife types with an active finish of that slug appear, and a knife finish slug no active knife has gives an empty list. In a batch, `create` and `update` together hold 1 to 50 items, each knife type at most once, and every `update` combo must be the pairing of the batch's glove finish with that knife finish on some knife type.

**Public endpoints** (tag `combos`):

| Route | Operation ID | Response |
| --- | --- | --- |
| `GET /gloves/{type_slug}/{finish_slug}/combos` | `list_glove_finish_combos` | `200 [PublicCombo]`; `404` if no glove finish has those slugs |
| `GET /knives/{type_slug}/{finish_slug}/combos` | `list_knife_finish_combos` | `200 [PublicCombo]`; `404` likewise |

Both return published combos only, in the order of Design, including those whose items are retired. `404` bodies are `{"detail": "Not Found"}`, as on the catalog routes.

**Errors:**

| Status | Code | When |
| --- | --- | --- |
| 401, 403 | spec 007 codes | From `require_admin` |
| 404 | `combo_not_found` | Unknown combo id in an admin path |
| 409 | `combo_exists` | The pairing already has a combo |
| 409 | `version_conflict` | Update, remove, or a batch update whose version is not the stored one |
| 409 | `combo_published` | Removing a published combo |
| 422 | FastAPI's list; pydantic types, and these `type` codes | `finish_not_found` (unknown slug or wrong kind), `finish_retired`, `float_outside_finish`, `finish_has_no_float`, `finish_has_no_pattern` (seeds on Vanilla), `duplicate_seed`, `duplicate_knife_type`, `combo_not_found` (an id in a body), `combo_not_in_batch`, `knife_order_mismatch` (the list is not every active knife type once) |

**Log events** (logger `combo_api.combos`, level info, each with `admin`): `combo created` (`id`, `glove`, `knife`), `combo updated` (`id`, `version`), `combo removed` (`id` and the removed combo's fields), `combos published` and `combos unpublished` (`ids`), `batch saved` (`glove`, `knife_finish`, `created`, `updated`), `knife order replaced` (`slugs`). `glove` and `knife` are written `<type_slug>/<finish_slug>`.

## Security

- S1. Every admin combo, batch and knife order route requires an authenticated, enabled admin through `require_admin`; writes also need an allowed `Origin` and the session's CSRF token (spec 007). The extended route guard test enforces this for every `/admin/` route added later.
- S2. Public endpoints return only published combos, and only the fields of `PublicCombo`: no status, version, admin usernames, timestamps or internal ids.
- S3. No response contains a catalog id or a combo's internal id.
- S4. Admin responses are not cacheable (`Cache-Control: no-store`).
- S5. Every input has a bound: string lengths, seed counts and values, batch and publish list sizes, `limit`. Descriptions are stored as plain text and never as HTML.
- S6. Combo public ids come from the operating system's secure random generator.
- S7. No new setting, secret, dependency, network access or CORS change. `api/.env.example` is unchanged.

## Acceptance criteria

Test ids and commands are relative to `api/` unless stated. "Logged in" means a session made with the helpers in `tests/admins/support.py`; writes are sent with `write_headers`. Tests import the catalog snapshot through `db_session` as the catalog tests do.

**Storage**

1. `uv run alembic upgrade head`, `downgrade base` and `upgrade head` succeed; `uv run alembic check` reports no new operations; the migration tests expect revisions `0001` to `0004` and the tables `combos` and `knife_order` added to the known set.
2. After migrating, `knife_order` holds the 20 slugs of API / data model at positions 1 to 20.
3. Tests insert rows directly and get a constraint error for: a second combo with the same pairing; a glove range with only `from`; `from >= to`; `to > 1`; a seed of -1 or 1001; a null seed; 101 seeds; a rating of -0.01 or 10.01; a description of 1001 characters; status `hidden`; a `public_id` of 11 characters or with an upper-case letter; deleting a finish or an admin a combo refers to.

**Create, read, update, remove**

4. A logged-in admin creates Specialist Gloves Crimson Kimono with Karambit Doppler (Ruby), rating 8.88, a description, knife range 0 to 0.01 and glove seeds `[2, 1]`: 201 with the body of API / data model, `id` matching `^[0-9a-z]{12}$`, `status` `draft`, `version` 1, `created_by` and `updated_by` the admin, glove seeds `[1, 2]`, and the rating the JSON number `8.88` in the raw body.
5. Creating the same pairing again returns 409 `combo_exists` and stores nothing.
6. Create returns 422 with the field in `loc`, and stores nothing, for: an unknown glove type or finish; a knife slug in `glove`; a glove slug in `knife`; a retired finish; a finish of a retired type; rating 8.885, -1 or 10.5; a float with 5 decimals; a range with only `float_from`; `float_from >= float_to`; a glove range 0.05 to 0.5 (below the finish's 0.06); a Karambit Doppler (Ruby) range 0 to 0.09 (above 0.08); a range or a seed on Karambit Vanilla; a seed of 1001; a duplicate seed; 101 seeds; a description of 1001 characters; a description with a control character other than a line break. Each returns the `type` code of API / data model where one is listed. A glove range of exactly 0.06 to 0.8 is accepted.
7. `GET /admin/combos/{id}` returns the combo; an unknown id returns 404 `combo_not_found`. A description of spaces only is stored as null.
8. Update with the current version changes rating, description and both condition objects, increases `version` by 1, sets `updated_by` to the admin who made it and `updated_at` to a later time, and keeps `created_by`, `created_at` and the pairing. A second update sent with the old version returns 409 `version_conflict` and the combo is unchanged. Extra fields in the body, such as `type_slug`, `finish_slug` or `status`, change neither the pairing nor the status.
9. An update to a combo whose knife finish has since been retired succeeds; its range is still checked against that finish's range.
10. Remove of a draft with its version returns 204 and the row is gone; a stale version returns 409 `version_conflict`; a published combo returns 409 `combo_published` and stays; an unknown id returns 404; a missing `version` returns 422. A `combo removed` log line holds the removed combo's rating, description and conditions.

**Publish and unpublish**

11. Publishing two drafts by id returns `changed: 2`; both are `published`, `published_at` is set, `updated_by` is the admin, and `version` is unchanged. Publishing them again returns `changed: 0`. Unpublishing one returns `changed: 1` and makes it `unpublished`.
12. With three drafts and one unpublished combo, `all_drafts: true` publishes the three drafts and not the unpublished one.
13. Publish with one unknown id among known ones returns 422 with `combo_not_found` at that index, and no combo changes. A body with both `ids` and `all_drafts`, neither, an empty `ids` list or 501 ids returns 422.
14. An update made with a version read before another admin published the combo succeeds.

**List**

15. With combos on several glove and knife finishes and in every status, each filter (`glove_type`; `glove_type` with `glove_finish`; `knife_type`; `knife_type` with `knife_finish`; `status`; and combinations) returns exactly the matching combos and the matching `total`. `glove_finish` without `glove_type`, an unknown slug and an unknown status return 422.
16. `sort=rating` returns highest rating first; `sort=updated` returns the most recently changed first; ties come back in the same order on every request. `limit` and `offset` page through the results with no combo repeated or missed; `limit` 0 or 501 returns 422.

**Batches**

17. `GET /admin/batches/finishes` lists `doppler-ruby` as "Doppler (Ruby)" with 18 knife types and `blue-steel` with 20, sorted by display name, with no retired finish and no glove finish.
18. Candidates for Specialist Gloves Crimson Kimono and `doppler-ruby` list the 18 knife types that have it, in the seeded knife order (Butterfly first), each with its image and float range. After a combo with Karambit exists, Karambit's entry has `existing` with its id, status, version, rating and description, and the others have `existing: null`. A retired knife finish of that slug is left out. An unknown glove finish returns 422 `finish_not_found`, a retired one 422 `finish_retired`, and a slug no knife has returns an empty list.
19. Saving a batch with 17 `create` items and an `update` of the Karambit combo returns 200 with 17 created drafts and the updated combo (new rating and description, conditions unchanged, `version` increased).
20. A batch is refused with nothing written when: one `create` item has a range outside its knife finish (422 with that item's index in `loc`); one knife type appears twice (422 `duplicate_knife_type`); a `create` item's knife type has no active finish with the batch's slug (422 `finish_not_found`); an `update` id is unknown (422 `combo_not_found`) or belongs to another glove finish or knife finish (422 `combo_not_in_batch`); an `update` version is stale (409 `version_conflict`); a `create` pairing already has a combo (409 `combo_exists`); it has no items or 51 items (422). In each case the combo count and every existing combo are unchanged.
21. A test creates a batch whose ratings step from 9.5 down by 0.05 and checks every stored rating is exact (9.5, 9.45, 9.4, ...).

**Knife order**

22. `GET /admin/knife-order` returns the 20 knife types in the seeded order with their names. With one knife type made inactive it is left out; with a new active knife type not in the table it comes last.
23. `PUT /admin/knife-order` with the 20 slugs in another order returns that order, and candidates follow it. A list with a slug missing, a slug twice, an unknown or a glove slug, or a retired knife type returns 422 `knife_order_mismatch` and the order is unchanged.

**Public endpoints**

24. With published, draft and unpublished combos on Specialist Gloves Crimson Kimono, `GET /gloves/specialist/crimson-kimono/combos` returns only the published ones, highest rating first, ties in knife order; each has exactly the fields of `PublicCombo`, and the raw body contains no username, status, version, timestamp or catalog id.
25. `GET /knives/karambit/doppler-ruby/combos` returns that knife finish's published combos, ties in glove display order. A known finish without combos returns `[]`. An unknown type or finish, and a glove slug under `/knives`, return 404. A published combo whose knife finish is retired appears with that item's `active: false`.
26. The public endpoints answer without a session and set no cookie; their responses are the same with and without an admin session.

**Guard, schema, docs**

27. The route guard test checks that every route of `create_app()` whose path starts with `/admin/`, other than `admin_login`, `admin_logout` and `admin_me`, depends on `require_admin`, and every route with a write method does too; a copy of the app with an unprotected `GET /admin/probe` fails it. Every admin route answers 401 `not_authenticated` without a session, and every admin write answers 403 `csrf_failed` without the CSRF token.
28. Responses of every admin combo, batch and knife order route have `Cache-Control: no-store`, refusals included.
29. A test captures the logs of a create, update, publish, unpublish, remove, batch save and knife order replacement and finds each event of API / data model with its fields and the admin's username.
30. `api/openapi.json` contains the 14 new operations with the IDs, tags and paths of API / data model, with `rating`, `float_from` and `float_to` typed as numbers; `uv run python -m combo_api.openapi --check` exits 0.
31. In `admin/`: `npm run api:types:check`, `npm run typecheck`, `npm test` and `npm run build` exit 0, and `git diff --stat main...009-api-combos -- admin website` lists only `admin/src/api/schema.d.ts`.
32. `api/README.md` describes combos (pairing, conditions, rating, statuses, versions, removal), the knife order, batches, every new endpoint in its Endpoints table, and `combos/` in its Layout table; its first paragraph no longer says combo endpoints come later.

**Checks**

33. In `api/`: `uv run ruff format --check .`, `uv run ruff check .`, `uv run mypy`, `uv run pytest` (no skipped tests), the OpenAPI check and `export-website --check` exit 0; `docker build -t combo-skin-api api` exits 0.
34. With the Compose stack up from `api/.env.example`, `GET /gloves/specialist/mogul/combos` on the local API returns `[]` and `GET /admin/combos` returns 401; the `api` workflow's Compose smoke test checks both.
35. After the branch is pushed, the `api` and `admin` workflow runs for its latest commit succeed on GitHub.
36. `gitleaks dir . --no-banner --redact` on a clean clone and `gitleaks git --log-opts="main..009-api-combos" --no-banner --redact` report no findings; the only URLs added are to `github.com/shb327/combo-skin`, public documentation, `localhost` and `example.com` or `example.test` placeholders.

## Test plan

| Criterion | How it is checked |
| --- | --- |
| 1 | pytest: migration tests; `uv run alembic check`; `uv run alembic history` |
| 2, 3 | pytest: model tests through `db_session` |
| 4 to 10 | pytest: route tests in `tests/combos/` through `client`; criterion 4 reads the raw response text; criterion 10 with `caplog` |
| 11 to 14 | pytest: publish tests |
| 15, 16 | pytest: list tests on a fixture of combos across finishes and statuses |
| 17 to 21 | pytest: batch tests; retired finishes made by setting `active` to false in `db_session` |
| 22, 23 | pytest: knife order tests |
| 24 to 26 | pytest: public route tests, reading the raw response text for criterion 24 |
| 27, 28 | pytest: the extended guard test in `tests/admins/test_require_admin.py` and a test over every new admin route |
| 29 | pytest with `caplog` |
| 30 | pytest: schema test; the `--check` command |
| 31 | The commands in criterion 31 |
| 32 | Read `api/README.md` |
| 33 | The commands in criterion 33 |
| 34 | `cp api/.env.example api/.env && docker compose up -d --wait`, two `curl` calls, `docker compose down -v`; read `.github/workflows/api.yml` |
| 35 | The workflow run pages for the branch's latest commit (checked after the owner pushes) |
| 36 | The gitleaks commands; `git diff main...009-api-combos \| grep -oE 'https?://[^ )>"]+' \| sort -u` |

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

In `admin/`:

```bash
npm ci
npm run api:types:check
npm run lint
npm run typecheck
npm test
npm run build
```

## Open questions

None. On 2026-11-03 the owner chose every recommendation of the first draft, recorded in Design as the owner's choice: foreign keys to catalog ids inside the database, slugs in the API, and a whole-database dump and restore to move combos to the server; a random 12-character `public_id`; admin routes under `/admin/`, public routes under the catalog's paths, and the API on its own subdomain at deployment; hard delete of drafts and unpublished combos only, with a version check and the content logged; a version check against concurrent edits, with publishing outside it; the rating step and batch defaults applied by the dashboard; `numeric(4,2)` ratings, `numeric(5,4)` float ranges, and `integer[]` seeds from 0 to 1000, at most 100 per item.

## Implementation notes

Built on `009-api-combos`, from `main` at the merge of spec 008.

### Deviations

**2026-11-03, criterion 18 and API / data model, `Item` (agreed with the owner).** Criterion 18 asks for each batch candidate "with its image and float range", but the `Item` shape in API / data model has only the combo's own range (`float_from`, `float_to`), which is empty on a candidate, so the finish's range from the catalog was missing. `Item` now also has `float_min` and `float_max`, the finish's own range (null for Vanilla), everywhere it appears: admin combos, candidates and public combos. The dashboard needs it to check a range before sending it. Nothing else in the shape changed. The owner accepted the range on every `Item`, not only on candidates.

Smaller changes, none affecting a requirement:

- **Layout.** Besides the files in Design: `combos/queries.py` (loading combos with their finishes, types and admins, and building responses), `combos/order.py` (the effective knife order and replacing it) and `combos/batches.py` (batch finish names, candidates and saving).
- **Check constraints.** The float range constraints say `IS NOT NULL` for both bounds explicitly. Without it, a range with only one bound passes, because a comparison with null is unknown and a check constraint lets unknown through. A test found it.
- **`knife_finish.display_name` in candidates** is null when no active knife type has the slug, since there is no finish to name it from.
- **Batch list sizes.** `create` and `update` are each limited to 50 before the total is checked, so an oversized list is refused before it is read in full; 51 `create` items get 422 at `["body", "create"]`, and more than 50 items across both lists at `["body"]`.
- **422 codes not listed in API / data model**: a range with one bound, `float_from >= float_to`, a description with a control character, and a request with both or neither of `ids` and `all_drafts` use `value_error`; too many seeds use pydantic's `too_long`; too many decimals use `decimal_max_places`, the code pydantic uses for decimals.
- **Log lines.** `combos published` and `combos unpublished` list the ids whose status changed; `combo removed` writes the description with Python's `repr`, so line breaks in it cannot start a new log line.
- **Tests** in `api/tests/combos/` reuse the admin test fixtures (app, clients, accounts, clock) by importing them into their `conftest.py`.

### Follow-ups

- Two requests creating the same pairing at the same moment both pass the existence check; the second then fails on the unique constraint with a 500 instead of 409 `combo_exists`. The same holds for batches. Rare with a few admins; catching the constraint error would close it.
- The catalog's own float range check (`finishes`, spec 005) has the same gap as above: a row with only one bound would pass. The import never writes one.
- A public id collision (about one in 10^18 per pair) would surface as a 500.
- The workflow change was not checked with `actionlint` locally (not installed); it adds two `run` lines in the existing style.
- Still open from spec 008: the API's error codes are not an enumeration in `api/openapi.json`.

### Changes after the first audit (2026-11-03)

The first audit, on commit 89ed84e, failed on Security S5 and found a race in the knife order. Both are fixed, each with a test; neither changes a requirement.

- **S5 bounds.** `offset` on `GET /admin/combos` is at most 1,000,000; a larger value got a database error and a 500. The public routes' `type_slug` and `finish_slug` are 1 to 64 characters, like every other slug in the API; longer ones get 422 (`tests/combos/test_list.py::test_bad_filters`, `tests/combos/test_public.py::test_public_slugs_are_bounded`).
- **Knife order, last write wins.** Replacing the order now locks the `knife_order` table first. Before, a replace that started while another was writing could not see that one's new rows, failed on the primary key and returned a 500 (`tests/combos/test_knife_order.py::test_concurrent_replaces_last_write_wins`, which reproduced the failure before the fix).

### Criterion coverage

Test ids are relative to `api/`.

| Criterion | Covered by |
| --- | --- |
| 1 | `tests/test_migrations.py::test_revision_history`, `::test_upgrade_downgrade_upgrade`, `::test_models_match_migrations`, `::test_head_has_only_known_tables`; `uv run alembic check`: "No new upgrade operations detected"; `alembic history` ends `0003 -> 0004 (head)` |
| 2 | `tests/combos/test_models.py::test_knife_order_is_seeded` |
| 3 | `tests/combos/test_models.py::test_constraints`, `::test_referenced_finishes_and_admins_cannot_be_deleted`, `::test_a_valid_combo_is_stored` |
| 4 | `tests/combos/test_admin_combos.py::test_create_returns_a_draft` |
| 5 | `tests/combos/test_admin_combos.py::test_same_pairing_is_refused` |
| 6 | `tests/combos/test_admin_combos.py::test_create_refuses_invalid_input` (21 cases), `::test_finish_bounds_are_inclusive` |
| 7 | `tests/combos/test_admin_combos.py::test_read_one` |
| 8 | `tests/combos/test_admin_combos.py::test_update`, `::test_update_checks_conditions` |
| 9 | `tests/combos/test_admin_combos.py::test_update_after_the_finish_retired` |
| 10 | `tests/combos/test_admin_combos.py::test_remove`; `tests/combos/test_publish.py::test_published_combo_cannot_be_removed` |
| 11 | `tests/combos/test_publish.py::test_publish_and_unpublish_by_id` |
| 12 | `tests/combos/test_publish.py::test_publish_all_drafts` |
| 13 | `tests/combos/test_publish.py::test_publish_refuses_bad_requests` |
| 14 | `tests/combos/test_publish.py::test_publishing_does_not_break_an_open_edit` |
| 15 | `tests/combos/test_list.py::test_filters`, `::test_bad_filters` |
| 16 | `tests/combos/test_list.py::test_sorting_and_paging`, `::test_bad_filters` |
| 17 | `tests/combos/test_batches.py::test_batch_finishes` |
| 18 | `tests/combos/test_batches.py::test_candidates`, `::test_candidates_refusals`, `::test_no_knife_has_the_finish` |
| 19 | `tests/combos/test_batches.py::test_save_a_batch` |
| 20 | `tests/combos/test_batches.py::test_batch_refusals` (12 cases, each checking the combo count and every existing combo) |
| 21 | `tests/combos/test_batches.py::test_ratings_step_exactly` |
| 22 | `tests/combos/test_knife_order.py::test_read_the_seeded_order` |
| 23 | `tests/combos/test_knife_order.py::test_replace_the_order`, `::test_refuse_a_wrong_order` |
| 24 | `tests/combos/test_public.py::test_glove_finish_combos` |
| 25 | `tests/combos/test_public.py::test_knife_finish_combos` |
| 26 | `tests/combos/test_public.py::test_public_routes_need_no_session` |
| 27 | `tests/admins/test_require_admin.py::test_every_write_route_requires_an_admin`, `::test_the_guard_finds_an_unprotected_write`; `tests/combos/test_guard.py::test_admin_routes_refuse_without_a_session`, `::test_admin_writes_need_the_csrf_token` |
| 28 | `tests/combos/test_guard.py::test_admin_routes_refuse_without_a_session`, `::test_admin_writes_need_the_csrf_token`, `::test_admin_responses_are_not_cached` |
| 29 | `tests/combos/test_guard.py::test_log_events`; `tests/combos/test_admin_combos.py::test_remove` (the removed content) |
| 30 | `tests/combos/test_schema.py::test_combo_operations_in_schema`, `::test_numbers_are_numbers`; `tests/test_openapi.py::test_snapshot_is_up_to_date`; `uv run python -m combo_api.openapi --check`: exit 0 |
| 31 | In `admin/`: `npm run api:types:check`, `npm run lint`, `npm run typecheck`, `npm test` (117 passed), `npm run build`, `npm run check:bundle` all exit 0; `git diff --stat main...009-api-combos -- admin website` lists only `admin/src/api/schema.d.ts` |
| 32 | `api/README.md`: first paragraph, "Combos" section, the OpenAPI snapshot section (regenerate the admin types too), Endpoints and Layout tables |
| 33 | In `api/`: format check, lint, mypy, pytest (282 passed, 0 skipped), the OpenAPI and export checks all exit 0; `docker build` exits 0, image 228,512,150 bytes |
| 34 | A separate Compose project from `api/.env.example` (database name and host ports changed so as not to touch another running stack): `migrate` and `catalog` exited 0, `/health/ready` ok, `GET /gloves/specialist/mogul/combos` returned `[]`, `GET /admin/combos` 401; removed with `down -v`. `.github/workflows/api.yml` checks both |
| 35 | Pending: the `api` and `admin` workflow runs, after the owner pushes the branch |
| 36 | `gitleaks dir . --no-banner --redact` and `gitleaks git --log-opts="origin/main..HEAD"`: no leaks. URLs in the branch diff: `localhost` in the workflow and the repository's own badge links |

## Audit

**Date:** 2026-11-03 · **Branch:** 009-api-combos · **Commit:** 46310ba (code; later commits change only this spec)
**Verdict:** Pass with follow-ups

A first audit, on commit 89ed84e, failed on Security S5: `offset` on the admin list had no upper bound (a huge value gave a 500), and the public routes' slugs had no length bound. It also found that two concurrent knife order replaces could fail with a 500. Both were fixed with tests (Implementation notes, "Changes after the first audit"); this table is for commit 46310ba.

All checks ran on a fresh clone of the branch from GitHub, with `api/.env` from `api/.env.example` (database name changed so as not to touch another local database). Test ids are relative to `api/`. Every test named in Implementation notes exists and passes. The tests behind criteria 1 to 30 were read against each criterion by a reviewer who had not written them. Where a committed test is weaker than its criterion, the behaviour was checked with throwaway tests run in a clone and not committed ("probe" below). The probes ran on 89ed84e; the code they exercise is unchanged since, except the knife order lock, whose path `tests/combos/test_knife_order.py::test_replace_the_order` still covers.

| # | Criterion | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Migration round trip; four revisions; tables known | Pass | `tests/test_migrations.py::test_revision_history`, `::test_upgrade_downgrade_upgrade`, `::test_models_match_migrations`, `::test_head_has_only_known_tables`; `uv run alembic check`: no new operations; `alembic history` ends `0003 -> 0004 (head)` |
| 2 | Knife order seeded | Pass | `tests/combos/test_models.py::test_knife_order_is_seeded` (all 20 positions and slugs) |
| 3 | Constraints | Pass | `tests/combos/test_models.py::test_constraints` (every listed case, plus only `to` and `version 0`), `::test_referenced_finishes_and_admins_cannot_be_deleted` |
| 4 | Create returns a draft | Pass | `tests/combos/test_admin_combos.py::test_create_returns_a_draft` (whole body, raw `"rating":8.88`) |
| 5 | Same pairing 409 | Pass | `tests/combos/test_admin_combos.py::test_same_pairing_is_refused` |
| 6 | Create refusals | Pass | `tests/combos/test_admin_combos.py::test_create_refuses_invalid_input` (21 cases, `loc` and listed codes asserted, nothing stored), `::test_finish_bounds_are_inclusive` |
| 7 | Read one; 404; blank description | Pass | `tests/combos/test_admin_combos.py::test_read_one` |
| 8 | Update with version; stale 409 | Pass | `tests/combos/test_admin_combos.py::test_update`, `::test_update_checks_conditions`; probe: the glove range is stored, and slugs sent inside `glove` and `knife` change neither item |
| 9 | Update after the finish retired | Pass | `tests/combos/test_admin_combos.py::test_update_after_the_finish_retired` |
| 10 | Remove | Pass | `tests/combos/test_admin_combos.py::test_remove`, `tests/combos/test_publish.py::test_published_combo_cannot_be_removed` |
| 11 | Publish and unpublish by id | Pass | `tests/combos/test_publish.py::test_publish_and_unpublish_by_id` |
| 12 | `all_drafts` | Pass | `tests/combos/test_publish.py::test_publish_all_drafts` |
| 13 | Publish refusals | Pass | `tests/combos/test_publish.py::test_publish_refuses_bad_requests` |
| 14 | Publishing keeps an open edit valid | Pass | `tests/combos/test_publish.py::test_publishing_does_not_break_an_open_edit` |
| 15 | Filters and totals | Pass | `tests/combos/test_list.py::test_filters`, `::test_bad_filters` |
| 16 | Sorting and paging | Pass | `tests/combos/test_list.py::test_sorting_and_paging`, `::test_bad_filters` (now also an `offset` over the bound); probe: after an update the changed combo comes first with `sort=updated` |
| 17 | Batch finish names | Pass | `tests/combos/test_batches.py::test_batch_finishes` |
| 18 | Candidates | Pass | `tests/combos/test_batches.py::test_candidates`, `::test_candidates_refusals`, `::test_no_knife_has_the_finish` |
| 19 | Save a batch | Pass | `tests/combos/test_batches.py::test_save_a_batch` |
| 20 | Batch refusals, nothing written | Pass | `tests/combos/test_batches.py::test_batch_refusals` (12 cases, count and every combo unchanged); see findings on a retired knife finish |
| 21 | Exact rating steps | Pass | `tests/combos/test_batches.py::test_ratings_step_exactly` |
| 22 | Read the knife order | Pass | `tests/combos/test_knife_order.py::test_read_the_seeded_order` |
| 23 | Replace the knife order | Pass | `tests/combos/test_knife_order.py::test_replace_the_order`, `::test_refuse_a_wrong_order`, `::test_concurrent_replaces_last_write_wins` |
| 24 | Public glove finish combos | Pass | `tests/combos/test_public.py::test_glove_finish_combos`; probe: with Karambit moved before Butterfly in the knife order, their tie reverses |
| 25 | Public knife finish combos | Pass | `tests/combos/test_public.py::test_knife_finish_combos`, `::test_public_slugs_are_bounded`; probe: with the Sport Gloves combo created first, Specialist Gloves still comes first in the tie |
| 26 | No session needed | Pass | `tests/combos/test_public.py::test_public_routes_need_no_session` |
| 27 | Route guard; 401 and 403 | Pass | `tests/admins/test_require_admin.py::test_every_write_route_requires_an_admin`, `::test_the_guard_finds_an_unprotected_write`; `tests/combos/test_guard.py::test_admin_routes_refuse_without_a_session`, `::test_admin_writes_need_the_csrf_token` |
| 28 | `Cache-Control: no-store` | Pass | `tests/combos/test_guard.py` (401s, 403s, 404, 409 `combo_exists`, 422s, reads); probe: 201 create, 200 update, 409 `version_conflict` and `combo_published`, 200 unpublish, 204 remove, 200 batch and 200 knife order replace all carry it |
| 29 | Log events | Pass | `tests/combos/test_guard.py::test_log_events`, `tests/combos/test_admin_combos.py::test_remove` |
| 30 | Schema operations and number types | Pass | `tests/combos/test_schema.py::test_combo_operations_in_schema`, `::test_numbers_are_numbers`; `BatchCreate` and `BatchUpdate` ratings are also `number`; `uv run python -m combo_api.openapi --check` exit 0 |
| 31 | Admin checks; only the types changed | Pass | Clone: `npm ci`, `npm run api:types:check`, `lint`, `typecheck`, `test` (117 passed), `build` (no chunk-size warning), `check:bundle` all exit 0; `git diff --stat origin/main...HEAD -- admin website compose.yaml` lists only `admin/src/api/schema.d.ts` |
| 32 | README | Pass | `api/README.md`: first paragraph, Combos section, OpenAPI snapshot section, Endpoints rows for all 14 operations, Layout row |
| 33 | API checks; image builds | Pass | Clone: `uv sync --locked`, format check, lint, mypy, pytest (282 passed, 0 skipped), OpenAPI and export checks all exit 0; `docker build` exit 0, 228,512,662 bytes |
| 34 | Compose: `[]` and 401 | Pass | Clone, separate Compose project: `migrate` and `catalog` exited 0, `/health/ready` ok, `GET /gloves/specialist/mogul/combos` `[]`, `GET /admin/combos` 401 (and a 65-character slug 422), removed with `down -v`; `.github/workflows/api.yml` has both steps |
| 35 | CI succeeds | Pass | Commit 46310ba: `api` push run 41627625286 (jobs `check` and `docker` succeeded), `admin` 41627625175 and `website` 41627625149 succeeded |
| 36 | No secrets; allowed URLs | Pass | `gitleaks git --log-opts="origin/main..HEAD"` and `gitleaks dir .` on the clone: no leaks; added URLs are `localhost` in the workflow and the repository's own badge links |

| Check | Command | Result |
| --- | --- | --- |
| Install | `uv sync --locked`; `npm ci` (fresh clone) | Pass |
| Lint | `uv run ruff format --check .`, `uv run ruff check .`; `npm run lint` | Pass |
| Type check | `uv run mypy`; `npm run typecheck` | Pass |
| Tests | `uv run pytest` (282 passed, 0 skipped); `npm test` (117 passed); CI | Pass |
| Snapshot checks | `uv run python -m combo_api.openapi --check`, `export-website --check`, `npm run api:types:check` | Pass |
| Build | `docker build`; `npm run build`, `npm run check:bundle`; Compose | Pass |
| Secret scan | `gitleaks git --log-opts="origin/main..HEAD"`, `gitleaks dir .` | Pass |
| Public exposure | Manual review of diff and log: placeholders only, `localhost` and `example.test` addresses, no private hosts or paths; local tool configuration is ignored through the repository's exclude file and nothing private or `.env` is tracked; all 21 commits authored by the owner with one-line messages and no trailers | Pass |
| Design conformance | Independent read and manual review against Requirements, Design, API / data model and Security; the diff since 89ed84e reviewed in full | Pass; the differences below are follow-ups |

**Findings**

- (follow-up) Spec wording: criterion 20 says a `create` item whose knife type has no active finish of the batch's slug gets `finish_not_found`, but Design (Retired finishes) gives `finish_retired` for a retired one. The code follows Design (probe: 422 `finish_retired` at `["body", "create", 0]`), and the test covers only a type without the finish. The owner should settle the wording.
- (follow-up) R18 says existing combos on a retired finish can still be updated. A batch with only `update` items on a retired glove finish is refused with 422 `finish_retired` (probe; `api/src/combo_api/combos/batches.py:64`), though a single `PUT` works and candidates refuse a retired glove anyway. Not recorded.
- (follow-up) Unrecorded 422 codes: `value_error` for a finish filter without its type in the list query, and `string_too_long` for a long description.
- (follow-up) Ratings and float bounds are lax number fields: a rating sent as the string `"8.88"` is accepted (probe: 201). Design says a JSON number. Low risk; strict fields would refuse it.
- (follow-up) `version` (in update and batch bodies and the remove query) has no upper bound. It is only compared in Python and never reaches the database, so a huge value gets 409 `version_conflict`; a bound would match S5 to the letter.
- (follow-up) Design says the first refusal stops a batch; the code reports every 422 problem of the batch at once, then 409s. Harmless, not recorded.
- (follow-up) Row locks are taken in request order (publish and unpublish by `IN` without `ORDER BY`, batch updates one by one), so two concurrent requests over the same combos in different orders could deadlock and one would get a 500. Not probed; rare with a few admins.
- (follow-up) Committed tests weaker than their criteria, confirmed by the probes above: 8 (glove range and full pairing), 16 (`sort=updated` after a change), 24 and 25 (tie order), 28 (`no-store` on successful writes and other 409s), 30 (batch rating types).
- (follow-up) Still open from Implementation notes: the pairing race (500 instead of 409), the catalog's own float range constraint, the workflow not linted with `actionlint` locally, and error codes not declared as an enumeration in the OpenAPI schema.
