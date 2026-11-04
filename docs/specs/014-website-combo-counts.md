# 014: Real combo counts on the website

**Status:** Draft
<!-- Lifecycle: Draft → Approved → Implemented → Audited -->

**Section:** website, api
**Branch:** 014-website-combo-counts

## Summary

A visitor sees which glove and knife finishes have combos before clicking into them. One new public API endpoint returns the number of published combos of every finish in one request; the finish cards on `/gloves/{type}` and `/knives/{type}` show that number, and a "Has combos" filter hides the finishes without any. Most of the 670 finishes will have no combos for a long time, so today a visitor clicks blind.

## Goals and non-goals

**Goals**

- `GET /combo-counts`: the published combo count of every glove finish and every knife finish that has at least one, in one response, with the public CORS of spec 011.
- Finish cards on the glove and knife type pages show "18 combos" or "1 combo"; finishes without combos show no count.
- A "Has combos" filter on those pages, kept in the URL.
- The glove and knife type cards on `/gloves` and `/knives` show the type's total.
- The counts never block browsing: while they load or when they fail, the type pages work as today.

**Non-goals**

- Counts in the header search dropdown, and a "Has combos" filter on `/gloves`, `/knives` or search: follow-ups for a later spec.
- Sorting finishes by count, or putting finishes with combos first.
- Changes to the combos page, including its header count (spec 011, R6).
- A redesign: cards keep their picture, name, hover effect and grid.
- Caching headers on public API responses, and edge caching (the `deploy/` spec).
- Screenshots and R2 (spec 012), the 3D viewer, pattern groups, combo variations, prices, the submissions inbox, two-factor login, deployment, admin changes, and spec 011's other follow-ups.

## Context

Specs 001 to 011 and 013 are Audited and merged. Spec 011 lists this work as its "combo counts" follow-up.

**API**

- `api/src/combo_api/combos/public_routes.py`: `GET /gloves/{type_slug}/{finish_slug}/combos` and `GET /knives/{type_slug}/{finish_slug}/combos`, tag `combos`. Both find the finish by slugs, retired or not (404 when unknown), and list its combos with `status = 'published'`, whatever the other item's state. No `Cache-Control` header.
- `api/src/combo_api/combos/models.py`: `combos` has `glove_finish_id` and `knife_finish_id` (foreign keys to `finishes.id`), `status` (`draft`, `published`, `unpublished`) and a unique constraint on `(glove_finish_id, knife_finish_id)`, whose index leads with `glove_finish_id`; `knife_finish_id` has its own index. `status` has no index.
- `api/src/combo_api/catalog/routes.py`: `GET /gloves/{type_slug}` and `GET /knives/{type_slug}` (tag `catalog`), so any path of the form `/gloves/<word>` is a glove type route.
- `api/src/combo_api/main.py`: `PublicCors` adds `Access-Control-Allow-Origin: *` and `Vary: Origin` to `GET` responses of routes with a tag in `PUBLIC_TAGS` (`catalog`, `combos`). `api/tests/test_cors.py` checks every route with those tags in `api/openapi.json`, so a new route tagged `combos` is covered by the existing test.
- `api/openapi.json` is checked by `uv run python -m combo_api.openapi --check`; `website/src/api/schema.d.ts` and `admin/src/api/schema.d.ts` are generated from it and checked by each app's `npm run api:types:check` in CI.
- `.github/workflows/api.yml`: the Compose smoke test checks `GET /gloves/specialist/mogul/combos` returns `[]` and its public CORS header.
- `api/README.md`: the public routes table and the Public CORS paragraph.

**Website**

