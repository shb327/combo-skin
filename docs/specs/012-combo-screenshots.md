# 012: Combo screenshots and image storage

**Status:** Draft
<!-- Lifecycle: Draft → Approved → Implemented → Audited -->

**Section:** api, admin, website
**Branch:** 012-combo-screenshots

## Summary

Every combo gets a screenshot made by a screenshot worker: a separate program that asks the API which combos need one, renders each in the owner's 3D viewer and sends the image back. The API keeps the original in private object storage (Cloudflare R2 in production, an S3-compatible container locally), makes watermarked WebP versions from it, and serves those to the website and the dashboard. Each combo can name the game agent whose arms hold the knife and gloves in its screenshot, picked in the dashboard from a new agents catalog; empty means one default agent. The website's combo cards show the screenshot where spec 011 left a place for it.

## Goals and non-goals

**Goals**

- Agents in the catalog, from the same dataset and commit as knives and gloves.
- An optional screenshot agent per combo, a batch-wide agent with per-knife overrides, and one default agent setting. Admin-only.
- Object storage through the S3 API: two buckets, private originals and public images, with a local S3-compatible service in the Compose stack.
- Screenshot workers: tokens made and revoked in the dashboard, and a worker API to claim a combo, send its screenshot, or report a failure.
- A queue derived from the data: a combo needs a screenshot when it has none, when what it was drawn from changed, or when the owner asks.
- Watermarked WebP versions made from the kept original, and a command that remakes every version from the originals.
- The screenshot on the website's combo cards, and screenshot state, agent choice, workers and the default agent in the dashboard.

**Non-goals**

- The 3D viewer, its embed and the screenshot worker program (built in the viewer project).
- Uploading screenshots by hand.
- Deployment and turning on R2 (the `deploy/` spec); CDN and cache rules in front of the image host.
- Copying the catalog's finish pictures into our storage (proposed as a follow-up spec, Open questions Q9).
- View in 3D on the website, zooming screenshots, pattern groups, combo variations, prices, the submissions inbox, two-factor login.
- A Content Security Policy for the website (Open questions Q7).
- Spec 011's and 014's follow-ups (a cleanup spec).

## Context

Specs 001 to 011, 013 and 014 are Audited and merged.

**Catalog** (specs 005, 006)

- `api/src/combo_api/catalog/source.py`: `refresh` downloads `public/api/en/skins.json` from ByMykel/CSGO-API at a full commit SHA and normalises it; `snapshot.py` defines the snapshot (`source` with `repository`, `commit`, `file`, `license`; `item_types` with finishes; a `retired` flag on every entry, carried forward by `refresh`). The pinned commit is `cbe5eec1854bf882bf1d79d8d5fd2aac7d80e5bc`.
- `api/src/combo_api/catalog/importer.py` upserts the snapshot into `item_types` and `finishes` (`models.py`), never deleting rows; `validate.py` requires image URLs on the game's public image host. Compose runs the import as the one-shot `catalog` service (`compose.yaml`).
- The dataset's `public/api/en/agents.json` at the same commit (checked for this spec) lists 63 agents (29 Counter-Terrorist, 34 Terrorist), each with `def_index` (a string such as `"5404"`), `name`, `team` (`counter-terrorists` or `terrorists`), `rarity`, `image` (on the same image host as finishes), `model_player` and `original.name` (the codename, such as `customplayer_ctm_st6_varianti`). Definition indexes, names and slugs derived from names are unique. Lt. Commander Ricksaw | NSWC SEAL is definition index 5404, Counter-Terrorist. The dataset has no entry for the game's non-collectible default models.

**Combos** (specs 009, 010)

- `api/src/combo_api/combos/models.py`: `combos` with `public_id`, both finish ids, float ranges, seeds, rating, description, `status`, `version` (raised by every content change) and the admins who created and changed it. `schemas.py`: `ComboIn`, `ComboUpdate` (a full replacement of rating, description and both conditions, with `version`), `BatchIn` with `create` items (each with its own resolved conditions; batch-wide values are resolved by the dashboard) and `update` items (rating and description only), `Item`, `PublicCombo`, `AdminCombo`.
- `api/src/combo_api/combos/admin_routes.py`: create, list, get, update, remove (`DELETE`, drafts and unpublished only), publish, unpublish, batches, knife order. Removal deletes the row. `public_routes.py`: the two public combo lists and `GET /combo-counts`.
- `api/src/combo_api/admins/deps.py`: `require_admin` (session cookie; Origin and CSRF checks on writes; `Cache-Control: no-store`). `api/tests/admins/test_require_admin.py` fails when a write route other than login and logout, or any `/admin/` route other than login, logout and me, lacks `require_admin`.
- `api/src/combo_api/main.py`: `AdminCors` (credentialed CORS for `ADMIN_ORIGINS`) and `PublicCors` (`*` on `GET` routes tagged `catalog` or `combos`). `settings.py` reads every setting from the environment; `api/tests/test_settings.py` checks that `api/.env.example` lists exactly those.
- Migrations `0001` to `0004`. The API has no image library and no object storage client. The Docker image was 226 MB at spec 005, under that spec's 250 MB check.

**Admin** (specs 008, 010)

- `admin/src/pages/AddComboPage.tsx`, `BatchPage.tsx` with `src/combos/batch.ts` (batch-wide values and per-row overrides with Clear), `EditComboPage.tsx`, `src/combos/ComboList.tsx`, `src/combos/Picture.tsx`, `src/combos/FinishSearch.tsx` (the combobox pattern), `src/pages/HomePage.tsx` (statistics computed from every combo; a Knife order section).
- `admin/vite.config.ts` builds the CSP: `img-src 'self'` plus the game's image host (`src/api/images.ts`); `scripts/check-bundle.mjs` checks the same policy and refuses other hosts.

**Website** (specs 011, 014)

- `website/src/components/ComboPictures.tsx` fills each card's 16:9 box with the glove and knife finish pictures; its comment says spec 012 shows the screenshot there. `website/src/api/images.ts` accepts pictures only from the game's image host. Cards are one column below 1024 px and two columns above, about 530 px wide at 1440 px.
- `website/index.html` has no Content Security Policy and loads fonts from Google Fonts.

**Local S3-compatible services** (as checked on 2026-11-05)

