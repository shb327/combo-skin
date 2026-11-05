# 012: Screenshot agents

**Status:** Approved
<!-- Lifecycle: Draft → Approved → Implemented → Audited -->

**Section:** api, admin
**Branch:** 012-combo-screenshots

## Summary

Combo screenshots will show the knife and gloves on a game agent's arms, so each combo can name the agent its screenshot is drawn with (for example for custom sleeves), picked in the dashboard from a new agents catalog. Empty means one default agent, Lt. Commander Ricksaw | NSWC SEAL, kept as one setting. Batches get a batch-wide agent with per-knife overrides. The agent is admin-only.

The first draft of this spec also covered image storage, screenshot workers and showing screenshots. When the owner approved it on 2026-11-05, it was split as that draft recommended: this spec keeps Part A, the agents; Parts B and C moved unchanged to spec 015, built after this one. The branch name stays as it was created.

## Goals and non-goals

**Goals**

- Agents in the catalog, from the same dataset and commit as knives and gloves.
- An optional screenshot agent per combo, a batch-wide agent with per-knife overrides, and one default agent setting. Admin-only.
- An agent picker in the dashboard, and a Screenshots page holding the default agent.

**Non-goals**

- Image storage, screenshot workers, the screenshot queue, image versions, the watermark, and showing screenshots on the website or in the dashboard (spec 015).
- The 3D viewer, its embed and the screenshot worker program (built in the viewer project).
- Agents on the public website or in any public response.
- Deployment, pattern groups, combo variations, prices, the submissions inbox, two-factor login, and spec 011's and 014's follow-ups.

## Context

Specs 001 to 011, 013 and 014 are Audited and merged.

**Catalog** (specs 005, 006)

- `api/src/combo_api/catalog/source.py`: `refresh` downloads `public/api/en/skins.json` from ByMykel/CSGO-API at a full commit SHA and normalises it; `snapshot.py` defines the snapshot (`source` with `repository`, `commit`, `file`, `license`; `item_types` with finishes; a `retired` flag on every entry, carried forward by `refresh`). The pinned commit is `cbe5eec1854bf882bf1d79d8d5fd2aac7d80e5bc`.
- `api/src/combo_api/catalog/importer.py` upserts the snapshot into `item_types` and `finishes` (`models.py`), never deleting rows; `validate.py` requires image URLs on the game's public image host. Compose runs the import as the one-shot `catalog` service (`compose.yaml`).
- The dataset's `public/api/en/agents.json` at the same commit (checked for this spec) lists 63 agents (29 Counter-Terrorist, 34 Terrorist), each with `def_index` (a string such as `"5404"`), `name`, `team` (`counter-terrorists` or `terrorists`), `rarity`, `image` (on the same image host as finishes), `model_player` and `original.name` (the codename, such as `customplayer_ctm_st6_varianti`). Definition indexes, names and slugs derived from names are unique. Lt. Commander Ricksaw | NSWC SEAL is definition index 5404, Counter-Terrorist. The dataset has no entry for the game's non-collectible default models.

**Combos** (specs 009, 010)

- `api/src/combo_api/combos/models.py`: `combos` with `public_id`, both finish ids, float ranges, seeds, rating, description, `status`, `version` (raised by every content change) and the admins who created and changed it. `schemas.py`: `ComboIn`, `ComboUpdate` (a full replacement of rating, description and both conditions, with `version`), `BatchIn` with `create` items (each with its own resolved conditions; batch-wide values are resolved by the dashboard) and `update` items (rating and description only), `Item`, `PublicCombo`, `AdminCombo`.
- `api/src/combo_api/combos/admin_routes.py`: create, list, get, update, remove, publish, unpublish, batches, knife order, all behind `require_admin` (`api/src/combo_api/admins/deps.py`). `public_routes.py`: the two public combo lists and `GET /combo-counts`.
- Migrations `0001` to `0004`.

**Admin** (specs 008, 010)

- `admin/src/pages/AddComboPage.tsx`, `BatchPage.tsx` with `src/combos/batch.ts` (batch-wide values and per-row overrides with Clear), `EditComboPage.tsx`, `src/combos/Picture.tsx`, `src/combos/FinishSearch.tsx` (the combobox pattern), `src/pages/HomePage.tsx` (a Knife order section linking to its page).
- `admin/vite.config.ts` builds the CSP: `img-src 'self'` plus the game's image host, where agent pictures also are.

## Requirements

