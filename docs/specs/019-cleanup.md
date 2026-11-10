# 019: Cleanup and our own finish images

**Status:** Draft
<!-- Lifecycle: Draft → Approved → Implemented → Audited -->

**Section:** api, website, admin, repo
**Branch:** 019-cleanup

## Summary

Part A clears the follow-ups that specs 001 to 018 left open and that today's code still has: a few API races and lax inputs, an OpenAPI schema that describes fields the API no longer sends, CORS headers missing on unexpected errors, Compose containers that receive every API setting, combo counts in the header search and a "Has combos" filter on the type grids, the strip of page under Safari's toolbar on iOS 26, tests weaker than their criteria, and the npm audit advisories. Part B copies the catalog's finish and agent pictures from the game's image host into our own public bucket once, and points every picture at our copy, with the game's link kept as a fallback. Both are worth doing before the `deploy/` spec, which can then take the code as it is.

## Goals and non-goals

**Goals**

- Every still-open follow-up of specs 001 to 018 either fixed here or listed below as dropped, with the reason.
- The finish and agent pictures served from our own storage, with no change to what a visitor sees when our copy is missing.

**Non-goals**

- Everything the `deploy/` spec owns: response headers, the website's Content Security Policy (specs 015 and 016 named "the cleanup spec" for it; it moves to the `deploy/` spec with the other headers), the admin's `frame-ancestors` header, HSTS, `X-Robots-Tag`, production settings, Cloudflare Access, edge caching, the server, and creating the production image bucket and its domain.
- The viewer's mouse sway with `input=game`: a change in the viewer's own repository.
- Pattern groups, the credits page, analytics, two-factor login, combo variations, prices, the submissions inbox.
- Placing the 22 glove finishes that spec 005 added at the end of `display_order.json`: the owner's edit, at any time. The test that pins 22 changes with it.
- New dashboard features named in spec 010's follow-ups (a statistics endpoint, one catalog request per kind, counts per status).

## Context

### Part A: follow-ups still open

Every Open questions, Deviations, Decisions left open, Follow-ups and Audit findings item of specs 001 to 018 was checked against `main` at the merge of spec 018. The ones still open, by theme:

**API: races and inputs (specs 005, 006, 007, 009)**

- `api/src/combo_api/combos/admin_routes.py:112` (create) and `api/src/combo_api/combos/batches.py:117` (batch create) check that the pairing does not exist, then insert. Two requests that pass the check together hit the unique constraint (`combos/models.py:63`) and the second gets a 500, not 409 `combo_exists`. `IntegrityError` is caught nowhere in `combos/`. A collision of the random 12-character `public_id` (`combos/ids.py:10`) would also be a 500.
- Rows are locked in request order: publish and unpublish by `IN` without `ORDER BY` (`admin_routes.py:297`, `:331` for all drafts), batch updates one by one (`batches.py:97`). Two requests over the same combos in different orders can deadlock, and one gets a 500.
- `Rating` and `FloatBound` (`combos/schemas.py:61`, `:62`) are lax floats, so `"8.88"` as a string is accepted (201). `version` in update and batch bodies (`:118`, `:202`) and the remove query (`admin_routes.py:273`) has no upper bound.
- A batch with only `update` items on a retired glove finish is refused with 422 `finish_retired` (`batches.py:64` resolves the glove with `new=True`), although spec 009 R18 says existing combos on a retired finish can still be updated.
- `api/openapi.json:1946` `ValidationError` still lists `ctx` and `input`, which the 422 handler (`api/src/combo_api/main.py:148`) stopped sending in spec 007. The `Error` component is `{"detail": string}` with no enumeration of the codes, so the dashboard types its error handling as a string (specs 008, 009, 010).
- The catalog's `finishes` float range check (`catalog/models.py:43`, migration `0002_catalog`) has no `IS NOT NULL`, so a row with one bound passes. Spec 009 fixed the same gap on combos.
- `catalog/validate.py:109` reports `Duplicate type codename '…'` without naming either type. A type slug clash (`catalog/source.py:247`) names both types but gives no remedy, and type slugs have no override: `slug_overrides.json` is keyed `<def_index>:<paint_index>`, finishes only.

**API: errors, Compose and workers (specs 011, 015)**

- `AdminCors` and `PublicCors` (`main.py:205`) sit inside Starlette's outermost error middleware, so an unhandled exception is answered 500 with no `Access-Control-Allow-Origin` (and no `no-store`). The browser then reports a network error instead of a 500.
- `compose.yaml`: the `storage` service gets all of `api/.env` through `env_file`, though RustFS uses only the two storage credentials; the `db` service also gets all of it, though PostgreSQL uses only `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB`.
- `screenshots/queue.py:99` `claim` does not look at the worker's live claims, so a worker that claims repeatedly holds several until their leases expire as failed attempts; each can then upload a body of up to 16 MiB held in memory (`screenshots/upload.py:37`).

**Website (specs 001, 014, 018)**