| Project | Licence | State |
| --- | --- | --- |
| MinIO | AGPL-3.0 | Repository archived (read-only since April 2026); no community images or binaries are published |
| Garage | AGPL-3.0 | Maintained; single-node setup needs a layout and keys made with its own CLI |
| SeaweedFS | Apache-2.0 | Maintained since 2015; release 4.52 on 2026-11-02; single-container mode with the S3 gateway |
| RustFS | Apache-2.0 | 1.0 (general availability) in September 2026; release 1.0.4 on 2026-10-25; MinIO-compatible bucket policies |
| Versity Gateway | Apache-2.0 | Maintained; release v1.10.0 on 2026-10-22; an S3 front for a POSIX directory |

**Viewer and worker** (outside this repository): the viewer draws a combo in first person with WebGL from about 35 MB of assets on our storage and identifies items, finishes and agents by the game's definition indexes and paint indexes. A render takes about 3 to 12 seconds; a worker renders one combo at a time and can run on a Mac, a Windows PC or a server.

## Requirements

Requirements are grouped in three parts so the spec can be split for implementation (Open questions Q10): **A** agents, **B** storage, workers and images, **C** showing screenshots.

### Part A: agents

- R1. The catalog snapshot lists every agent of the source dataset at the snapshot's commit: definition index, codename, English name, team (`ct` or `t`), rarity, image URL and `retired`. `refresh` downloads the agents file from the same commit as the skins file, and the snapshot records both files.
- R2. Agents are validated like other catalog entries (unique definition index and codename, image on the game's image host), carried forward as retired when they leave the dataset, and imported into their own table by the same idempotent `import`, never deleted.
- R3. One default screenshot agent is stored as a setting, seeded with Lt. Commander Ricksaw | NSWC SEAL (definition index 5404). Changing it changes no combo row.
- R4. A combo has an optional screenshot agent. Empty means the default agent. Creating and editing a combo sets it; it is part of the combo's content, so changing it raises `version`. A retired agent cannot be chosen for a new choice; a combo that already has one keeps it.
- R5. A batch has a batch-wide screenshot agent, and each new knife row can override it, as with float ranges and seeds. Rows updating an existing combo keep that combo's agent.
- R6. The screenshot agent and the default agent appear only in admin responses and in the worker's job. No public response mentions agents.
- R7. The dashboard picks an agent from a searchable list with each agent's picture, name and team, and shows "Default" with the default agent's name and picture when the combo has none. The default agent is changed on a Screenshots page, after a confirmation that says how many combos will get a new screenshot.

### Part B: storage, workers and images

**Storage**

- R8. The API stores images through the S3 API in two buckets: originals (never public) and public images (readable by anyone at a configured base URL). Endpoint, region, credentials, bucket names and the public base URL come only from environment variables.
- R9. The local Compose stack runs an S3-compatible service, creates both buckets, and makes only the public bucket anonymously readable. Nothing needs R2 until deployment.

**Workers**

- R10. An admin creates a worker in the dashboard with a name and receives its token once. The API stores only a one-way digest of the token. An admin can revoke a worker; a revoked worker's token stops working at once. Workers are never deleted.
- R11. A worker authenticates with its token and can only use the worker routes: claim a job, send a screenshot for its claim, report a failure, release a claim, and read its own name. Admin routes refuse worker tokens and worker routes refuse admin sessions.

**Queue**

- R12. A combo, in any status, needs a screenshot when it has none, when its render inputs (both finishes, the float and seed each item is drawn with, the effective agent, and the render revision) differ from those of its current screenshot, or when an admin asked for a new one after the current one was made.
- R13. A claim gives one worker one combo that needs a screenshot, with everything the viewer needs to draw it, and a lease. Two claims never return the same combo while a lease is live. Published combos come before drafts and unpublished ones; within each, the combo waiting longest comes first.
- R14. A lease that expires without a screenshot or a report counts as a failed attempt and frees the combo.
- R15. A failure report counts as an attempt; a release does not. After a failed attempt the combo waits before it can be claimed again (1 minute, then 10 minutes). After 3 failed attempts for the same render inputs the combo is failed and is not offered again until its render inputs change or an admin asks for a new screenshot.
- R16. The current screenshot stays shown until a new one is stored.

**Upload and image versions**

- R17. A worker sends the screenshot for its live claim as a PNG of exactly the size the job asked for, at most 16 MiB. Anything else is refused with a code and stores nothing. A screenshot sent after the combo's render inputs changed, or after its lease expired, is refused and stores nothing.
- R18. The original is stored byte for byte in the originals bucket. From it the API makes WebP versions 640, 1280 and 1920 pixels wide with the watermark, without metadata, in the public bucket, under keys that change whenever the image changes, with long-lived immutable cache headers.
- R19. A new screenshot replaces the old one: the combo points to the new images in one transaction, then the old objects are deleted. Removing a combo deletes its objects. Objects whose deletion failed, and objects no row refers to, are removed by a sweep command.
- R20. A command remakes every combo's public versions from its original with the current watermark, under new keys, then deletes the old versions.
- R21. The watermark is the text `combo.skin` in the bottom-right corner, as in Design.

### Part C: showing screenshots

- R22. Public combos carry their screenshot's public versions (URL, width, height, type) and the original's size, or null. Admin combos carry the same plus the screenshot state.
- R23. The website's combo card shows the screenshot, in the 16:9 box, with a `srcset` of the three versions; with no screenshot, or when it fails to load, the two finish pictures as today. Screenshots load only from the configured image origin.
- R24. The dashboard shows each combo's screenshot state, one of `none` (no screenshot yet), `waiting` (an older screenshot is shown, a new one is due), `done` and `failed`, and whether a worker is rendering it now. Lists show the state; the edit page shows the screenshot itself, its state, and "Ask for a new screenshot". Home shows the number of combos in each state.
- R25. The Screenshots page lists workers (name, created, last seen, revoked), creates and revokes them, shows the default agent with its picker, and lists failed combos with links to them.

### Docs and checks

- R26. `api/.env.example`, `admin/.env.example` and `website/.env.example` list the new settings with local values only. `api/README.md`, `admin/README.md`, `website/README.md` and `THIRD_PARTY_NOTICES.md` are updated.
- R27. The OpenAPI snapshot includes the new routes and fields; both apps' generated types are regenerated.

## Design

Decisions marked **Q** are recommendations still waiting for the owner; see Open questions.

### Agents

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| Source | `public/api/en/agents.json` of ByMykel/CSGO-API at the snapshot's commit, downloaded by the same `refresh`; `source` gains `agents_file`, so `--commit` covers both files | A second command and commit for agents: two commits to keep in step for one snapshot |
| Identity | The game's definition index, as the viewer uses. The API names agents by definition index in requests and responses; no slugs, since agents have no pages | Slugs: no URL needs them, and the viewer would need a mapping back |
| Fields kept | `def_index`, `codename` (`original.name`), `name`, `team` (`ct` or `t`), `rarity`, `image_url`, `retired`. Not the description, collections or model path | The model path: the viewer resolves models from the definition index |
| Order | Counter-Terrorists first, then Terrorists, each by name. No hand-kept order file | A display order file like finishes: 63 rows in a picker with search do not need curating |
| Table | `agents`, with an identity `id`, unique `def_index` and `codename`, never deleted; retired rows `active: false` | Storing agents as JSON in the setting: no foreign key from combos |
| Combo field | `combos.screenshot_agent_id`, nullable, foreign key to `agents.id`; null means the default | Copying the default into every combo: changing the default would touch every row, which the owner ruled out |
| Default agent setting **(Q8)** | A one-row table `screenshot_settings` holding `default_agent_def_index`, seeded with 5404 by the migration (a definition index, not a foreign key, because the migration runs before the catalog import, as `knife_order` does), changed on the dashboard's Screenshots page by any admin, logged. Changing it changes the render inputs of every combo without its own agent, so those combos get new screenshots; the confirmation states the number | An environment variable: a deploy to change a choice the owner makes in the dashboard. A constant in code: the same, plus a review |
| Request shape | `ComboIn.screenshot_agent` (definition index or null, default null). `ComboUpdate.screenshot_agent` is required (null allowed), so a client that forgets it gets 422 instead of silently resetting it to the default. `BatchCreate.screenshot_agent` per row, resolved by the dashboard from the batch-wide value and overrides, as conditions are (spec 009). `BatchUpdate` unchanged: updated rows keep their agent, as they keep their conditions | A batch-wide field in the API: the rule would live in two places (spec 009, Batch defaults) |
| Dashboard display | A picker button showing the picture and name; for null, the default agent's picture and name with a "Default" tag. The list opens with "Default (<name>)" first, then the agents grouped CT and T, searchable by any word of the name, with the combobox pattern of `FinishSearch`. In a batch: a batch-wide picker and a per-row "own value" with Clear, like the batch's conditions; a row's own choice may be "Default" | A plain select: 64 options without pictures |

### Storage

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| Buckets | Two: originals (private) and public images. R2 makes a whole bucket public (custom domain), not a prefix, so originals can only be kept private in their own bucket | One bucket with a public prefix: needs a proxy or a Cloudflare Worker in front, and one misconfiguration exposes originals |
| Client | `boto3`, sync calls run in worker threads, with path-style addressing and the endpoint from settings, the client R2's own documentation uses | `aiobotocore`: async, but tight version pins against `botocore`. `obstore`: young, little R2 documentation |
| Storage seam | A small `Storage` protocol (`put`, `get`, `delete`, `list`) with the S3 implementation and an in-memory one for unit tests. One test module runs against the real local service | Mocking `boto3`: tests would check calls, not behaviour |
| Local service **(Q4)** | RustFS (Apache-2.0), pinned by digest, as a Compose service `storage` with a named volume, its S3 port published on the host's loopback only. A one-shot `storage-init` service (the API image, `python -m combo_api.screenshots init`) creates both buckets and puts a bucket policy allowing anonymous `GetObject` on the public bucket only, through the S3 API, so the setup is the same code on any S3 service. In production, `init --check` only checks both buckets exist and refuses to change policies | MinIO: archived, no images. Garage: AGPL and its own CLI for keys and layout. SeaweedFS: the most mature, but anonymous read needs its own identities file or shell; the fallback if RustFS fails criterion 18. Versity Gateway: a front for a directory, fine but less used. LocalStack: an AWS emulator with account requirements for its current images |
| Key layout | Originals: `combos/<combo id>/<upload id>.png`. Public: `combos/<combo id>/<version id>/<width>.webp`. Upload and version ids are 12 random characters from `0-9a-z`; a new version id for every upload and every rebuild | Content hashes in keys: equally cache-safe, but a rebuild with a new watermark would need the hash of every output first. Unversioned keys: caches would keep old images |
| Cache headers | Public objects: `Content-Type: image/webp`, `Cache-Control: public, max-age=31536000, immutable`. Originals: no cache header; never served | Short lifetimes: every visit re-downloads unchanged images; keys already change when images do |
| Public URLs | `IMAGE_BASE_URL` (the public bucket's base URL, with an optional path for path-style local URLs) plus the key, built by the API at response time, so moving the bucket behind another domain changes one setting | Storing full URLs: a domain change would rewrite every row |
| Drafts and unpublished combos | Their public versions are in the public bucket too, reachable only by a URL that holds two random ids, never listed. Unpublishing does not delete images; a URL someone kept keeps working until the screenshot is replaced | Making images only for published combos: the owner could not check a screenshot before publishing. Deleting on unpublish: a re-publish would need a new render |

### Workers

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| Authentication **(Q1)** | A token per worker: `csw_` followed by 43 base64url characters (256 bits from the operating system's secure random generator), sent as `Authorization: Bearer <token>`. Stored as a SHA-256 digest (the token is random, so a slow hash adds nothing), looked up by digest. Made in the dashboard with a name; the token is shown once and never again. Revoking sets `revoked_at`; the next request is refused. `last_seen_at` is written at most once a minute | Tokens made by the command line tool like admins: the owner asked for the dashboard, and a worker token grants far less than an admin. Mutual TLS: certificate handling on three machines. One shared token: revoking one machine revokes all. Admin login for the worker: full admin access on a render box |
| Limits **(Q1)** | `require_worker` is the only dependency the worker routes accept, and only `/worker/` routes use it. Worker routes refuse any request carrying an `Origin` header (403 `origin_not_allowed`), so no browser page can use them; they set no CORS headers and send `Cache-Control: no-store`. A worker sees only its jobs: combo id, items, render values and agent; no ratings, descriptions, statuses or admin names. Failed token checks are logged with the client IP; no rate limit, since a 256-bit token cannot be guessed | A rate limit per IP as for login: protects nothing a 256-bit secret does not, and could lock out a worker behind a shared address |
| Route guard | The guard test also checks: every `/worker/` route depends on `require_worker` and not on `require_admin`; no other route depends on `require_worker`; every write route depends on one of the two | Trusting review: the next route could forget it |

### Queue and claims

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| Render inputs | A JSON object: both items' definition and paint indexes with the float and seed they are drawn with, the effective agent's definition index (the combo's, or the default), and `RENDER_REVISION`, a constant raised in code when the viewer changes how combos look. Stored with each screenshot; "needs a screenshot" compares it with the inputs computed now, in SQL | A dirty flag set by every write: easy to miss a write path, and a default agent change would have to touch every row |
| Float and seed drawn **(Q2)** | Float: the combo's `float_from` when it has a range, else the finish's `float_min` (null for Vanilla). Seed: the combo's lowest seed when it has seeds, else null (the viewer's own default). The job also carries the full conditions | The middle of the range: a 0.06 to 0.8 glove would be drawn Well-Worn. A random seed: the image would change on every render |
| Which combos | Every status. Published first, then the rest; within each, the oldest wait first | Published only: no screenshot to check before publishing |
| Claim **(Q3)** | `POST /worker/jobs/claim` atomically picks one combo (row lock with `SKIP LOCKED`), records a claim with a random job id, the worker, the inputs and a lease of 5 minutes, and returns the job; 204 when nothing is due. One job per request; a worker claims again after finishing | Workers polling a list and choosing: two would pick the same combo. Longer leases: a dead worker would hold a combo for long. Lease renewal: a render takes seconds and assets download in under a minute, so 5 minutes is ample |
| Failures **(Q3)** | `POST /worker/jobs/{job}/fail` with a reason (`render_failed`, `asset_missing`, `timeout`) counts an attempt. `POST /worker/jobs/{job}/release` with a reason (`shutting_down`, `gpu_unavailable`) frees the combo without counting. An expired lease counts as `lease_expired`. Waits of 1 and 10 minutes after the first and second failure; the third makes the combo `failed` for those inputs. A failure detail text (at most 300 characters) is logged, not stored; the dashboard shows fixed text per reason | Unlimited retries: a combo that crashes the viewer would loop forever. Storing and showing the worker's text: spec 008 never renders text from outside the dashboard |
| Asking again | `POST /admin/screenshots/request` with combo ids sets `requested_at` and clears the failure count; the combo is due at once | A button that only clears failures: a done combo could not be redrawn after a viewer fix without raising `RENDER_REVISION` |

### Upload and processing

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| Upload path **(Q5)** | Through the API: `PUT /worker/jobs/{job}/screenshot` with the raw PNG body and `Content-Type: image/png`. The API checks the claim, the size limit while reading (413 `too_large`), the PNG signature and header size before decoding, then decodes it fully | A presigned URL straight to storage: one request fewer through the API, but the API must then download the image to check and process it, upload to a private staging area, and clean up abandoned uploads; the bytes cross the network twice either way |
| Limits | PNG only, 8-bit RGB or RGBA, exactly the job's size (1920 by 1080), at most 16 MiB (a 1920 by 1080 RGBA PNG is at most about 8.3 MB). Pillow's decompression-bomb guard stays on. RGBA is flattened onto black for the versions | WebP or JPEG originals: lossy masters cannot make better versions later. Free sizes: every check and version would need cases |
| Original | Kept byte for byte in the originals bucket with its SHA-256 recorded. Metadata in it is never public, since originals are never served | Re-encoding the original: "untouched" was the owner's requirement |
| Versions **(Q6)** | WebP, quality 82, 640, 1280 and 1920 pixels wide, made with Pillow from the decoded pixels, so no metadata or colour profile is copied. The card's `sizes` picks 640 to 1280 for cards about 530 px wide on high-density screens, 1920 for a full-width card on a large screen | AVIF too: about a third smaller but several times slower to encode and not needed for 3 sizes; can be added later from the originals. JPEG fallback: every browser the site supports reads WebP |
| When **(Q6)** | In the upload request, in a worker thread, one image at a time (`anyio.CapacityLimiter(1)`), about a second per image. The worker's response says whether the screenshot is stored | A background queue: a second moving part to report errors from, for a second of work per render |
| Order of writes | Original and versions are written; then one transaction points the combo at them and closes the claim; then the old objects are deleted. A failure before the commit leaves only unreferenced objects, which `sweep` removes; a failed delete is logged and left for `sweep` | Deleting first: a window with broken images on the website |
| Commands | `python -m combo_api.screenshots init [--check]`, `rebuild` (all versions from originals, current watermark, new version ids, old ones deleted after each combo's commit), `sweep` (deletes objects older than one day that no row refers to, in both buckets; prints counts; `--dry-run`) | HTTP routes for these: maintenance belongs to the owner's terminal, as admin accounts do |

### Watermark

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| Mark **(Q6)** | The text `combo.skin` in Montserrat SemiBold (the site's typeface; the OFL TrueType file committed in the package and credited in `THIRD_PARTY_NOTICES.md`), white at 70% opacity (alpha 180 of 255) over a soft shadow (black at alpha 110, blurred by a tenth of the font size, offset by a twentieth) so it reads on bright and dark renders | A logo image: needs an SVG renderer or a fixed bitmap per size; possible later, since every version is remade from the originals. A tiled or centred mark: covers the items the screenshot is about |
| Size and place | Font size `max(16, round(0.022 × width))` px (42 px at 1920 wide, 28 at 1280, 16 at 640), bottom-right, `round(0.02 × width)` px from the right and bottom edges | A fixed pixel size: tiny on large versions or large on small ones |
| Changing it | `WATERMARK_REVISION` in code; `rebuild` remakes every version | Versions made on request: a cache miss would render on the API |

A sample of this watermark was rendered for the owner on two stand-in scenes (dark and bright, built from catalog pictures; real renders come from the viewer). It is not committed.

### Showing screenshots

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| Public field **(Q7)** | `PublicCombo.screenshot`: `{width, height, images: [{url, width, height, type}]}` or null, images narrowest first. `AdminCombo` gains the same `screenshot`, `screenshot_agent` and `screenshot_state` | One URL plus a size template: the client would build URLs, and a change of sizes would break it |
| Website image | `<img>` with `srcset` of the three versions, `sizes="(min-width: 1024px) 50vw, 100vw"`, `width` and `height` set to avoid layout shift, `loading="lazy"`, `decoding="async"`, `referrerPolicy="no-referrer"`, `alt` "<gloves> with <knife>". `screenshotUrl()` accepts only URLs on `VITE_IMAGE_ORIGIN`; any other URL, or a load error, shows the finish pictures | Showing nothing on error: the card would lose its picture |
| Image origin setting | `VITE_IMAGE_ORIGIN` in both apps, an exact origin with the rules of `VITE_API_BASE_URL`, default the local storage service's origin | Reading it from the API at run time: the admin's CSP is fixed at build time |
| Admin CSP **(Q7)** | `img-src 'self' <game image host> <VITE_IMAGE_ORIGIN>`; nothing else changes; `check-bundle.mjs` expects it | Allowing any `https:` image: one bad URL could load from anywhere |
| Website CSP **(Q7)** | No CSP in this spec; the site has none today and loads Google Fonts. The cleanup spec adds one, with `img-src` naming the same two origins | Adding one here: fonts, styles and the hero need their own review, unrelated to screenshots |
| Dashboard states | Badges with text, never colour alone: None, Waiting, Done, Failed, and "Rendering" beside None or Waiting while a lease is live. The edit page shows the 1280 version, the state, the failure reason as fixed text, and "Ask for a new screenshot" (no confirmation; it changes nothing public until the new image arrives). Lists show the badge; Home shows a count per state from the combos it already loads | A separate queue page: the owner works per combo and per finish |
| Screenshots page | `/screenshots`, linked from a Home section like Knife order. Default agent with its picker; workers table with Create (name, then the token in a read-only field with Copy and the note "Shown once"), Revoke (confirmation naming the worker); failed combos with links and "Ask again for all failed". The token is kept in component state only, never in the drafts store, and cleared when the page is left | Tokens in the drafts store: they would survive a session end in memory |

### Size of the work

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| One spec, three parts **(Q10)** | One spec so every decision is reviewed together, with requirements and criteria grouped A, B and C. Recommended: at approval, split it into 012 (Part A: agents, combo and batch fields, picker, default agent; about a third of the work and independently useful) and a new spec for Parts B and C (storage, workers, processing, watermark, website, dashboard state), moving the text as it is | One implementation and one audit for all of it: larger than spec 010, the largest so far. Three implementation specs: Part C is small and needs Part B's data to test |

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

### Tables (migration `0005_screenshots`)

`agents`: `id` integer identity; `def_index` integer unique; `codename` text unique; `name` text; `team` text (`ct` or `t`, check); `rarity_code`, `rarity_name`, `rarity_color` text; `image_url` text; `active` boolean; `created_at`, `updated_at`.

`combos` gains `screenshot_agent_id` integer, nullable, foreign key to `agents.id`, `ON DELETE RESTRICT`.

`screenshot_settings`: `id` integer primary key, check `id = 1`; `default_agent_def_index` integer; `updated_at` timestamptz; `updated_by` integer nullable, foreign key to `admins.id`. Seeded with one row, 5404.

`workers`: `id` integer identity; `name` text unique (1 to 64 characters, check); `token_digest` bytea unique; `created_at`; `created_by` (foreign key to `admins.id`); `revoked_at` nullable; `revoked_by` nullable; `last_seen_at` nullable.

`combo_screenshots` (the current screenshot, at most one per combo): `combo_id` bigint primary key, foreign key to `combos.id`, `ON DELETE CASCADE`; `original_key` text; `original_sha256` bytea; `width`, `height` integer; `version_id` text (12 characters, check); `widths` integer array; `watermark_revision` integer; `inputs` jsonb; `worker_id` (foreign key to `workers.id`); `created_at`.

`screenshot_jobs` (claims and failures, at most one per combo): `combo_id` bigint primary key, foreign key to `combos.id`, `ON DELETE CASCADE`; `requested_at` timestamptz nullable; `job_id` text unique nullable; `worker_id` nullable; `claimed_inputs` jsonb nullable; `lease_expires_at` nullable; `attempts` integer, default 0; `attempt_inputs` jsonb nullable (the inputs the attempts count for); `last_reason` text nullable; `next_attempt_at` nullable.

### Settings (environment, listed in `api/.env.example` with local values)

| Variable | Meaning |
| --- | --- |
| `STORAGE_ENDPOINT_URL` | The S3 endpoint. Compose sets the container address for containers, as it does for the database |
| `STORAGE_REGION` | Default `auto`, as R2 expects |
| `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` | Credentials; the secret is a `SecretStr`, never logged |
| `STORAGE_ORIGINALS_BUCKET`, `STORAGE_PUBLIC_BUCKET` | Bucket names; must differ |
| `IMAGE_BASE_URL` | Public URL prefix of the public bucket; `https` except on `localhost` |

`admin/.env.example` and `website/.env.example`: `VITE_IMAGE_ORIGIN`, commented out, with the local default.

### Shapes

```json
// Agent (admin and worker responses)
{"def_index": 5404, "name": "Lt. Commander Ricksaw | NSWC SEAL", "team": "ct",
 "image_url": "<Steam economy image URL>", "rarity": {"code": "...", "name": "Master", "color": "#eb4b4b"}, "active": true}

// Screenshot (public and admin)
{"width": 1920, "height": 1080, "images": [
  {"url": "<IMAGE_BASE_URL>/combos/k3v9x0m2q7ab/p2m8x0d4r6ta/640.webp", "width": 640, "height": 360, "type": "image/webp"},
  {"url": "...", "width": 1280, "height": 720, "type": "image/webp"},
  {"url": "...", "width": 1920, "height": 1080, "type": "image/webp"}]}

// ScreenshotState (admin)
{"state": "waiting", "rendering": true, "reason": null, "attempts": 0, "made_at": "2026-11-05T12:00:00Z"}

// Job (worker)
{
  "job_id": "w8d2k0q5n1zc", "lease_expires_at": "...",
  "combo_id": "k3v9x0m2q7ab",
  "image": {"width": 1920, "height": 1080, "type": "image/png"},
  "glove": {"def_index": 5034, "codename": "...", "paint_index": 10064, "paint_codename": "...",
            "name": "Specialist Gloves | Mogul", "float": 0.06, "seed": null,
            "float_from": null, "float_to": null, "seeds": []},
  "knife": {"def_index": 507, "codename": "weapon_knife_karambit", "paint_index": 419, "paint_codename": "am_doppler_phase2",
            "name": "Karambit | Doppler (Phase 2)", "float": 0.0, "seed": 387,
            "float_from": 0.0, "float_to": 0.01, "seeds": [387, 512]},
  "agent": {"def_index": 5404, "codename": "customplayer_ctm_st6_varianti", "name": "...", "team": "ct", "default": true},
  "render_revision": 1
}
```

`PublicCombo` gains `screenshot` (Screenshot or null). `AdminCombo` gains `screenshot`, `screenshot_agent` (Agent or null) and `screenshot_state`. `ComboIn` gains `screenshot_agent` (integer or null, default null); `ComboUpdate` gains `screenshot_agent` (required, integer or null); `BatchCreate` gains `screenshot_agent` (integer or null, default null).

### Routes

Admin (tag `admin`, `require_admin`, `ADMIN_RESPONSES`, `no-store`):

| Route | Operation ID | Request → response |
| --- | --- | --- |
| `GET /admin/agents` | `list_agents` | → `200 [Agent]`, active agents in display order |
| `GET /admin/screenshot-settings` | `get_screenshot_settings` | → `200 {"default_agent": Agent}` |
| `PUT /admin/screenshot-settings` | `replace_screenshot_settings` | `{"default_agent": 5404}` → `200`, as `GET`, plus `"requeued": n` |
| `POST /admin/screenshots/request` | `request_screenshots` | `{"ids": [...]}` (1 to 500) → `200 {"changed": n}` |
| `GET /admin/workers` | `list_workers` | → `200 [{"id", "name", "created_at", "created_by", "last_seen_at", "revoked_at"}]` |
| `POST /admin/workers` | `create_worker` | `{"name"}` → `201 {"worker": Worker, "token": "csw_..."}`; `409 worker_exists` |
| `POST /admin/workers/{id}/revoke` | `revoke_worker` | → `200 Worker`; `404 worker_not_found` |

Worker (tag `worker`, `require_worker`, `no-store`, no CORS):

| Route | Operation ID | Request → response |
| --- | --- | --- |
| `GET /worker/me` | `worker_me` | → `200 {"name"}` |
| `POST /worker/jobs/claim` | `claim_job` | → `200 Job`, or `204` |
| `PUT /worker/jobs/{job_id}/screenshot` | `put_screenshot` | raw PNG → `201 {"combo_id", "screenshot": Screenshot}` |
| `POST /worker/jobs/{job_id}/fail` | `fail_job` | `{"reason", "detail"}` → `204` |
| `POST /worker/jobs/{job_id}/release` | `release_job` | `{"reason"}` → `204` |

### Errors

| Status | Code | When |
| --- | --- | --- |
| 401 | `not_authenticated` | Worker route without a valid, unrevoked token |
| 403 | `origin_not_allowed` | Worker route with an `Origin` header |
| 404 | `job_not_found` | Unknown job id, or a job of another worker |
| 409 | `claim_expired` | Upload, fail or release after the lease expired or the claim was closed |
| 409 | `inputs_changed` | Upload after the combo's render inputs changed; nothing stored, the combo is due again |
| 409 | `worker_exists` | A worker name already used |
| 413 | `too_large` | Body over 16 MiB |
| 415 | `unsupported_media_type` | Upload not `image/png` |
| 422 | `not_png`, `wrong_size`, `bad_pixel_format` | Upload that is not a decodable PNG, not the job's size, or not 8-bit RGB or RGBA |
| 422 | `agent_not_found`, `agent_retired` | Unknown agent, or a retired one for a new choice |

### Log events

Logger `combo_api.screenshots`: `worker created`, `worker revoked` (admin, worker name); `job claimed`, `screenshot stored` (worker, combo id, job id, bytes), `job failed` (worker, combo id, reason, detail as `repr`), `job released`, `lease expired`, `screenshot token refused` (ip); `default agent changed` (admin, def index, requeued); `screenshots requested` (admin, ids); `objects deleted`, `object delete failed` (key). Tokens and storage credentials are never logged.

## Security

- S1. Worker routes require a valid, unrevoked worker token through `require_worker`; no other route accepts one. Admin routes still require an admin session. The extended guard test enforces both for every route added later.
- S2. Worker tokens have 256 bits from the operating system's secure random generator. The database holds only their SHA-256 digest. A token is returned once, in the create response, and never logged or returned again.
- S3. Worker routes refuse requests with an `Origin` header, set no CORS headers and are not cacheable.
- S4. Jobs contain no rating, description, status, timestamps or admin names.
- S5. Uploads are bounded (16 MiB, exact size, PNG only, decompression-bomb guard) and processed one at a time.
- S6. Originals are only in the originals bucket, which is never public; no response contains an original's key or URL. Public versions are new encodes with no metadata.
- S7. Storage credentials come only from the environment, as a secret setting. `api/.env.example` holds only local placeholder values; no account id, real bucket name or private host appears in the repository.
- S8. No public response contains an agent, a worker or a screenshot state.
- S9. The website and the dashboard show screenshots only from `VITE_IMAGE_ORIGIN` and catalog pictures only from the game's image host; the admin CSP allows images from those two origins and `'self'` only.
- S10. Creating and revoking workers, changing the default agent and asking for screenshots need an admin with an allowed Origin and the CSRF token (spec 007). Revoking asks for confirmation.
- S11. Workflows keep read-only permissions, SHA-pinned actions and no secrets; the storage service in CI uses throwaway local credentials.

## Acceptance criteria

API checks run in `api/` with pytest against the test database; admin checks in `admin/` and website checks in `website/` with Vitest and the fake API. "Storage tests" use the in-memory storage unless they say the real service.

**Part A: agents**

1. `snapshot.json` has `source.agents_file` and 63 agents (29 `ct`, 34 `t`), all `retired: false`; Lt. Commander Ricksaw | NSWC SEAL is `def_index` 5404, codename `customplayer_ctm_st6_varianti`, team `ct`. `refresh --commit <the recorded commit>` reproduces the file byte for byte.
2. Validation tests: a duplicate agent definition index or codename, a team other than `ct` or `t`, and an agent image on another host each fail naming the agent. Normaliser tests: an agent missing from the dataset is kept with `retired: true`; one that comes back is no longer retired.
3. Migration `0005` upgrades, downgrades and upgrades again; `alembic check` reports nothing; the migration tests know the new tables; `screenshot_settings` holds one row with 5404 after migrating.
4. Importing the snapshot into an empty catalog inserts 63 agents; a second import changes nothing; a retired agent becomes inactive with the same `id`. In Compose, `catalog` reports the agents with the other rows.
5. `GET /admin/agents` returns the active agents, Counter-Terrorists first, each by name, with the Agent fields; without a session it returns 401.
6. Creating a combo without `screenshot_agent` stores null and returns `screenshot_agent: null`; with 5404 it returns the Agent. Updating with another agent raises `version`; an update body without `screenshot_agent` gets 422; an unknown definition index gets 422 `agent_not_found`; a retired agent gets 422 `agent_retired` for a new choice, while updating a combo that already has that retired agent with the same agent succeeds.
7. A batch whose `create` items carry different `screenshot_agent` values stores each; `update` items leave the combo's agent unchanged.
8. `PUT /admin/screenshot-settings` with an active agent changes the default, returns `requeued` equal to the number of combos without their own agent that had a done screenshot, changes no row of `combos`, and is logged; a retired or unknown agent gets 422. The raw bodies of both public combo routes and `GET /combo-counts` contain no `agent`.
9. Admin tests: the add and edit pages show the picker with "Default" and the default agent's name and picture when the combo has none; choosing an agent by keyboard alone (type, Down, Enter) sends its definition index; "Use default" sends null. In a batch, a batch-wide agent reaches every new row, a row's own agent replaces it for that row only, a row's own "Default" sends null while the batch-wide agent is set, and Clear returns the row to the batch-wide value; updated rows send no agent.
10. Admin test: changing the default agent on the Screenshots page opens a confirmation stating how many combos will get a new screenshot; Cancel sends nothing; Confirm sends `PUT /admin/screenshot-settings`.

**Part B: storage, workers and images**

11. Worker tests: `POST /admin/workers` returns the token once, matching `^csw_[A-Za-z0-9_-]{43}$`; `GET /admin/workers` and the database never contain it (only its 32-byte digest); a second worker with the same name gets 409 `worker_exists`.
12. With that token, `GET /worker/me` returns the worker's name; after `POST /admin/workers/{id}/revoke` the same token gets 401 `not_authenticated` on every worker route. A missing, malformed or unknown token gets 401 and a `screenshot token refused` log line without the token.
13. A worker token gets 401 on `GET /admin/combos` and every other admin route; an admin session cookie gets 401 on every worker route; a worker request with an `Origin` header gets 403 `origin_not_allowed`; worker responses have `Cache-Control: no-store` and no `Access-Control-Allow-Origin`.
14. The extended guard test fails for a copy of the app with a `/worker/` route lacking `require_worker`, with a non-worker route depending on `require_worker`, and with a write route depending on neither.
15. Queue tests: a new combo is due; after its screenshot is stored it is not; changing its float range, seeds or agent makes it due again (its state becomes `waiting`, with the old screenshot still in its responses); changing only its rating or description does not; changing the default agent makes due exactly the combos without their own agent; raising `RENDER_REVISION` makes every combo due; `POST /admin/screenshots/request` makes a done combo due.
16. Claim tests: a claim returns the Job of API / data model, with the float and seed of Design (range start and lowest seed; finish minimum and null without them; null float for Vanilla) and the effective agent with `default`; it returns a published combo before an older draft; with nothing due it returns 204; twenty concurrent claims over ten due combos return ten different combos and ten 204s.
17. Lease and failure tests, with the test clock: a claim not answered within 5 minutes counts as an attempt (`lease_expired`) and the combo is due again after 1 minute; `fail` counts an attempt and the next is due after 1 minute, then 10 minutes; the third failure makes the state `failed` and the combo is no longer claimed; changing its float range or asking for a new screenshot makes it due again with attempts at 0; `release` frees it at once without counting; `fail` or `release` on an expired claim gets 409 `claim_expired`, and on another worker's job 404.
18. With the Compose stack up (`docker compose up -d --wait`), `storage-init` exits 0, both buckets exist, an anonymous `GET` of an object in the public bucket returns 200, and an anonymous `GET` of an object in the originals bucket returns 403. Running `init` again changes nothing; `init --check` against a stack with a missing bucket exits 1.
19. Upload tests: a 1920 by 1080 PNG for a live claim returns 201; the originals bucket holds the exact bytes with the recorded SHA-256; the public bucket holds 640, 1280 and 1920 wide WebP versions with `Content-Type: image/webp` and `Cache-Control: public, max-age=31536000, immutable`, each decoding to the stated size with no EXIF or XMP metadata; the combo's state becomes `done`.
20. Upload refusals, each storing nothing and leaving the claim live unless stated: a body over 16 MiB (413, also with a false `Content-Length`), `image/jpeg` (415), a JPEG body labelled PNG and a truncated PNG (422 `not_png`), 1280 by 720 (422 `wrong_size`), a 16-bit PNG (422 `bad_pixel_format`), a PNG whose header claims 50,000 by 50,000 (refused before decoding); after the lease expired (409 `claim_expired`); after the combo's knife range changed (409 `inputs_changed`, claim closed, combo due).
21. Replacement test: storing a second screenshot points the combo at new keys with a new version id, then the first screenshot's original and versions are gone from both buckets; when the delete fails (storage fake raising), the combo still points at the new images and `sweep` later removes the old objects.
22. Removing a combo deletes its original and versions. `sweep --dry-run` lists unreferenced objects older than a day and deletes nothing; `sweep` deletes them and leaves every referenced object and every object younger than a day.
23. `rebuild` with a raised `WATERMARK_REVISION` gives every screenshot a new version id and versions made from its original, deletes the old versions, and leaves originals untouched.
24. Watermark test, on the watermark function's output before WebP encoding: on a uniform grey 1920 by 1080 image, the changed pixels lie within the bottom-right 300 by 60 px and none within 20 px of the right or bottom edge; at 640 by 360, within the bottom-right 110 by 24 px. (The rendered sample's marks measure 266 by 52 px at 1920 and 101 by 20 px at 640, shadow included.) The owner approved the sample before implementation (Q6).
25. One storage test module runs the S3 implementation against the real local service (put, get, delete, list, cache headers) and is run by the `api` workflow with that service as a container; no test is skipped.

**Part C: showing screenshots**

26. Public route tests: a published combo with a screenshot has `screenshot` with three images, narrowest first, each URL starting with `IMAGE_BASE_URL`; one without has `screenshot: null`; the raw body contains no original key, `originals`, state or agent. A combo whose inputs changed keeps its old `screenshot` until the new one is stored.
27. Website tests: a card whose combo has a screenshot shows one `img` with `srcset` of the three URLs and widths, the `sizes` of Design, `width` 1920, `height` 1080, `loading="lazy"`, `referrerPolicy="no-referrer"` and `alt` "<gloves> with <knife>", and no finish pictures; a combo without a screenshot, one whose URLs are not on `VITE_IMAGE_ORIGIN`, and one whose image fires `error` show the two finish pictures as today.
28. `website/src/api/origin.test.ts` (or a sibling) checks `VITE_IMAGE_ORIGIN` with the rules of `VITE_API_BASE_URL`; an invalid value fails `npm run build` naming the variable. The same holds in `admin/`.
29. Admin tests: each combo in a finish page list shows its state as text (None, Waiting, Done, Failed) and "Rendering" when `rendering` is true; the edit page shows the 1280 version, the state, the reason's fixed text for each reason code, and "Ask for a new screenshot", which sends `POST /admin/screenshots/request` with that id; Home shows a count per state.
30. Admin tests: the Screenshots page lists workers; Create sends the name and shows the token once in a read-only field with Copy; leaving and returning to the page shows no token; Revoke opens a confirmation naming the worker and sends the revoke on Confirm; failed combos are listed with links, and "Ask again for all failed" sends their ids in one request. No test finds the token in the drafts store, `localStorage`, `sessionStorage` or `document.cookie`.
31. `contentSecurityPolicy` in `admin/vite.config.ts` returns spec 010's policy with `img-src 'self' <game image host> <VITE_IMAGE_ORIGIN>`, and `npm run check:bundle` passes on a build and fails when the policy differs.

**Docs and checks**

32. `api/openapi.json` contains the routes of API / data model with their operation IDs and tags, and the new fields; `uv run python -m combo_api.openapi --check` exits 0; `npm run api:types:check` exits 0 in `admin/` and `website/`.
33. `api/.env.example` lists the storage settings and `IMAGE_BASE_URL` with local values, `api/tests/test_settings.py` passes, and a missing storage setting fails startup naming the variable only. `THIRD_PARTY_NOTICES.md` holds the Montserrat font's OFL notice. `api/README.md` documents agents, the storage settings, the Compose services, workers and their tokens, the worker routes and the job shape, the queue rules, the commands, and the watermark; `admin/README.md` the new screens; `website/README.md` screenshots and `VITE_IMAGE_ORIGIN`.
34. In `api/`: `uv run ruff format --check .`, `uv run ruff check .`, `uv run mypy`, `uv run pytest` (no skipped tests), the OpenAPI check and `export-website --check` exit 0; `docker build -t combo-skin-api api` exits 0 and the image is under 300 MB, its size recorded in Implementation notes. In `admin/` and `website/`: `npm ci`, `npm run lint`, `npm test`, `npm run build` (no chunk-size warning) exit 0, and the admin's `typecheck` and `check:bundle`.
35. Manual, against the local stack with an admin made with spec 007's tool: create a worker in the dashboard, then with `curl` and its token claim a job, send a 1920 by 1080 PNG, and see the screenshot on the dashboard's edit page and on the website's card for that combo (`npm run dev` in both apps), with no CSP violation in the admin's `npm run preview`.
36. After the branch is pushed, the `api`, `admin` and `website` workflow runs for its latest commit succeed on GitHub. `gitleaks dir . --no-banner --redact` on a clean clone and `gitleaks git` over the branch report no findings; URLs added are only `localhost`, `example.com` placeholders, the game's image host, the dataset's repository and public documentation.

## Test plan

| Criterion | How it is checked |
| --- | --- |
| 1, 2 | pytest: snapshot, validation and normaliser tests on the raw fixtures (no network); `refresh` with the recorded commit, then `git diff --exit-code` |
| 3, 4 | pytest: migration and import tests; `docker compose up -d --wait`, `docker compose logs catalog` |
| 5 to 8 | pytest: route tests in `tests/combos/` and `tests/screenshots/` through `client` |
| 9, 10 | Vitest: `AddComboPage.test.tsx`, `EditComboPage.test.tsx`, `BatchPage.test.tsx`, a new `ScreenshotsPage.test.tsx` |
| 11 to 14 | pytest: `tests/screenshots/test_workers.py`, the extended `tests/admins/test_require_admin.py` |
| 15 to 17 | pytest: `tests/screenshots/test_queue.py` with the test clock and concurrent sessions |
| 18 | The Compose commands; `curl` of both objects; `docker compose run --rm storage-init` twice |
| 19 to 24 | pytest: `tests/screenshots/test_upload.py`, `test_storage.py`, `test_commands.py`, `test_watermark.py`, with PNGs made in the tests |
| 25 | pytest: `tests/screenshots/test_s3.py`; read `.github/workflows/api.yml` |
| 26 | pytest: public route tests reading the raw body |
| 27, 28 | Vitest: `website/src/pages/Combos.test.tsx`, origin tests; the build command with a bad value |
| 29 to 31 | Vitest in `admin/`; `npm run build && npm run check:bundle` |
| 32 to 34 | The commands in the criteria; read the READMEs and notices |
| 35 | Manual, as written |
| 36 | Workflow run pages (after the owner pushes); the gitleaks commands; `git diff main... \| grep -oE 'https?://[^ )>"]+' \| sort -u` |

Section commands. In `api/`, with the Compose database and storage up:

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
npm run lint
npm test
npm run build
```

In the repo root:

```bash
docker build -t combo-skin-api api
docker compose up -d --wait
docker compose down -v
```

## Open questions

Each has a recommendation, already written into Design; the alternatives are in Design's tables.

- Q1. Worker authentication and limits. Recommended: a 256-bit bearer token per worker, made and revoked in the dashboard, stored as a SHA-256 digest, accepted only on `/worker/` routes, which refuse browser requests (any `Origin`).
- Q2. The float and seed a combo is drawn with. Recommended: the start of the combo's float range (or the finish's minimum) and its lowest seed (or the viewer's default).
- Q3. Claims and failures. Recommended: one combo per claim with a 5-minute lease; an expired lease counts as a failure; waits of 1 and 10 minutes; failed after 3 attempts until the inputs change or an admin asks again; worker-side problems released without counting.
- Q4. Local storage service. Recommended: RustFS (Apache-2.0), with SeaweedFS as the fallback if RustFS's bucket policy does not pass criterion 18.
- Q5. Upload path. Recommended: through the API as a raw PNG body, at most 16 MiB and exactly 1920 by 1080; the original kept byte for byte; replaced screenshots deleted at once, with a sweep for leftovers.
- Q6. Versions and watermark. Recommended: WebP at 640, 1280 and 1920 wide, made during the upload request; the text mark of Design. The sample must be approved before this spec is.
- Q7. Image URLs and CSP. Recommended: a `screenshot` object with full URLs in `PublicCombo` and `AdminCombo`; `VITE_IMAGE_ORIGIN` in both apps; the admin CSP's `img-src` gains it; no website CSP until the cleanup spec.
- Q8. Default agent. Recommended: a one-row table edited on the dashboard's Screenshots page; the dashboard shows "Default" with Ricksaw's name and picture for combos without their own agent.
- Q9. Finish pictures in our storage. Recommended: a follow-up spec. It needs a copy command, a catalog field for our URL, a public bucket prefix and a decision on keeping Steam URLs as a fallback, and nothing in this spec waits on it.
- Q10. Size. Recommended: approve the spec as a whole, then split it: 012 keeps Part A; Parts B and C move unchanged to a new spec, implemented after 012.

## Implementation notes

Filled in during implementation: deviations from the design and why, follow-ups discovered, and which test covers each acceptance criterion.

## Audit

Filled in by the audit: one line per acceptance criterion (pass or fail, with evidence), the results of lint, tests, build and the secret scan, and a verdict of Pass, Pass with follow-ups, or Fail.