- `website/src/pages/GloveFinishes.tsx` and `KnifeFinishes.tsx`: a title, the line "Pick a finish to find matching knife combinations" (or glove), and a grid of finish cards in the bundled catalog's order, each a link to the finish's combos page with its picture and name. Spec 011 removed a strip at the bottom of each card (`bg-white/5 py-2 px-4`, "{n} combos" with the number in white, semibold) that showed possible pairings, not combos.
- `website/src/components/ItemCard.tsx`: the type cards on `SearchGloves.tsx` and `SearchKnives.tsx`, with the same strip reading "{n} available", the type's number of finishes.
- `website/src/api/client.ts`: the only module that makes requests; `finishCombos` with `ApiError` reasons `network`, `not_found` and `http`.
- `website/src/api/queries.ts`: `createQueryClient` (stale after 5 minutes, `COMBOS_STALE_MS`; no refetch on focus; `networkMode: 'always'`; one retry except after a 404) and `useFinishCombos`, key `["combos", kind, type, finish]`.
- `website/src/pages/Combos.tsx`: `comboCount` gives "15 combos", "1 combo" or "No combos yet" for the header.
- `website/src/pages/FinishCards.test.tsx`: checks that finish cards show no count and send no request, and that type cards keep "{n} available".
- `website/src/test/fakeApi.ts`: the fake API used by tests, answering combos by path.
- `website/src/components/Search.tsx`: the header search dropdown, six results of finish names, no counts.
- The catalog has 8 glove types with 94 finishes and 20 knife types with 576. A knife type page shows up to 35 finishes.
- A local database with the owner's data has 72 published combos on 4 glove finishes; the owner is entering about 300, and about 2,000 are planned.

## Requirements

**API**

- R1. `GET /combo-counts` returns, for every glove finish and every knife finish with at least one published combo, its number of published combos, keyed by type slug and finish slug. Finishes without published combos are left out. Drafts and unpublished combos are never counted.
- R2. A finish's count equals the length of the list its own public combos route returns at the same moment, for every finish, including retired finishes and combos whose other item is retired.
- R3. The route is tagged `combos`, so it gets the public CORS headers of spec 011; it sends no `Cache-Control` header.
- R4. `api/openapi.json` includes the route and its schema; `website/src/api/schema.d.ts` and `admin/src/api/schema.d.ts` are regenerated from it; `api/README.md` lists the route.

**Finish cards**

- R5. Once the counts load, each finish card on `/gloves/{type}` and `/knives/{type}` with combos shows its count in a strip at the bottom of the card, as the removed strip looked: "18 combos", "1 combo". A finish without combos shows no strip and no text.
- R6. While the counts load, and when they fail, the cards show no count and the page works as today. A failed count shows no message and never blocks a link.
- R7. When a visitor opens a finish's combos page and comes back, its card shows the number of combos that page listed.

**Filter**

- R8. Once the counts load, the type page shows a "Has combos" control. Turned on, it hides the finishes without combos; the others keep the catalog's order.
- R9. The filter is off by default. Turning it on adds `?has=combos` to the URL, turning it off removes it, without adding a history entry. Opening a URL with `?has=combos` starts with the filter on. Any other value of `has` is ignored.
- R10. While the counts load, and when they fail, the control is not shown and every finish shows, whatever the URL says.
- R11. With the filter on and no finish of the type having combos, the page says "No {type name} finishes have combos yet." with a "Show all finishes" button that turns the filter off.

**Type cards**

- R12. Once the counts load, each type card on `/gloves` and `/knives` whose finishes have combos adds the total to its strip: "94 available · 34 combos". The total is the sum of the counts of the finishes in the bundled catalog. A type without combos, and every type while loading or after a failure, shows "{n} available" as today.

**Unchanged**

- R13. The combos page, its header count and its request are unchanged. Search and the home page send no counts request.