- The header search (`website/src/components/Search.tsx:166`, `:200`) lists finish names only, with no combo counts.
- `/gloves` and `/knives` (`website/src/pages/SearchGloves.tsx`, `SearchKnives.tsx`) show type totals since spec 014, but no "Has combos" filter; only type pages have one (`website/src/components/FinishGrid.tsx:15`).
- `website/index.html:6` has no `viewport-fit=cover`, and no CSS uses `env(safe-area-inset-*)`. The 3D window is a `<dialog>` sized `h-[100dvh]` (`website/src/viewer/ViewerWindow.tsx:123`); on iOS 26 Safari's floating toolbar sits over the page below the dynamic viewport, so a strip of the dimmed page shows under it.
- `website/docs/screenshots/search-gloves.png` predates the type totals of spec 014, and `combos.png` predates screenshots and View in 3D on the cards (its alt text in `website/README.md:46` still describes two pictures side by side). Spec 001 meant to show a glove finishes page but could not while finish images did not load; they load now.

**Dashboard (specs 008, 010)**

- When `/admin/me` fails because the API cannot be reached, the app shows the login page (`admin/src/auth/session.tsx:36`) and says "Cannot reach the API" only after a login is tried.
- After a delete refused with 409 `version_conflict`, the edit page enables its buttons before the combo has been read again (`admin/src/pages/EditComboPage.tsx:183`), so a quick second Delete sends the old version and gets another 409.

**Tests and records (specs 006, 007, 017, 018)**

- `api/tests/catalog/test_snapshot.py:160` retires entries that `display_order.json` lists, so its `unlisted` assertion cannot fail; spec 006 criterion 4's test (`tests/catalog/test_source.py:241`) retires and restores a finish only, not a type; `test_snapshot.py:154` asserts every entry is `retired: false`, so it fails on the first real retirement.
- The `no-store` check on admin routes (`api/tests/combos/test_guard.py:16`) is a hand-written list that misses the screenshot admin routes (`screenshots/admin_routes.py:40`, `:61`, `:89`, `:104`) and never reaches a successful 204 delete.
- Spec 017 criteria 14 to 17 (`admin/src/pages/FinishPage.test.tsx:277` to `:377`, `admin/src/combos/order.test.ts:16`): the scroll test does not show that scrolling waits for the list; the inline rating test checks "other values unchanged" on a combo with no description, conditions or agent, checks only the rating on Enter, and never asserts "Order changed."; the conflict test matches the time with `.*`; 9.95 is not tested.
- Spec 017's audit found four behaviours not recorded: end-of-list refusals say "No rating fits above X." and "No rating fits below X."; Save stays disabled while a conflict is shown, until "Use theirs" or "Keep mine"; the list's rating label is for screen readers only; a missing or invalid step blocks Save only for ticked rows after the first that follow the fill.
- Spec 018 criterion 7: only the Close test (`website/src/viewer/ViewerWindow.test.tsx:216`) checks that the iframe is blanked while still in the page and that later events change nothing; Escape (`:250`), a forwarded Escape (`:286`) and Back (`:325`) check the end state only, and Back does not check focus.

**Tooling**

- `npm audit` reports advisories in development tooling only (`npm audit --omit=dev` finds none in either app):
  - `minimatch` 7.0.0 to 11.0.0, moderate, through `typescript-eslint`, in `website/` and `admin/`. The latest `typescript-eslint` still depends on an affected version. npm's suggested fix is a downgrade to an older major of `typescript-eslint`.
  - `deepmerge` up to 4.3.1, low, through `@svgr/rollup` in `website/`, with no fixed release. npm's suggested fix is again a downgrade.
- Neither `@svgr/rollup` nor `vite-plugin-svgr` is used: no config or source file imports them. They come from the website's first commit, with 20 other runtime dependencies that nothing imports either (the six Chakra UI and two Emotion packages, `class-variance-authority`, `clsx`, `date-fns`, `motion`, `pica`, `react-router` (the site imports `react-router-dom`), `react-router-hash-link`, `tailwind-merge`, `tailwindcss-rtl`, `tw-animate-css`, `web-vitals`, `yet-another-react-lightbox`), 22 in all. The admin's runtime dependencies are all imported.
- `api/README.md:281` says to run `npm run api:types` in `admin/` after regenerating the OpenAPI snapshot; the website has the same script since spec 011.

### Checked and already closed, or dropped

Closed by later work:

