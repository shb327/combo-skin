# 012: Screenshot agents

**Status:** Audited
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

Built on `012-combo-screenshots`, from `main` at the merge of spec 014. The first draft of this spec and its split into this spec and spec 015 are the branch's first two commits.

### Deviations

None that change a requirement. Smaller details the spec left open:

- **Snapshot conversion.** `source.agents_file` is required, so the committed snapshot was converted once by adding it and an empty `agents` list; `refresh --commit cbe5eec…` then wrote the 63 agents. The snapshot diff only adds lines: no knife or glove entry changed. A second `refresh` reproduces the file byte for byte.
- **Snapshot model.** `Snapshot.agents` defaults to an empty tuple, so snapshots built in tests without agents still load; `refresh` always writes it. `Agent.team` is a plain string in the snapshot model and is checked by validation, so a bad team is reported naming the agent rather than as a parse error. `source.download` takes the file as a second argument, defaulting to `skins.json`.
- **Layout.** The agent and default agent routes are in `api/src/combo_api/combos/agents.py`; `ScreenshotSettings` is in `combos/models.py` and `Agent` in `catalog/models.py`.
- **Refresh report.** Agents retired or back since the previous snapshot are listed with the types and finishes; the summary line also counts agents.
- **Edit page.** The version conflict view also lists the screenshot agent when it differs.
- **Existing tests changed by the new required field:** update bodies in `api/tests/combos/` gained `"screenshot_agent": null`; the expected create and batch bodies in the admin tests gained `screenshot_agent`; the edit page's "no inputs for the pairing" check now allows the agent search as the only combobox; Home lists a Screenshots section; the edit page's pictures include the default agent's.
- **Compose check (criterion 4).** The owner's own Compose stack was running with their data, so the check ran as a separate Compose project (`-p combo-skin-012`) with the published ports removed by an override file outside the repository: `migrate` and `catalog` exited 0 (`761 inserted`), a second `catalog` run reported `761 unchanged`, and inside the stack `GET /gloves/specialist/mogul/combos` returned `[]` and `GET /admin/agents` and `GET /admin/screenshot-settings` returned 401. The project was removed afterwards with its volume.
- **Image.** Built as `combo-skin-api-012`, not `combo-skin-api`, so the owner's local image was not replaced: 228,571,793 bytes.

### Follow-ups

- `admin/src/combos/FinishSearch.tsx` now also searches agents; a more general name would fit it.
- Spec 015 builds on this one: render inputs, re-rendering on a change of default, and the rest of the Screenshots page.

### Criterion coverage

Test ids are relative to `api/` or `admin/`.

| Criterion | Covered by |
| --- | --- |
| 1 | `tests/catalog/test_snapshot.py::test_snapshot_records_its_source`, `::test_snapshot_agents`, `::test_snapshot_is_written_canonically`; `tests/catalog/test_source.py::test_agents_are_normalised`, `::test_refresh_downloads_agents_from_the_same_commit`; `refresh --commit cbe5eec…` twice, then `git diff --exit-code` on `snapshot.json`: no change |
| 2 | `tests/catalog/test_validate.py::test_duplicate_agent_definition_index`, `::test_duplicate_agent_codename`, `::test_agent_team`, `::test_agent_image_host` (another host, plain `http`); `tests/catalog/test_source.py::test_missing_agent_is_kept_retired`, `::test_refresh_downloads_agents_from_the_same_commit` (the retired agent in the report) |
| 3 | `tests/test_migrations.py::test_revision_history`, `::test_upgrade_downgrade_upgrade`, `::test_models_match_migrations`, `::test_head_has_only_known_tables`, `::test_default_agent_is_seeded`; `uv run alembic check`: no new operations; `alembic history`: `0001` to `0005` |
| 4 | `tests/catalog/test_importer.py::test_import_into_empty_catalog` (29 CT, 34 T), `::test_second_import_changes_nothing`, `::test_every_agent_matches_its_row`, `::test_retired_agent_is_deactivated_in_place`, `::test_agent_missing_from_snapshot_is_deactivated`, `::test_reused_agent_codename_is_refused`; Compose, as in Deviations |
| 5 | `tests/combos/test_agents.py::test_list_agents` |
| 6 | `tests/combos/test_agents.py::test_create_with_and_without_an_agent`, `::test_update_sets_the_agent`, `::test_update_needs_the_agent_field`, `::test_unknown_and_retired_agents` |
| 7 | `tests/combos/test_agents.py::test_batch_rows_carry_their_agents`, `::test_batch_refuses_an_unknown_agent` |
| 8 | `tests/combos/test_agents.py::test_default_agent_setting`, `::test_default_agent_refusals`, `::test_public_responses_have_no_agent` |
| 9 | `src/pages/AddComboPage.test.tsx` "the screenshot agent" (2 tests), `src/pages/EditComboPage.test.tsx` "the screenshot agent of a combo" (2 tests, including a retired agent the combo keeps), `src/pages/BatchPage.test.tsx` "screenshot agents in a batch" (2 tests) |
| 10 | `src/pages/ScreenshotsPage.test.tsx` (2 tests) |
| 11 | `tests/combos/test_schema.py::test_agent_operations_in_schema`; `uv run python -m combo_api.openapi --check` exit 0; `npm run api:types:check` exit 0 in `admin/` and `website/` |
| 12 | `api/README.md` Catalog, Combos (screenshot agent, batches, default agent), Endpoints and Layout; `admin/README.md` Screens, screenshot agents and Project structure |
| 13 | In `api/`: format check, lint, mypy (80 files), `pytest` (347 passed, none skipped), OpenAPI check and `export-website --check` exit 0; `docker build` exit 0. In `admin/`: `npm ci`, `api:types:check`, `lint`, `typecheck`, `npm test` (299 passed), `build` (no chunk-size warning) and `check:bundle` exit 0. In `website/`: `api:types:check`, `lint`, `npm test` (94 passed) and `build` exit 0 |
| 14 | Pending: workflow runs after the owner pushes. `gitleaks git` over the branch and `gitleaks dir .`: no leaks. URLs added outside the generated snapshot and the agents fixture: the game's image host and an `example.com` placeholder in tests, and the dataset's raw-file URL template (now taking the file name) |