## Design

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| Path (owner's choice) | `GET /combo-counts`, a top-level path next to `/gloves` and `/knives`, tag `combos`, operation ID `get_combo_counts`, in `public_routes.py` | `/gloves/combo-counts` and `/knives/combo-counts`: two requests for one page that wants both later (search), and `/gloves/<word>` is already the glove type route, so `combo-counts` would read as a type slug. `/combos/counts`: suggests a public `/combos` collection that does not exist. A `combo_count` on the catalog routes: the website does not call them (spec 011). Spec 011's follow-up already named `/combo-counts` |
| Shape (owner's choice) | `{"gloves": {"specialist": {"crimson-kimono": 18}}, "knives": {"karambit": {"doppler-ruby": 1}}}`: by kind, then type slug, then finish slug, non-zero counts only. Both kinds always present, `{}` when empty | Flat keys such as `"specialist/crimson-kimono"`: a string format the client must split and the schema cannot describe; a type's total needs a prefix scan. Every finish with zeros: up to 670 entries, most of them 0, for nothing the website cannot infer. A list of `{kind, type, finish, count}` rows: the website would build the same map on every load |
| Retired finishes | Counted like the others, as the list routes return their combos (R2). The website looks up only the finishes in its bundled catalog, so it never shows them | Leaving them out: a count that differs from the API's own list for that finish |
| Cache-Control (owner's choice) | None, as on the other public routes. The website's in-memory cache already avoids repeat requests within a visit (5 minutes). The `deploy/` spec decides caching for all public routes at once, including Cloudflare and `Vary: Origin` (spec 011 follow-up) | `public, max-age=60`: on a reload the browser could keep counts older than the finish's freshly fetched list, which is the mismatch R7 avoids; and one route caching differently from the lists invites edge caching rules per route |
| One count rule | The counts query and the two list routes use one shared "published" condition in `combos/queries.py`, so they cannot drift. A test compares every count with its list (R2) | Two hand-written `WHERE` clauses: the drift R2 is about |
| Query cost | Two grouped queries, one per kind: `combos` joined to `finishes` and `item_types` for slugs, `WHERE status = 'published'`, `GROUP BY` the finish. At 2,000 rows Postgres reads the whole table either way, well under a millisecond; the response is at most a few hundred entries. No index and no migration | An index on `status`: most rows will be published, so the planner would not use it. A counts table or materialised view kept in step on every publish: write-path code and a staleness risk for a read that is already cheap. Revisit past about 100,000 combos |
| Website request | `Api.comboCounts(signal)` in `client.ts`, a `GET` to `/combo-counts` like `finishCombos`. A body that is not two objects of objects of positive integers is `ApiError('http')`; unknown keys are kept and ignored | A second client module: `client.ts` stays the only one that talks to the network (spec 011) |
| Query and freshness (owner's choice) | `useComboCounts()` in `queries.ts`, key `["combo-counts"]`, in the same `QueryClient`, with the same 5-minute stale time and one retry. When a finish's combos load (`useFinishCombos` succeeds), the counts entry for that finish is set to the list's length, or removed at 0, if counts are cached; nothing is written when they are not. So a card never disagrees with the page the visitor just saw (R7). The count on the card is otherwise the value of the counts request | Invalidating counts after every combos page: one more request per finish visited. A shorter stale time for counts: more requests, and the two can still disagree between requests. No sync: a combo published while the visitor browses shows "18" on the card after the page listed 19 |
| Zero count (owner's choice) | No strip and no text on a finish without combos. With most finishes empty, 30 "No combos yet" lines on one page would be noise; the filter covers hiding them | "No combos yet" on each card: repetitive. A greyed card: a redesign |
| Count text and strip | The removed strip, restored only on cards with combos: `bg-white/5 py-2 px-4`, the number in white semibold, then "combos" or "combo". `comboCount` moves from `Combos.tsx` to `comboText.ts` so both pages use one wording | A badge on the picture: a new look. The strip on every card with "0 combos": the noise above |
| Filter default and URL (owner's choice) | Off by default; `?has=combos` when on, set with `replace` so the back button does not step through toggles. Back from a combos page keeps it, since the URL holds it, and a shared link keeps it | On by default: the grid would show every finish while counts load, then collapse to a few (R10 forbids hiding before the counts are known), and a type with no combos would open on an empty page. Per visit (component state): lost on back from a combos page, which remounts the type page |
| Filter control | A checkbox labelled "Has combos" at the right of the subtitle line, in the site's text colours; it renders only once counts load, in a row whose height does not change, so the grid does not move | Disabled while loading: on failure it would stay disabled with no reason. A select or tabs: more than one choice to show |
| Order (owner's choice) | Catalog order; the filter only hides | Finishes with combos first: the grid reorders when counts arrive, and the catalog's order, also used by search and the combos API's ties, stops being the page's order |
| Empty filtered page | "No {type name} finishes have combos yet." and "Show all finishes" in the page's existing centred-message style | An empty grid: looks broken |
| Type card totals (owner's choice) | In scope: the `/gloves` and `/knives` pages read the same counts query, and `ItemCard` gets an optional `comboCount` that adds " · 34 combos" to its strip. Visiting a type page afterwards needs no second request | A follow-up: with about 4 finishes of 670 having combos, a visitor still opens types blind, and the data is already loaded. A filter on the type pages too: not asked for; a follow-up |
| Search dropdown | Unchanged; a follow-up. Its rows are finish names in a small dropdown, and the header search on every page would need the counts request on every page | Counts in the dropdown now: a request on the home page and every combos page for six rows |
| Tests | Vitest and Testing Library with the fake API, which gains `counts(body)` for `/combo-counts`. API tests in `api/tests/combos/test_counts.py` against the real test database | |
| CI | No new workflow or step except one more check in the `api` workflow's Compose smoke test: `GET /combo-counts` returns `{"gloves":{},"knives":{}}` with the public CORS header | |

## API / data model

**New route** (tag `combos`, operation ID `get_combo_counts`):

| Route | Response |
| --- | --- |
| `GET /combo-counts` | `200` `ComboCounts` |

```json
// ComboCounts
{
  "gloves": {"specialist": {"crimson-kimono": 18}, "hand-wraps": {"cobalt-skulls": 34}},
  "knives": {"karambit": {"doppler-ruby": 1}}
}
```

Pydantic: `ComboCounts(gloves: dict[str, dict[str, int]], knives: dict[str, dict[str, int]])`. Every count is at least 1. No query parameters, no request body. Headers as the other public routes: `Access-Control-Allow-Origin: *` and `Vary: Origin` for non-admin origins, no `Cache-Control`.

No table, column, index or migration changes.

**Website URL**: `/gloves/{type}?has=combos` and `/knives/{type}?has=combos`.

## Security

- S1. `GET /combo-counts` counts only published combos and returns no combo ids, statuses, admin names or timestamps.
- S2. The route reads no session and needs no authentication; it gets public CORS without `Access-Control-Allow-Credentials`, like the other public routes, and admin origins keep their behaviour (spec 011, S1 and S2).
- S3. The website sends the counts request only as a `GET` to the configured API origin, without credentials, from `src/api/client.ts`.
- S4. The `has` query parameter is compared with one fixed value and never rendered or sent anywhere.

## Acceptance criteria

API checks run in `api/` with pytest against the test database; website checks in `website/` with Vitest, Testing Library and the fake API.

**API**

1. `api/tests/combos/test_counts.py`: with no combos, `GET /combo-counts` returns 200 `{"gloves": {}, "knives": {}}`.
2. With published, draft and unpublished combos across several glove and knife finishes, the response has exactly the finishes with published combos, each with its published count, under the right kind and type; draft-only and unpublished-only finishes are absent.
3. For every finish that has any combo in that data, including a retired finish and a combo whose other item is retired, the count (or its absence, as 0) equals the length of `GET /gloves|knives/{type}/{finish}/combos`.
4. Publishing a draft raises its two finishes' counts by one; unpublishing a combo lowers them, and removes a finish whose count reaches 0.
5. The response has no `Cache-Control` header; `api/tests/test_cors.py` passes and covers `/combo-counts` (it reads routes tagged `combos` from `api/openapi.json`).
6. `uv run ruff format --check .`, `uv run ruff check .`, `uv run mypy`, `uv run pytest` (no skipped tests), `uv run python -m combo_api.openapi --check` and `uv run python -m combo_api.catalog export-website --check` exit 0; `api/openapi.json` contains `/combo-counts` and `ComboCounts`; `git diff main... -- api/migrations` prints nothing.
7. The `api` workflow's Compose smoke test checks that `curl -fsS http://localhost:8000/combo-counts` prints `{"gloves":{},"knives":{}}` and that the response headers for an `Origin: http://localhost:5173` request include `access-control-allow-origin: *`.

**Finish cards** (`website/src/pages/FinishCards.test.tsx`)

8. On `/gloves/specialist` with counts `{"specialist": {"crimson-kimono": 18, "mogul": 1}}`, the Crimson Kimono card reads "18 combos", the Mogul card "1 combo", and every other card has no text matching `/\d+\s*combos?\b/`. The same on `/knives/karambit` with knife counts. The page sends exactly one request, `GET <origin>/combo-counts` with `credentials: "omit"`.
9. While the counts request has no answer, and after it fails (no response, a 500, and a body that is not the shape), every finish card shows, with no count, the "Has combos" control is absent, every card's link works, and no error message shows.
10. Visiting `/gloves/specialist` (counts 18 for Crimson Kimono), then its combos page where the fake returns 19 combos, then going back shows "19 combos" on its card without a second counts request. A combos page returning `[]` for a finish counted 1 leaves that card without a count.
11. Opening a combos page directly, then going to its type page, sends the counts request once and shows the counts.

**Filter**

12. On `/gloves/specialist` with two finishes counted, the control is unchecked; checking it leaves exactly those two cards, in catalog order, and the URL is `/gloves/specialist?has=combos` with no new history entry; unchecking it shows every card and removes `has`.
13. Opening `/knives/karambit?has=combos` shows only the counted finishes once counts load, and every finish while they load or after they fail. `?has=yes` starts with the filter off.
14. With the filter on, going to a finish's combos page and back keeps the filter on.
15. With the filter on and no counted finish for the type, the page shows "No Specialist Gloves finishes have combos yet." (the type's catalog name) and "Show all finishes", which shows every card and removes `has`.

**Type cards**

16. On `/gloves` with counts summing to 19 for Specialist Gloves and none for Moto Gloves, the Specialist card reads "{n} available · 19 combos" and the Moto card "{n} available", n each type's number of finishes; while loading and after a failure every card reads "{n} available" only. The same on `/knives`.
17. Going from `/gloves` to `/gloves/specialist` within 5 minutes sends no second counts request.

**Unchanged, build and docs**

18. The existing `Combos.test.tsx` passes unchanged, apart from the import of `comboCount`; the home page and a combos page opened directly send no counts request before navigation.
19. `grep -rnwE "fetch|XMLHttpRequest|axios" src` matches only files in `src/api/` and test files.
20. On a fresh clone with no `website/.env`: `npm ci`, `npm run api:types:check`, `npm run lint`, `npm test`, `npm run build` and the `/src/` check exit 0, with no chunk-size warning. In `admin/`: `npm run api:types:check` exits 0, and `git diff main... -- admin/` touches only `admin/src/api/schema.d.ts`.
21. `api/README.md` lists `GET /combo-counts` in the public routes table; `website/README.md` mentions the counts on finish and type cards and the "Has combos" filter.
22. Manual, with the Compose API holding the owner's published combos and `npm run dev`: `/gloves/specialist` shows "18 combos" on Crimson Kimono, matching its combos page; "Has combos" leaves only finishes with combos and survives back navigation and a reload; `/gloves` shows the totals; with the API stopped, `/gloves/specialist` shows every finish without counts or control, and its links open the combos pages.
23. After the branch is pushed, the `website`, `api` and `admin` workflow runs for its latest commit succeed; `gitleaks dir . --no-banner --redact` on a clean clone reports no findings.

## Test plan

| Criterion | How it is checked |
| --- | --- |
| 1 to 4 | pytest: `api/tests/combos/test_counts.py` |
| 5 | pytest: `test_counts.py` (no `Cache-Control`), `api/tests/test_cors.py` |
| 6 | The commands in criterion 6 |
| 7 | Read `.github/workflows/api.yml`; the `api` workflow run |
| 8 to 11 | Vitest: `website/src/pages/FinishCards.test.tsx` |
| 12 to 15 | Vitest: `website/src/pages/FinishFilter.test.tsx` |
| 16, 17 | Vitest: `FinishCards.test.tsx` |
| 18, 19 | Vitest: `Combos.test.tsx` and a test of the home page; the grep in criterion 19 |
| 20 | Fresh clone into a temporary directory, then the commands |
| 21 | Read both READMEs |
| 22 | Manual, as written |
| 23 | Workflow run pages for the branch's latest commit (after the owner pushes); `gitleaks dir .` |

Section commands, in `website/`:

```bash
npm ci
npm run api:types:check
npm run lint
npm test
npm run build
```

In `api/`:

```bash
uv run ruff format --check .
uv run ruff check .
uv run mypy
uv run pytest
uv run python -m combo_api.openapi --check
uv run python -m combo_api.catalog export-website --check
```

In `admin/`: `npm ci && npm run api:types:check`.

## Open questions

None. On 2026-11-04 the owner chose every recommendation: `GET /combo-counts` with nested non-zero counts and no `Cache-Control`; the filter off by default and kept in the URL as `?has=combos`; catalog order, the filter only hiding; type card totals now, with search dropdown counts and a filter on the type pages as follow-ups; one query cache with the card updated from the finish's list; and no text on a finish without combos. All are recorded in Design.

## Implementation notes

Filled in during implementation: deviations from the design and why, follow-ups discovered, and which test covers each acceptance criterion.

## Audit

Filled in by the audit: one line per acceptance criterion (pass or fail, with evidence), the results of lint, tests, build and the secret scan, and a verdict of Pass, Pass with follow-ups, or Fail.