- R1. The catalog snapshot lists every agent of the source dataset at the snapshot's commit: definition index, codename, English name, team (`ct` or `t`), rarity, image URL and `retired`. `refresh` downloads the agents file from the same commit as the skins file, and the snapshot records both files.
- R2. Agents are validated like other catalog entries (unique definition index and codename, image on the game's image host), carried forward as retired when they leave the dataset, and imported into their own table by the same idempotent `import`, never deleted.
- R3. One default screenshot agent is stored as a setting, seeded with Lt. Commander Ricksaw | NSWC SEAL (definition index 5404). Changing it changes no combo row.
- R4. A combo has an optional screenshot agent. Empty means the default agent. Creating and editing a combo sets it; it is part of the combo's content, so changing it raises `version`. A retired agent cannot be chosen for a new choice; a combo that already has one keeps it.
- R5. A batch has a batch-wide screenshot agent, and each new knife row can override it, as with float ranges and seeds. Rows updating an existing combo keep that combo's agent.
- R6. The screenshot agent and the default agent appear only in admin responses. No public response mentions agents.
- R7. The dashboard picks an agent from a searchable list with each agent's picture, name and team, and shows "Default" with the default agent's name and picture when the combo has none. The default agent is changed on a Screenshots page, after a confirmation that says how many combos use the default agent.
- R8. `api/README.md` and `admin/README.md` are updated; the OpenAPI snapshot includes the new routes and fields; the admin's and the website's generated types are regenerated.

## Design

The owner chose every recommendation of the first draft on 2026-11-05; those rows are marked "owner's choice".

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| Source | `public/api/en/agents.json` of ByMykel/CSGO-API at the snapshot's commit, downloaded by the same `refresh`; `source` gains `agents_file`, so `--commit` covers both files | A second command and commit for agents: two commits to keep in step for one snapshot |
| Identity | The game's definition index, as the viewer uses. The API names agents by definition index in requests and responses; no slugs, since agents have no pages | Slugs: no URL needs them, and the viewer would need a mapping back |
| Fields kept | `def_index`, `codename` (`original.name`), `name`, `team` (`ct` or `t`), `rarity`, `image_url`, `retired`. Not the description, collections or model path | The model path: the viewer resolves models from the definition index |
| Order | Counter-Terrorists first, then Terrorists, each by name. No hand-kept order file | A display order file like finishes: 63 rows in a picker with search do not need curating |
| Table | `agents`, with an identity `id`, unique `def_index` and `codename`, never deleted; retired rows `active: false` | Storing agents as JSON in the setting: no foreign key from combos |
| Combo field | `combos.screenshot_agent_id`, nullable, foreign key to `agents.id`; null means the default | Copying the default into every combo: changing the default would touch every row, which the owner ruled out |
| Default agent setting (owner's choice) | A one-row table `screenshot_settings` holding `default_agent_def_index`, seeded with 5404 by the migration (a definition index, not a foreign key, because the migration runs before the catalog import, as `knife_order` does), changed on the dashboard's Screenshots page by any admin, logged. Spec 015 makes a change of default re-render the combos without their own agent | An environment variable: a deploy to change a choice the owner makes in the dashboard. A constant in code: the same, plus a review |
| Request shape | `ComboIn.screenshot_agent` (definition index or null, default null). `ComboUpdate.screenshot_agent` is required (null allowed), so a client that forgets it gets 422 instead of silently resetting it to the default. `BatchCreate.screenshot_agent` per row, resolved by the dashboard from the batch-wide value and overrides, as conditions are (spec 009). `BatchUpdate` unchanged: updated rows keep their agent, as they keep their conditions | A batch-wide field in the API: the rule would live in two places (spec 009, Batch defaults) |
| Dashboard display (owner's choice) | A picker button showing the picture and name; for null, the default agent's picture and name with a "Default" tag. The list opens with "Default (<name>)" first, then the agents grouped CT and T, searchable by any word of the name, with the combobox pattern of `FinishSearch`. In a batch: a batch-wide picker and a per-row "own value" with Clear, like the batch's conditions; a row's own choice may be "Default" | A plain select: 64 options without pictures |
| Screenshots page | `/screenshots`, linked from a Home section below Knife order, shown the same way. It holds the default agent with its picker; changing it asks for confirmation with the number of combos using the default. Spec 015 adds workers and failed screenshots to it | A setting on Home: Home is for the combo work; spec 015 needs a page for workers anyway |
| Size (owner's choice) | The first draft split in two: this spec (agents) and spec 015 (storage, workers, images, showing screenshots) | One implementation and one audit for all of it: larger than spec 010, the largest so far |

## API / data model

### Snapshot

`source` gains `"agents_file": "public/api/en/agents.json"`. A top-level `agents` list, ordered by definition index:

```json
{
  "codename": "customplayer_ctm_st6_varianti",
  "def_index": 5404,
  "image_url": "<Steam economy image URL>",
  "name": "Lt. Commander Ricksaw | NSWC SEAL",
  "rarity": {"code": "rarity_ancient_character", "color": "#eb4b4b", "name": "Master"},
  "retired": false,
  "team": "ct"
}
```

### Tables (migration `0005_agents`)

`agents`: `id` integer identity; `def_index` integer unique; `codename` text unique; `name` text; `team` text (`ct` or `t`, check); `rarity_code`, `rarity_name`, `rarity_color` text; `image_url` text; `active` boolean; `created_at`, `updated_at`.

`combos` gains `screenshot_agent_id` integer, nullable, foreign key to `agents.id`, `ON DELETE RESTRICT`.

`screenshot_settings`: `id` integer primary key, check `id = 1`; `default_agent_def_index` integer; `updated_at` timestamptz; `updated_by` integer nullable, foreign key to `admins.id`. Seeded with one row, 5404.

### Shapes

```json
// Agent
{"def_index": 5404, "name": "Lt. Commander Ricksaw | NSWC SEAL", "team": "ct",
 "image_url": "<Steam economy image URL>", "rarity": {"code": "...", "name": "Master", "color": "#eb4b4b"}, "active": true}

// ScreenshotSettings
{"default_agent": Agent, "using_default": 140}
```

`AdminCombo` gains `screenshot_agent` (Agent or null). `ComboIn` gains `screenshot_agent` (integer or null, default null); `ComboUpdate` gains `screenshot_agent` (required, integer or null); `BatchCreate` gains `screenshot_agent` (integer or null, default null). `using_default` counts the combos, in any status, without their own agent. `PublicCombo` does not change.

### Routes

Admin (tag `admin`, `require_admin`, `ADMIN_RESPONSES`, `no-store`):

| Route | Operation ID | Request → response |
| --- | --- | --- |
| `GET /admin/agents` | `list_agents` | → `200 [Agent]`, active agents in display order |
| `GET /admin/screenshot-settings` | `get_screenshot_settings` | → `200 ScreenshotSettings` |
| `PUT /admin/screenshot-settings` | `replace_screenshot_settings` | `{"default_agent": 5404}` → `200 ScreenshotSettings` |

### Errors

| Status | Code | When |
| --- | --- | --- |
| 422 | `agent_not_found`, `agent_retired` | Unknown agent, or a retired one for a new choice (combo, batch row or default) |

### Log events

Logger `combo_api.combos`: `default agent changed` (admin, `def_index`, `using_default`). `combo created` and `combo updated` are unchanged.

## Security

- S1. The new routes require an authenticated, enabled admin through `require_admin`; the existing guard test covers them. `PUT /admin/screenshot-settings` needs an allowed Origin and the CSRF token (spec 007).
- S2. No public response contains an agent or the default agent: the public combo lists and `GET /combo-counts` are unchanged.
- S3. Agent pictures are shown only from the game's image host, without a referrer, under the admin CSP as it is; agent names are rendered as text.
- S4. `refresh` still downloads only from the dataset's public repository at a full commit SHA, and validation rejects agent images on any other host. No new setting, secret or dependency.

## Acceptance criteria

API checks run in `api/` with pytest against the test database; admin checks in `admin/` with Vitest and the fake API.

1. `snapshot.json` has `source.agents_file` and 63 agents (29 `ct`, 34 `t`), all `retired: false`; Lt. Commander Ricksaw | NSWC SEAL is `def_index` 5404, codename `customplayer_ctm_st6_varianti`, team `ct`. `refresh --commit <the recorded commit>` reproduces the file byte for byte.
2. Validation tests: a duplicate agent definition index or codename, a team other than `ct` or `t`, and an agent image on another host each fail naming the agent. Normaliser tests: an agent missing from the dataset is kept with `retired: true`; one that comes back is no longer retired.
3. Migration `0005` upgrades, downgrades and upgrades again; `alembic check` reports nothing; the migration tests know the new tables; `screenshot_settings` holds one row with 5404 after migrating.
4. Importing the snapshot into an empty catalog inserts 63 agents; a second import changes nothing; a retired agent becomes inactive with the same `id`. In Compose, `catalog` reports the agents with the other rows.
5. `GET /admin/agents` returns the active agents, Counter-Terrorists first, each by name, with the Agent fields; without a session it returns 401.
6. Creating a combo without `screenshot_agent` stores null and returns `screenshot_agent: null`; with 5404 it returns the Agent. Updating with another agent raises `version`; an update body without `screenshot_agent` gets 422; an unknown definition index gets 422 `agent_not_found`; a retired agent gets 422 `agent_retired` for a new choice, while updating a combo that already has that retired agent with the same agent succeeds.
7. A batch whose `create` items carry different `screenshot_agent` values stores each; `update` items leave the combo's agent unchanged.
8. `GET /admin/screenshot-settings` returns the default agent and `using_default`. `PUT` with an active agent changes the default, returns `using_default` equal to the number of combos without their own agent, changes no row of `combos`, and is logged; a retired or unknown agent gets 422. The raw bodies of both public combo routes and `GET /combo-counts` contain no `agent`.
9. Admin tests: the add and edit pages show the picker with "Default" and the default agent's name and picture when the combo has none; choosing an agent by keyboard alone (type, Down, Enter) sends its definition index; "Use default" sends null. In a batch, a batch-wide agent reaches every new row, a row's own agent replaces it for that row only, a row's own "Default" sends null while the batch-wide agent is set, and Clear returns the row to the batch-wide value; updated rows send no agent.
10. Admin test: changing the default agent on the Screenshots page opens a confirmation stating how many combos use the default agent; Cancel sends nothing; Confirm sends `PUT /admin/screenshot-settings`.
11. `api/openapi.json` contains the three routes with their operation IDs and the new fields; `uv run python -m combo_api.openapi --check` exits 0; `npm run api:types:check` exits 0 in `admin/` and `website/`.
12. `api/README.md` documents agents in the catalog section, the screenshot agent of combos and batches, the default agent and the new routes; `admin/README.md` the agent picker and the Screenshots page.
13. In `api/`: `uv run ruff format --check .`, `uv run ruff check .`, `uv run mypy`, `uv run pytest` (no skipped tests), the OpenAPI check and `export-website --check` exit 0; `docker build -t combo-skin-api api` exits 0. In `admin/`: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` (no chunk-size warning) and `npm run check:bundle` exit 0. In `website/`: `npm run api:types:check`, `npm test` and `npm run build` exit 0.
14. After the branch is pushed, the `api`, `admin` and `website` workflow runs for its latest commit succeed on GitHub. `gitleaks dir . --no-banner --redact` on a clean clone and `gitleaks git` over the branch report no findings; URLs added are only `localhost`, `example.com` placeholders, the game's image host, the dataset's repository and public documentation.

## Test plan

| Criterion | How it is checked |
| --- | --- |
| 1, 2 | pytest: snapshot, validation and normaliser tests on the raw fixtures (no network); `refresh` with the recorded commit, then `git diff --exit-code` |
| 3, 4 | pytest: migration and import tests; `docker compose up -d --wait`, `docker compose logs catalog` |
| 5 to 8 | pytest: route tests in `tests/combos/` through `client`, reading the raw body for criterion 8 |
| 9, 10 | Vitest: `AddComboPage.test.tsx`, `EditComboPage.test.tsx`, `BatchPage.test.tsx`, a new `ScreenshotsPage.test.tsx` |
| 11 to 13 | The commands in the criteria; read the READMEs |
| 14 | Workflow run pages (after the owner pushes); the gitleaks commands; `git diff main... \| grep -oE 'https?://[^ )>"]+' \| sort -u` |

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
npm run check:bundle
```

In `website/`:

```bash
npm ci
npm run api:types:check
npm test
npm run build
```

## Open questions

None. On 2026-11-05 the owner approved the first draft with every recommendation, including the default agent as a one-row setting on a dashboard Screenshots page, "Default" with Ricksaw's name and picture for combos without their own agent, and splitting the draft into this spec and spec 015. The answers are recorded in Design.

## Implementation notes

Filled in during implementation: deviations from the design and why, follow-ups discovered, and which test covers each acceptance criterion.

## Audit

Filled in by the audit: one line per acceptance criterion (pass or fail, with evidence), the results of lint, tests, build and the secret scan, and a verdict of Pass, Pass with follow-ups, or Fail.