- 001: the offline asset host (spec 005 moved finish images to the game's host); combo images missing from builds (spec 003); the README's "always load" (rewritten since; `website/README.md:18` is accurate); the root README merge conflict (resolved at merge).
- 002: the uv pin and uvicorn's log level (spec 004); `.git` in `.dockerignore` and the startup test per variable (spec 002, after its audit); the image budget (spec 015 raised it to 300 MB; the image is 278 MB).
- 003: the dev tunnel hostname (spec 004).
- 005: the 575 kB bundle (spec 006 put the catalog in its own chunk); refresh failing on a retired finish and slug reservation (spec 006, retired entries); 404 declared on the list routes and the inactive type's finish (spec 006); the thinner catalog tests (spec 006).
- 011: the doubled `Vary: Origin` header (spec 011, after its audit: `main.py:116` adds `Origin` only when no `Vary` line has it; `api/tests/test_cors.py:74`, `:125`); the link to the other item's combos (dropped by the owner in spec 013).
- 012 and 014: every audit finding but the ones above was fixed on their branches.
- 016: the empty frame after `cs3d:loaded` and Escape inside the viewer (spec 018: the screenshot fades out over 200 ms, and the viewer forwards Escape).

Dropped, with the reason:

- 003: the build guard matching any `/src/` text: narrow it only if a dependency ever trips it; none has.
- 005: the combos page header image without `loading="lazy"`: it is above the fold, so eager loading is right.
- 006: a knife type whose painted finishes all leave while its Vanilla stays (unlikely; `refresh` fails loudly if it happens); the refresh report's 12-character commit (cosmetic).
- 007: `last_seen_at` written once a minute (by design, also for workers); old local `.env` files (one-off); the timing test's noise (rerun if it ever fails); `require_admin` and routes returning their own `Response` (none does; the guard test change below covers the 204 path).
- 008: a test admin made without a terminal for CI: passwords are read only from a terminal on purpose, and tests use `accounts.create` directly; the logout 204 shown as aborted in developer tools (harmless); repeating criterion 30 in a desktop browser; the lint guard rails being pattern checks (the CSP is the backstop).
- 009: the wording of criterion 20 (`finish_retired` per Design is right); the batch reporting every 422 problem at once (harmless); the unrecorded 422 codes (listed by the enumeration below); tests weaker than criteria 8, 16, 24, 25, 28 and 30 (the audit's probes confirmed the behaviour and the code has not changed since).
- 010: "Keep mine" with no unsaved changes, the draft count asked for on each Home visit, a form unsaved after being changed back, and the image host accepted as text by the bundle check: recorded behaviour, harmless.
- 015: a well-formed unknown token with a bad body getting 422 (nothing runs); the claim order's "waiting since" moved by rating edits and publishing (a slight reorder of a queue that drains in minutes); a removal racing an upload leaving objects for `sweep`, which exists for that.
- 017: checking the drop fix in a browser; the `rebuild` after the merge (an owner's step, done).
- 018: bringing R15 and criteria 8, 14 and 18 in line with the agreed deviations (audited specs are not rewritten; the deviations are recorded there); a headed desktop Chrome pass; Vertigo cropped on an upright phone (a known limit).

### Part B: finish images today

- `api/src/combo_api/catalog/snapshot.json` has 670 finishes and 63 agents, each with an `image_url` on the game's image host, a 512 by 384 PNG of about 75 KB: about 55 MB in all. These images were found identical to the game's own item images.
- `import` copies `image_url` into `finishes.image_url` and `agents.image_url`. The API returns it unchanged as `image_url` on `Finish` (`catalog/routes.py:38`), `Item` and `Agent` (`combos/schemas.py:280`, `:251`).
- `export-website` writes it as `image` into `website/src/data/catalog.json` and `agents.json`. The website shows it directly on finish cards (`FinishGrid.tsx:106`) and the combos page header (`website/src/pages/Combos.tsx:44`), and through `pictureUrl` (`website/src/api/images.ts:20`, the game's host only) for a combo's fallback pictures (`ComboImage.tsx:39`) and the agent list (`ViewerControls.tsx:287`). None has an `onError` fallback.
- The dashboard shows pictures through `pictureUrl` (`admin/src/api/images.ts:18`, the game's host only) in `admin/src/combos/Picture.tsx`. Its CSP already allows `img-src 'self'`, the game's host and `VITE_IMAGE_ORIGIN` (`admin/vite.config.ts:19`), and `admin/scripts/check-bundle.mjs` expects the same.
- Spec 015 gave us a public bucket (RustFS locally, R2 in production) read at `IMAGE_BASE_URL` (`api/src/combo_api/settings.py:45`), the `Storage` protocol (`screenshots/storage.py`), the immutable cache header, and `sweep`, which only looks at keys under `combos/`. The website and dashboard know the bucket's origin as `VITE_IMAGE_ORIGIN`, used only for screenshots.
- `refresh` downloads the dataset with `urllib.request` (`catalog/source.py:93`); `httpx` is a development dependency only.

## Requirements

### Part A

API: races and inputs

- R1. Creating a combo whose pairing already exists answers 409 `combo_exists`, also when two requests race past the existence check, for a single create and for a batch. A `public_id` collision is retried with a new id, never a 500.
- R2. Publish, unpublish and batch updates lock their combos in one fixed order, so two concurrent requests over the same combos never deadlock.
- R3. A rating or float bound sent as a JSON string is refused with 422; JSON integers stay accepted. `version` above 2,147,483,647 is refused with 422.
- R4. A batch with only `update` items on a retired glove finish is accepted, as a single update is; a batch with any `create` item on it is still refused with `finish_retired`.
- R5. `api/openapi.json` describes 422 bodies as they are sent (`loc`, `msg`, `type` only) and lists every error code as an enumeration of `detail`. Both apps' generated types are regenerated, and the dashboard's error mapping is typed from it.
- R6. The database refuses a catalog finish with exactly one float bound.
- R7. A duplicate type codename names both types. A type slug clash says how to resolve it, and `slug_overrides.json` can override a type's slug by its definition index.

API: errors, Compose and workers

- R8. An unhandled exception on any route is answered 500 with `{"detail": "internal_error"}` and the CORS headers the route would have sent (and `no-store` on admin and worker routes); the traceback is logged.
- R9. In Compose, the `storage` container receives only its two credentials and `db` only its three PostgreSQL settings; the API containers still get all of `api/.env`.
- R10. A worker holds at most one live claim: a new claim from a worker closes its earlier live claims without counting an attempt.

Website

- R11. The header search's results show the finish's published combo count ("3 combos", "1 combo", nothing for none). The counts are requested when the search is first opened, not on page load.
- R12. `/gloves` and `/knives` have the "Has combos" filter of the type pages, which hides types without published combos and is kept in the URL as `?has=combos`.
- R13. On iOS, with the 3D window open, nothing of the page shows under Safari's toolbar, and the window's controls stay clear of the toolbar, the home indicator and the notch, upright and sideways. The rest of the site keeps its content clear of the notch when sideways.
- R14. The website README's screenshots show today's site: home, search by gloves with type totals, a glove finishes page, and a combos page with screenshots; their alt texts match.

Dashboard

- R15. When the API cannot be reached on load, the login page says so at once, with Try again.
- R16. After a delete refused for a stale version, the edit page's buttons stay disabled until the combo has been read again.

Tests and records

- R17. The catalog snapshot tests can fail: one retires an unlisted finish and type, one retires and restores a whole type with the report, and the retired flag test checks the flag's type, not that every entry is false.
- R18. The admin `no-store` test covers every admin route, from the app's own route list, including the screenshot admin routes and a successful 204 delete.
- R19. Spec 017 criteria 14 to 17 and spec 018 criterion 7 are tested as written (Test plan), and the four behaviours spec 017 left unrecorded are recorded in Design below and locked by tests.

Tooling

- R20. `npm audit` in `website/` and `admin/` reports no advisory, or only ones with no fixed release recorded in Implementation notes, without downgrading any package.
- R21. The website lists only dependencies it imports.
- R22. `api/README.md` names both apps' `api:types` after regenerating the OpenAPI snapshot.

### Part B

- R23. A command copies the picture of every catalog finish and agent (retired ones included) from the game's image host into the public bucket, under a key derived from the picture's URL, skipping those already copied. Run again with nothing new, it downloads nothing.
- R24. The command copies only PNG images from `https` URLs on the game's image host, refuses redirects, oversized bodies and anything that does not decode as a PNG within the size limits, never overwrites an object, and reports what it copied, skipped and could not copy (exit 1 if any could not be copied). `--check` downloads nothing and exits 1 if any copy is missing.
- R25. The API's `image_url` on finishes, items and agents is our copy's URL (`IMAGE_BASE_URL` plus the key), and `fallback_image_url` is the game's URL.
- R26. The website shows every finish and agent picture from our copy, at `VITE_IMAGE_BASE_URL` plus the key from its catalog files, and the dashboard from the API's `image_url`.
- R27. If our copy fails to load, the picture loads once from the game's URL instead; if that fails too, the picture's place is left as it is today.
- R28. The bucket's base URL stays a setting in each app, so production points at its own image host with no code change. `sweep` never deletes the copies.

## Design

### Part A

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| Pairing race | Catch `IntegrityError` around the insert's flush; when its constraint is the pairing's unique constraint, roll back and answer 409 `combo_exists` (in a batch, at that item's path, as the existence check does); when it is `public_id`'s, retry the insert with new ids, at most 3 times | `SELECT … FOR UPDATE` before the insert: locks nothing, as the row does not exist yet. A serializable transaction: retries for every write to fix two rare cases |
| Lock order | Lock with `ORDER BY id` in publish, unpublish and all drafts; batch updates lock all their rows in one ordered query before changing any | A lock timeout and retry: still a 500 on the first deadlock |
| Strict numbers | `Rating` and `FloatBound` become strict floats (pydantic's strict float accepts JSON integers); `version` gets `le=2147483647`, the column's range | `Decimal` fields: a wider change to every shape and to the dashboard's types for the same check |
| Retired glove in a batch | Resolve the glove with `new` only when the batch has `create` items | Changing R18: a single update already works, and the dashboard may offer the batch later |
| ValidationError and error codes | An OpenAPI override in `api/src/combo_api/openapi.py` replaces FastAPI's `ValidationError` component with the fields the handler sends, and gives the `Error` component's `detail` an `enum` of every code the routes declare (collected from their response descriptions' helper, so a new code cannot be left out); a test compares the enum with the codes the code raises. The dashboard's error mapping takes the generated union type | Leaving FastAPI's component: the schema lists fields that never come. One enum per route: nicer, but many schemas for a list of a few dozen codes |
| Catalog float check | Migration `0007_finish_float_check` replaces the check with the combos' form (`IS NOT NULL` on both bounds); `downgrade` restores the old one | Validation only: the snapshot is validated already, the database is the backstop the combos have |
| Type slug override | `slug_overrides.json` gains keys `type:<def_index>`; `normalise` applies them before checking clashes; the clash message says to add one | Editing `snapshot.json` by hand: the next `refresh` keeps it only by accident of the previous snapshot |
| Unhandled errors | A small middleware added innermost (inside both CORS layers) catches any exception, logs it with the route, and answers 500 `{"detail": "internal_error"}`, so the CORS wrappers and `no-store` apply as for any response | An `Exception` handler: Starlette runs it in its outermost error middleware, outside CORS, which is the current problem. Replacing Starlette's error middleware: more code for the same result |
| Compose settings | Compose interpolation instead of `env_file` for `db` and `storage`: `compose.yaml` includes the services file with `env_file: api/.env` for interpolation (Compose's `include`), and the two services list their variables with `${NAME:?}`, so a missing value stops `up`; API containers keep `env_file`. Checked with `docker compose config` | `env -i` in the storage entrypoint: the process sees less, but the container's configuration still holds every value. A second env file per service: the same credentials in two files that can drift. A root `.env`: Compose would also pass it to every project command, and the repository's convention is `api/.env` |
| One claim per worker | `claim` first closes the worker's other live claims as released, not counted, in the same transaction; their late answers get 409 `claim_expired`, as for any closed claim. This also bounds upload bodies in memory to one per worker | Refusing a second claim with 409: a worker restarted mid-job would wait for its own lease to expire. A global upload limit: workers are few; one claim each is the real bound |
| Search counts | `Search.tsx` calls `useComboCounts` with `enabled` set once the search has been opened, so the counts request is made on first open and then shared with the type pages (same key, same 5-minute freshness). A result row shows the count after the name, in the strip's wording (`comboCount`), and nothing while counts load, fail or are zero | Counts on page load: the request on every page that spec 014 rejected. Showing "0 combos": noise in a six-row list |
| Type grid filter | `SearchGloves` and `SearchKnives` reuse the type pages' control and URL rule: a "Has combos" checkbox, shown once counts load, `?has=combos` with `replace`, hiding types whose total is 0; the empty message "No glove types have combos yet." with "Show all" | A different control or a per-visit state: the type pages' rule is already agreed |
| iOS safe areas | `viewport-fit=cover` in `index.html`. The window on phones is `position: fixed; inset: 0` with a height of `100lvh`, so it reaches under the toolbar; its header and controls are padded with `env(safe-area-inset-*)`. The site header and page gutters take `env(safe-area-inset-left/right)` as a minimum. `body` gets the page background, so any gap shows the site's colour | `100svh`: the gap under the toolbar would remain. Only the dark background on `body`: hides the strip's content but leaves controls under the home indicator |
| README screenshots | Taken at 1440 px wide from a local build against a local stack with sample combos and screenshots, re-encoded losslessly, each under 500 KB, as in spec 001; `glove-finishes.png` added | Keeping the old ones: they show a site that no longer looks like that |
| API unreachable on load | `session.tsx` keeps the reason when `/admin/me` fails without a response; the login page shows "Cannot reach the API." with Try again, which asks `/admin/me` again | A separate error page: the login form is still where the admin goes next |
| Edit page after a 409 | `busy` stays set until the refetch settles, then clears | A separate loading state: one more flag for the same buttons |
| Spec 017's unrecorded behaviours (recorded here) | As built, and now intended: refusals at the ends of the list say "No rating fits above X." and "No rating fits below X."; Save stays disabled while a conflict is shown until "Use theirs" or "Keep mine"; the rating field's label is visible to screen readers only (the column header names it); a missing or invalid step blocks Save only for ticked rows after the first that follow the fill. Each gets a test | Changing them to Design's first wording: the built texts read better at the ends and nobody asked for a change |
| `minimatch` advisory | An npm `overrides` entry in both apps for `minimatch` at the first fixed release for `@typescript-eslint/typescript-estree`; lint and tests must pass with it. If they do not, the override is dropped and the advisory recorded as waiting for `typescript-eslint` | `npm audit fix --force`: downgrades `typescript-eslint` to an older major. Ignoring it: an override is cheap and the advisory is real, if dev-only |
| `deepmerge` advisory and unused dependencies | Remove the 22 unused website dependencies, including both svgr packages, which removes `deepmerge`, and the type packages of those removed (`@types/pica`, `@types/react-router-hash-link`). `npm run build`, lint and tests prove nothing used them | Keeping them: install time, lockfile churn and advisories for code the site never runs |
| npm audit in CI | Not added, as spec 008 decided: it depends on a live service and fails on advisories unrelated to a change | |

### Part B

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| When the copy runs | A CLI command, `python -m combo_api.catalog copy-images [--check]`, in the API image, run by hand: once on a new stack (`docker compose run --rm api python -m combo_api.catalog copy-images`), and as the last step of the catalog refresh procedure in `api/README.md`, after `import`. The `deploy/` spec runs it after each deploy and `--check` in its smoke test | Part of `refresh`: `refresh` writes a committed file on a machine that may have no storage, and its output must not depend on storage. A Compose one-shot service: every fresh stack and every CI smoke run would download 55 MB from the game's host, and an outage there would fail `up`. Copying on demand from the API: outbound requests from the request path, and the static website cannot ask for them. A GitHub workflow: storage write credentials in CI |
| Key | `catalog/<first 32 hex characters of the SHA-256 of the game's URL>.png`, computed by one helper used by the command, the API and the export. The game's URLs change when an image changes, so a changed image gets a new key | A content hash: `refresh` or the export would have to download every image to know the key, and the export check in CI would need the network. Readable keys by slug: a changed image under the same key would be cached forever by the immutable header |
| What is copied | Every finish and agent in `snapshot.json`, retired ones included, since the dashboard still shows them on old combos. The command reads the snapshot, not the database, so it needs storage settings but no catalog import | Only active entries: a retired finish's picture would come from the game's host forever |
| Object | The image's bytes as downloaded, `Content-Type: image/png`, the immutable cache header of spec 015. Copies whose URL left the snapshot stay (about 75 KB each); `sweep` keeps looking only under `combos/` | Re-encoding to WebP: smaller, but no longer the game's image, and the pictures are small already. Deleting stale copies: a page built before a refresh may still show them |
| Download | `urllib.request` in worker threads, as `refresh` does, four at a time, 20 s timeout, no redirects followed, at most 2 MiB read, a generic client name; the body must decode with Pillow as a PNG of at most 2048 by 2048. A failed image is retried once, then reported; the rest go on | `httpx`: a new runtime dependency for one command. Unlimited parallel requests: unkind to the host and to rate limits |
| API shape | `image_url` becomes our copy (`IMAGE_BASE_URL` plus the key, built at response time like screenshot URLs), and every shape with it gains `fallback_image_url`, the game's URL. The database keeps the game's URL in `image_url`; no migration | A new field for our copy, leaving `image_url` as the game's: every client would have to change which field it reads, and the obvious field would be the fallback. Storing our URL in the database: a domain change would rewrite rows, against spec 015's rule |
| Website catalog files | `catalog.json` and `agents.json` gain `"image_key"`; `"image"` stays the game's URL, the fallback. The website builds `VITE_IMAGE_BASE_URL + "/" + image_key` | Full URLs of our copy in the committed files: the local or production host would be committed. Fetching the catalog from the API: the static export of spec 005 |
| Website setting | `VITE_IMAGE_BASE_URL` (the public bucket's base URL, as the API's `IMAGE_BASE_URL`, default the local bucket) replaces the website's `VITE_IMAGE_ORIGIN`; the origin for the screenshot check is taken from it. The dashboard keeps `VITE_IMAGE_ORIGIN`, as it gets full URLs from the API | Two website settings that must agree: one can be changed without the other. Keeping only the origin: the local bucket is path-style, so the website could not build the URL |
| Which picture is shown | Our copy first, always; `<img onError>` switches once to the fallback; if that fails, today's behaviour (the empty box, or the broken picture where there is no box). One small `CatalogImage` component in each app does it. `pictureUrl` in both apps accepts our image origin and the game's host only | Pointing only at copies known to exist: needs a "copied" flag in the database, and the static website cannot know it at build time. No fallback: a missing copy would leave an empty card |
| CSP | The dashboard's `img-src` already lists both origins; unchanged, and `check-bundle.mjs` with it. The website has no CSP yet; the `deploy/` spec's must list both origins in `img-src` | |
| Size | Part B alone is smaller than spec 015; with Part A it is one review of about spec 015's size (Open questions) | |

## API / data model

### Part A

- `Error` component: `{"detail": <one of the error codes>}`, `detail` an `enum` of every code. `ValidationError`: `{"loc": [string | integer], "msg": string, "type": string}`.
- New code `internal_error` (500), on every route.
- Migration `0007_finish_float_check`: the `float_range` check on `finishes` becomes `(float_min IS NULL AND float_max IS NULL) OR (float_min IS NOT NULL AND float_max IS NOT NULL AND float_min >= 0 AND float_min < float_max AND float_max <= 1)`.
- `slug_overrides.json`: keys `type:<def_index>` beside `<def_index>:<paint_index>`, value the slug.

### Part B

- `Finish`, `FinishDetail`, `Item` and `Agent` gain `fallback_image_url: string`; `image_url` is our copy. Example: `"image_url": "<IMAGE_BASE_URL>/catalog/3f2a…9c.png"`, `"fallback_image_url": "<the game's URL>"`.
- `catalog.json` finishes and `agents.json` agents: `{"…", "image": "<the game's URL>", "image_key": "catalog/3f2a…9c.png"}`.
- Object key: `catalog/<32 hex>.png` in the public bucket.
- Command: `python -m combo_api.catalog copy-images [--check]`; prints `Copied <n>, already there <n>, failed <n>`, then each failed entry by name and reason; `--check` prints `Missing <n>` and the names.
- Settings: `website/.env.example` lists `VITE_IMAGE_BASE_URL`, commented out, with the local default, in place of `VITE_IMAGE_ORIGIN`.

## Security

- S1. The copy command only fetches `https` URLs on the game's image host, follows no redirects, reads at most 2 MiB, and stores only bytes that decode as a PNG within the size limits; it never overwrites or deletes an object.
- S2. The copy command writes only to the public bucket, under `catalog/`; nothing in this spec reads from or writes to the originals bucket.
- S3. Both apps accept picture URLs only on their image origin and the game's host; any other URL shows no picture.
- S4. A 500 body is the fixed `internal_error` code; tracebacks and exception text go to the log only.
- S5. The `db` and `storage` containers receive only the settings they use; no container gets a value it does not need, and no value appears in `compose.yaml`.
- S6. Admin routes still require an authenticated admin and send `no-store` on every response, now tested from the app's route list.
- S7. No dependency is downgraded to clear an advisory, and no new runtime dependency is added.

## Acceptance criteria

### Part A

1. Two creates of the same pairing started together (both past the existence check, held at the insert by a test hook) give one 201 and one 409 `combo_exists`; the same for two batches creating the same knife; a forced `public_id` collision on the first insert gives 201 with another id.
2. Two concurrent publish requests over the same two combos in opposite orders both succeed; the locking queries have `ORDER BY` (test against the database).
3. `"rating": "8.88"` and a float bound `"0.1"` are refused with 422 on create, update and batch; `8` and `8.5` are accepted; `version` 2147483648 gives 422 on update, batch and remove.
4. A batch with only `update` items on a retired glove finish gives 200 and updates them; with one `create` item it gives 422 `finish_retired` at that item.
5. `api/openapi.json`'s `ValidationError` has exactly `loc`, `msg` and `type`; `Error.detail` has an `enum` equal to the set of codes the API can return (test collects them); `npm run api:types:check` passes in both apps; the dashboard's error code type is the generated union (`npm run typecheck`).
6. After `alembic upgrade head`, inserting a finish with only `float_min` fails on `float_range`; downgrade and upgrade run cleanly.
7. `refresh` with a new type reusing a codename names both types; a type slug clash message names `slug_overrides.json`; a `type:<def_index>` override sets that type's slug.
8. A route that raises an unexpected exception (test route) answers 500 `{"detail":"internal_error"}`; on a public route with `Access-Control-Allow-Origin: *`, on an admin route from an admin origin with that origin's CORS headers and `no-store`; the log has the traceback.
9. `docker compose config` shows under `storage` only `STORAGE_ACCESS_KEY_ID` and `STORAGE_SECRET_ACCESS_KEY` (or the RustFS names built from them) and under `db` only `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB`; `docker compose up -d --wait` on a separate Compose project reaches healthy with `migrate`, `catalog` and `storage-init` exiting 0; `up` without one of those values fails with its name.
10. A worker that claims twice holds one live claim; the first job's answer gets 409 `claim_expired`; its combo's attempts are unchanged.
11. Opening the header search sends one `/combo-counts` request (none before); a result with combos shows "3 combos" or "1 combo"; one without shows no count; with counts failing or loading, the results show names only.
12. On `/gloves` and `/knives`, "Has combos" appears once counts load, hides types with a total of 0, sets `?has=combos`, is kept after a type page and Back and after a reload; with none, the empty message and "Show all" show.
13. `index.html` has `viewport-fit=cover` (test); manual in the iOS Simulator (iOS 26, Safari), upright and sideways: with the 3D window open no page content shows under the toolbar, and the window's buttons are clear of the toolbar, home indicator and notch; sideways, the home page's header and cards are clear of the notch. Screenshots of each kept with the Implementation notes' description (not committed if over 500 KB).
14. The four README screenshots exist at 1440 px wide, each under 500 KB, showing home, `/gloves` with type totals, a glove finishes page with its pictures, and a combos page with screenshots; their alt texts describe them.
15. With `/admin/me` failing as a network error on load, the login page shows "Cannot reach the API." and Try again; Try again with the API back shows the shell.
16. After a delete refused with 409 on the edit page, Delete stays disabled until the combo's refetch has answered; then a Delete sends the new version.
17. The snapshot tests of R17 exist; each fails when the behaviour it covers is broken in a scratch copy (recorded per test in Implementation notes).
18. The `no-store` test lists every admin route from the app (`iter_route_contexts`), includes the screenshot admin routes, and reaches a 204 delete.
19. Spec 017: the scroll test fails if `scrollTo` runs before the list renders; the inline rating test checks unchanged values on a combo with a description, conditions and an agent, checks the whole body on Enter, and asserts "Order changed."; the conflict test checks the formatted time; `ratingBetween` is tested at 9.95; each of the four recorded behaviours has a test. Spec 018: the Escape, forwarded Escape and Back tests each check the blank-while-connected, later events and focus.
20. `npm audit` in `website/` and `admin/` reports no advisory, or only the `minimatch` one recorded as waiting (Design); no package in `package-lock.json` has a lower major than on `main`.
21. Every runtime and development dependency in `website/package.json` is imported, configured or run by a script (a listed check); `npm ci`, lint, tests and build pass.
22. `api/README.md` names `npm run api:types` in both `admin/` and `website/`.

### Part B

23. Unit tests with `MemoryStorage` and a fake download: a first run copies every finish and agent of a small snapshot under `catalog/<32 hex>.png` with `image/png` and the immutable header; a second run downloads nothing; a key derived from a changed URL is new.
24. The command refuses, and reports by name: an `http` URL, another host, a redirect, a 3 MiB body, a JPEG, bytes that are not an image, a PNG of 4096 by 4096; it never overwrites an existing object; `--check` downloads nothing and exits 1 with one copy missing, 0 with none.
25. `GET /gloves/specialist`, `GET /knives/karambit/doppler-ruby`, the combo item routes and `GET /admin/agents` return `image_url` on `IMAGE_BASE_URL` under `catalog/` and `fallback_image_url` on the game's host; `api/openapi.json` and both apps' generated types include `fallback_image_url`.
26. `export-website --check` passes with `image_key` in both files and needs no network; the website's finish cards, combos page header, combo fallback pictures and agent list request our copy (tests check `src`).
27. In both apps, an image error switches the picture once to the fallback URL, and a second error does not loop (tests); a URL on another host shows no picture.
28. Local check on a separate Compose project: `copy-images` copies 733 pictures and exits 0, a second run copies none, `--check` exits 0; a copy answers 200 anonymously with `image/png` and the immutable header; the website (`npm run dev`) and the dashboard (`npm run preview`, under its CSP) load finish pictures from the bucket with no CSP violation; with one copy deleted, its card shows the game's picture; `sweep --dry-run` lists no `catalog/` key.

### Both parts

29. In `api/`: format, lint, mypy, `pytest`, the OpenAPI and export checks, and `docker build` pass, the image under 300 MB. In `admin/` and `website/`: `npm ci`, `api:types:check`, lint, tests and build pass (the website's build runs its type check); `typecheck` and `check:bundle` in `admin/`. The `api`, `admin` and `website` workflows pass on the pull request.
30. `gitleaks dir .` and `gitleaks git` over the branch report no leaks; no host other than the game's image host, `localhost` and public documentation is added to the repository.

## Test plan

| Criterion | How it is checked |
| --- | --- |
| 1 | `api/tests/combos/`: concurrent creates and batches against the test database, with a hook that holds both requests after the existence check; a forced id collision |
| 2 | `api/tests/combos/`: two concurrent publishes in opposite orders; the compiled queries contain `ORDER BY` |
| 3 | `api/tests/combos/`: string numbers, integers, decimals and the version bound on each body and the remove query |
| 4 | `api/tests/combos/test_batches.py`: update-only and mixed batches on a retired glove finish |
| 5 | `api/tests/test_openapi.py`: components and the enum against the raised codes; `npm run api:types:check` in both apps, `npm run typecheck` in `admin/` |
| 6 | `api/tests/test_migrations.py`: one-bound insert refused; round trip |
| 7 | `api/tests/catalog/`: codename and slug clash messages, a type override |
| 8 | `api/tests/test_errors.py` (new): a test route raising, on public, admin and worker paths; `caplog` for the traceback |
| 9 | `docker compose config` read by a test or script, and the Compose run, on a separate Compose project, recorded in Implementation notes |
| 10 | `api/tests/screenshots/test_queue.py`: two claims by one worker |
| 11 | `website/src/components/Search.test.tsx` (new) with the fake API |
| 12 | `website/src/pages/FinishFilter.test.tsx`, gloves and knives, with the fake API |
| 13 | A test reading `index.html`; manual in the iOS Simulator, recorded in Implementation notes |
| 14 | Manual: file sizes and widths listed in Implementation notes; README read |
| 15 | `admin/src/App.test.tsx` with the fake API failing |
| 16 | `admin/src/pages/EditComboPage.test.tsx` with a held refetch |
| 17 | `api/tests/catalog/test_snapshot.py`, `test_source.py`; mutation runs recorded |
| 18 | `api/tests/combos/test_guard.py` |
| 19 | `admin/src/pages/FinishPage.test.tsx`, `admin/src/combos/order.test.ts`, `admin/src/pages/BatchPage.test.tsx`, `website/src/viewer/ViewerWindow.test.tsx`; each strengthened test broken once in a scratch copy and seen to fail |
| 20 | `npm audit` in both apps, output in Implementation notes; a lockfile comparison against `main` |
| 21 | A script or test listing `website/package.json` dependencies and where each is used; `npm ci`, `npm run lint`, `npm test`, `npm run build` |
| 22 | Read `api/README.md` |
| 23, 24 | `api/tests/catalog/test_copy_images.py` (new) with `MemoryStorage` and a fake opener |
| 25 | `api/tests/catalog/test_routes.py`, `api/tests/combos/test_public.py`, `test_agents.py`; OpenAPI check |
| 26 | `export-website --check`; `website/src/pages/*.test.tsx` and `src/viewer` tests checking `src` |
| 27 | `website/src/components/CatalogImage.test.tsx` (new), `admin/src/combos/pictures.test.tsx` |
| 28 | Manual local check, recorded in Implementation notes |
| 29 | `api/`: `uv run ruff format --check .`, `uv run ruff check .`, `uv run mypy`, `uv run pytest`, `uv run python -m combo_api.openapi --check`, `uv run python -m combo_api.catalog export-website --check`, `docker build`. `admin/`: `npm ci`, `npm run api:types:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run check:bundle`. `website/`: `npm ci`, `npm run api:types:check`, `npm run lint`, `npm test`, `npm run build`. CI on the pull request |
| 30 | `gitleaks dir . --no-banner --redact`; `gitleaks git --log-opts="origin/main..HEAD" --no-banner --redact`; a grep of added URLs |

## Open questions

1. **One review or two.** Recommended: split, 019 = Part A (follow-ups) and 020 = Part B (finish images). Part A is many small, unrelated changes best reviewed as a checklist; Part B is one feature with its own design, and the two together are about spec 015's size. Alternatives: one spec in two parts, as written (one review, one branch); or Part B first, if the `deploy/` spec should start sooner, since it needs Part B's command but little of Part A.
2. **When the copy runs.** Recommended: a CLI command run by hand on a new stack and after each catalog refresh, and by the `deploy/` spec after each deploy (Design). Alternatives: a Compose one-shot service after `storage-init` (automatic locally, but 55 MB from the game's host on every fresh stack and CI smoke run); inside `refresh` (needs storage where the snapshot is written); on demand from the API (outbound requests from the request path, and the static website cannot trigger them).
3. **Which picture, and a missing copy.** Recommended: our copy always first, switching once to the game's URL on a load error, then today's empty box (Design). Alternatives: point only at copies known to exist (a "copied" flag in the database, which the static website cannot read at build time); no fallback (a missing copy leaves an empty card).
4. **Agents' pictures too.** Recommended: yes, the 63 agents with the finishes: the same command and code, and the website's agent list and the dashboard's pickers would otherwise be the last pictures from the game's host. Alternative: finishes only, as first asked.
5. **Drops.** Recommended: drop the items listed under "Dropped, with the reason", in particular spec 009's weaker tests (probes confirmed the behaviour; the code is unchanged), spec 015's three worker edge cases, and a test admin without a terminal. Also recommended to keep two additions not on the first list: removing the website's 22 unused dependencies (R21, one of the advisories comes from one) and covering `db` as well as `storage` in R9.

## Implementation notes

Filled in during implementation: deviations from the design and why, follow-ups discovered, and which test covers each acceptance criterion.

## Audit

Filled in by the audit: one line per acceptance criterion (pass or fail, with evidence), the results of lint, tests, build and the secret scan, and a verdict of Pass, Pass with follow-ups, or Fail.