## Audit

**Date:** 2026-11-06 · **Branch:** 012-combo-screenshots · **Commit:** be39817
**Verdict:** Pass with follow-ups

All checks ran on a fresh clone of the branch, with `api/.env` copied from `api/.env.example` (database port changed to a separate test database) and no `admin/.env` or `website/.env`. Test ids are relative to `api/` or `admin/`. Where a committed test is weaker than its criterion, the behaviour was also checked with throwaway tests run in the clone and not committed ("probe" below). The code was also read against Design, API / data model and Security independently of the Implementation notes.

| # | Criterion | Result | Evidence |
| --- | --- | --- | --- |
| 1 | 63 agents with the source file recorded; refresh reproduces | Pass | `tests/catalog/test_snapshot.py::test_snapshot_records_its_source`, `::test_snapshot_agents`, `::test_snapshot_is_written_canonically`; `refresh --commit cbe5eec…` in the clone, then `git diff --exit-code` on `snapshot.json`: exit 0; against `main` the snapshot diff only adds lines |
| 2 | Agent validation names the agent; retired carry-forward | Pass | `tests/catalog/test_validate.py::test_duplicate_agent_definition_index`, `::test_duplicate_agent_codename`, `::test_agent_team`, `::test_agent_image_host` (2 cases); `tests/catalog/test_source.py::test_missing_agent_is_kept_retired` (retired, then back, equal to the first snapshot) |
| 3 | Migration `0005`; default agent seeded | Pass | `tests/test_migrations.py::test_revision_history`, `::test_upgrade_downgrade_upgrade`, `::test_models_match_migrations`, `::test_head_has_only_known_tables`, `::test_default_agent_is_seeded`; `uv run alembic check`: "No new upgrade operations detected"; `alembic history`: `0004 -> 0005 (head)` |
| 4 | Import inserts, re-runs and deactivates agents; Compose | Pass | `tests/catalog/test_importer.py::test_import_into_empty_catalog`, `::test_second_import_changes_nothing`, `::test_retired_agent_is_deactivated_in_place`, `::test_agent_missing_from_snapshot_is_deactivated`, `::test_every_agent_matches_its_row`, `::test_reused_agent_codename_is_refused`; the clone's Compose stack as a separate project without published ports: `migrate` and `catalog` exited 0 (`761 inserted`), a second `catalog` run `761 unchanged` |
| 5 | `GET /admin/agents` order, fields, 401 | Pass | `tests/combos/test_agents.py::test_list_agents`; in the Compose stack, 401 without a session |
| 6 | Create, update, required field, unknown and retired agents | Pass | `tests/combos/test_agents.py::test_create_with_and_without_an_agent`, `::test_update_sets_the_agent`, `::test_update_needs_the_agent_field`, `::test_unknown_and_retired_agents` |
| 7 | Batch rows carry their agents; updates keep theirs | Pass | `tests/combos/test_agents.py::test_batch_rows_carry_their_agents`, `::test_batch_refuses_an_unknown_agent`; probe: a retired agent in a batch row gets 422 `agent_retired` |
| 8 | Default agent setting; no agent in public bodies | Pass | `tests/combos/test_agents.py::test_default_agent_setting`, `::test_default_agent_refusals`, `::test_public_responses_have_no_agent`; see findings on test strength |
| 9 | Picker on add and edit; batch-wide and own agents | Pass | `src/pages/AddComboPage.test.tsx` "the screenshot agent", `src/pages/EditComboPage.test.tsx` "the screenshot agent of a combo", `src/pages/BatchPage.test.tsx` "screenshot agents in a batch", `src/combos/pictures.test.tsx` (the default agent's picture on the edit page); probe: the add page shows the default agent's picture |
| 10 | Screenshots page confirmation | Pass | `src/pages/ScreenshotsPage.test.tsx` (Home link, confirmation with the count, Cancel sends nothing, Confirm sends the `PUT`) |
| 11 | OpenAPI and generated types | Pass | `tests/combos/test_schema.py::test_agent_operations_in_schema`; `uv run python -m combo_api.openapi --check` exit 0; `npm run api:types:check` exit 0 in `admin/` and `website/` |
| 12 | READMEs | Pass | `api/README.md` Catalog, Combos (screenshot agent, batches, default agent), Endpoints, Layout; `admin/README.md` Screens, screenshot agents, Project structure |
| 13 | Section checks | Pass | See the checks table |
| 14 | CI on GitHub; gitleaks | Pending | gitleaks clean (below). The workflow runs wait on a push of the branch |

| Check | Command | Result |
| --- | --- | --- |
| Lint | `uv run ruff format --check .`, `uv run ruff check .`; `npm run lint` in `admin/` and `website/` | Pass |
| Type check | `uv run mypy` (80 files); `npm run typecheck` in `admin/` | Pass |
| Tests | `uv run pytest` (347 passed, none skipped); `npm test` in `admin/` (299 passed) and `website/` (94 passed); `npm run api:types:check` in both apps | Pass |
| Snapshot checks | `uv run python -m combo_api.openapi --check`, `uv run python -m combo_api.catalog export-website --check` | Pass |
| Build | `npm ci && npm run build` and `npm run check:bundle` in `admin/`, `npm ci && npm run build` in `website/` (no chunk-size warning); `docker build` of `api/` (228,571,793 bytes) | Pass |
| Secret scan | `gitleaks git` over the branch's 10 commits, `gitleaks dir .` on the clean clone | Pass |
| Public exposure | Diff and log reviewed: URLs added are the game's image host and an `example.com` placeholder in tests and the dataset's raw-file template; no hosts, addresses, local paths or secrets; `.claude/` and `CLAUDE.md` ignored through the repository's local exclude file and nothing private or `.env` tracked; 10 commits authored by the owner, one line each, no trailers | Pass |
| Design conformance | Code read against Design, API / data model and Security | Pass, with an unrecorded difference in the picker (findings) |

**Findings**

- (follow-up) Unrecorded difference from Design, Dashboard display: the agent list does not open on focus with "Default (<name>)" first and the agents grouped CT and T. It shows only once something is typed (`admin/src/combos/FinishSearch.tsx:35`), "Default (…)" appears only when the typed words match it, and teams are a "· CT" / "· T" suffix in CT-first order rather than groups. R7 and criterion 9 are met: the list is searchable and shows picture, name and team.
- (follow-up) `agent_not_found` and `agent_retired` have no fixed message in `admin/src/combos/problems.ts` and `screenshot_agent` maps to no field, so a refusal (for example an agent retired after the list loaded) shows "The API refused this value." in the form's summary, not at the picker.
- (follow-up) Edge cases the spec leaves open: `GET` and `PUT /admin/screenshot-settings` answer 500 when the default agent is not in the catalog yet (`api/src/combo_api/combos/agents.py:34`, before the first import), which also leaves every picker on its error state; and if the default agent is ever retired, the Screenshots page shows "Agent 5404" without a picture, since it passes no `known` agent (`admin/src/pages/ScreenshotsPage.tsx`).
- (follow-up) Security S1 says the existing guard test covers the new routes. The structural guard (`tests/admins/test_require_admin.py`) does, but `tests/combos/test_guard.py` (401 without a session, 403 without the CSRF token, `no-store` on refusals for every admin route) does not list the three new routes; `test_agents.py` covers 401 on both `GET`s and 403 on the `PUT` only.
- (follow-up) Tests weaker than their criteria, though the behaviour is right: no committed test sends a retired agent in a batch row (probe above); the add page test checks the "Default" tag and name but not the picture (probe above); `using_default` is tested with drafts only, not across statuses; the admin fake accepts an update without `screenshot_agent` (`admin/src/test/fakeCatalog.ts`), where the real API answers 422.
- (follow-up) Recorded in Implementation notes: `FinishSearch` now also searches agents and could have a more general name.
- (follow-up) Criterion 14 waits on a push: record the workflow runs for the branch's latest commit here once they succeed.
