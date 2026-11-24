# 021: Serverless publishing

**Status:** Audited
<!-- Lifecycle: Draft → Approved → Implemented → Audited -->

**Section:** deploy (with website changes)
**Branch:** 021-serverless-publish

## Summary

Combo Skin goes live without a server. The back office (dashboard, API, PostgreSQL, storage and screenshot worker) stays on the owner's Mac and is never on the internet. A publish command on the Mac reads the published combos from the local API, builds the website with that data inside it, uploads the watermarked screenshots and our catalog picture copies to a public R2 bucket at `img.combo.skin`, and deploys the site to Cloudflare Pages on `combo.skin`. Visitors get static files served close to them, with nothing to go down and about €0 a month. The nightly database backup moves into the repository and gets a copy off the Mac.

This spec is the publish pipeline, the data files, images, headers, backups and runbooks. A real HTML page per route with link previews, a 404 page, a sitemap and `robots.txt` were Part B of its draft; they moved unchanged into spec 022 when the owner approved the draft and its split on 22 November.

## Goals and non-goals

**Goals**

- One command publishes the site: website code and combo data from one commit, deployed together, and only changed images uploaded.
- A failed publish leaves the live site as it was. Every deploy can be rolled back.
- The website reads static data files with the same types it reads from the API today, so the pages barely change.
- Strict security headers and a Content Security Policy on the site, and `noindex` on every `pages.dev` address.
- A test run on a `pages.dev` address before `combo.skin` changes, and written runbooks for credentials, the test run, going live, rollback and restoring a backup.
- The nightly database backup as a documented script in the repository, with a copy in a private R2 bucket.
- A design note in `docs/` on why static publishing beat a server.

**Non-goals**

- Link previews, per-route pages, the 404 page, the sitemap and `robots.txt`: spec 022.
- The credits page. It is its own spec and must be merged before going live.
- Analytics events (combo views, 3D opens). Cloudflare Web Analytics stays on as it is today.
- Steam login, votes and any other visitor feature that sends data back. Those would use Cloudflare Workers with D1 or Analytics Engine later. Nothing here blocks them (Design, Later visitor features).
- The 3D viewer and its repository, except for one viewer change made there before the test run (Design, 3D on the test address).
- Combo variations.
- Putting the API, dashboard, database, storage or worker on the internet: no Cloudflare Access and no `api` or `admin` subdomains.
- Doing anything on Cloudflare while this spec is written. The runbooks are carried out later, each with the owner's go-ahead.
- Publishing on a schedule or on every merge (Design, How code reaches the live site).
- Tools to purge Cloudflare's cache by URL. The runbook says how to do it in the dashboard.

## Context

Specs 001 to 020 are Audited and merged. Spec 019 moved the production work (response headers, the website's CSP, HSTS, `X-Robots-Tag`, production settings, the production image bucket and its domain) to "the `deploy/` spec". This is that spec. The 12 November decision to drop the server also drops Cloudflare Access, the admin's production headers and the `api` and `admin` subdomains from the old plan.

**Website**

- `website/src/api/client.ts` is the only module that makes requests. `createApi({ baseUrl })` sends `GET /{gloves|knives}/{type}/{finish}/combos` (`PublicCombo[]`) and `GET /combo-counts` (`ComboCounts`) with `credentials: 'omit'` and `redirect: 'error'`, and refuses any URL outside `baseUrl`. `ApiError` has the reasons `network`, `not_found` and `http`. Types come from `src/api/schema.d.ts`, generated from `api/openapi.json`.
- `src/api/queries.ts`: TanStack Query, 5-minute freshness, one retry except after `not_found`. `src/main.tsx` builds the client from `VITE_API_BASE_URL`.
- `src/api/origin.ts` and `vite.config.ts` check three settings and build them in: `VITE_API_BASE_URL` (default `http://localhost:8000`), `VITE_IMAGE_BASE_URL` (default the local storage service's public bucket) and `VITE_VIEWER_ORIGIN` (default the viewer's local build). `DEV_ALLOWED_HOSTS` is for the dev server only.
- `src/api/images.ts`: screenshots load only from the image base URL. Catalog pictures load from our copy (`catalog/<32 hex>.png` under the base URL, the key from `image_key` in `src/data/catalog.json` and `agents.json`), with one fallback to `https://community.akamai.steamstatic.com`.
- Routes (`src/App.tsx`): `/`, `/gloves`, `/gloves/:gloveId`, `/gloves/:itemId/:finishId/combos`, the same for knives. `?3d=<combo id>` opens the 3D window over a combos page (spec 018). There is no catch-all route. No page sets `document.title`, and `index.html` has one title for every page.
- `index.html` loads Montserrat from Google Fonts. The admin dashboard already bundles Montserrat from `@fontsource/montserrat`, and `THIRD_PARTY_NOTICES.md` covers it there.
- `src/pages/Combos.tsx` shows "Item not found" for a finish missing from the bundled catalog, before any request.
- The catalog is bundled: `src/data/catalog.json` (8 glove types with 94 finishes, 20 knife types with 576 finishes, about 300 KB in its own chunk) and `agents.json`, both written by `python -m combo_api.catalog export-website`.
- CI (`.github/workflows/website.yml`): `npm ci`, `api:types:check`, `lint`, `test`, `build`, read-only permissions.
- The site has no CSP and no `_headers` file. `website/nginx.toml` is a leftover buildpack config from earlier hosting.

**API** (unchanged by this spec)

- `api/src/combo_api/combos/public_routes.py`: the public routes return published combos only (`queries.PUBLISHED`), with image URLs built at response time from `IMAGE_BASE_URL` plus the object key (`screenshots/shapes.py`, `catalog/images.py`). Public CORS is on.
- Object keys never change for changed content. Screenshot versions are `combos/<combo id>/<version id>/<width>.webp` (640, 1280, 1920), and the version id is new on every upload and rebuild (`screenshots/keys.py`). Catalog copies are `catalog/<hash of the game's URL>.png`. Both are stored with `Cache-Control: public, max-age=31536000, immutable`. Originals live in a separate private bucket that nothing public can reach.
- Item fields include `pattern_group: {slug, name}` (spec 020).

**Measured on the owner's local data (22 November, 302 published combos, read-only):** 16 glove finishes and 210 knife finishes have combos. A finish's combos response averages 37 KB, the largest is 88 KB, about 2 KB per combo per side. Screenshot versions average 24 KB (640), 70 KB (1280) and 127 KB (1920), about 220 KB per combo.

**Already live on the owner's Cloudflare account:** `view.combo.skin` (the viewer, a Pages project built from its repository on every merge), `assets.combo.skin` (an R2 bucket with the viewer's game assets) and `combo.skin` (a coming-soon page in its own Pages project, with Web Analytics on). The coming-soon project's `_headers` (strict CSP, `nosniff`, HSTS without `includeSubDomains`, `Referrer-Policy`, `noindex` on its `pages.dev` hosts, immutable fonts) is the model for this site. `www.combo.skin` redirects to `combo.skin` through a rule that stays.

**The viewer** frames only under its allowed parents: `https://combo.skin`, `https://admin.combo.skin`, `https://view.combo.skin` and local ports (its `frame-ancestors` and message origins). A `pages.dev` address is not one of them, so "View in 3D" there shows its error and the screenshot.

**Backups today:** a script outside the repository, run by a LaunchAgent every night at 03:00, dumps the Compose project's `db` container with `pg_dump -Fc`, checks the dump with `pg_restore --list`, and keeps the newest 30 dumps (about 130 KB each). There is no copy off the Mac. Screenshot originals and our catalog copies are not backed up, but both can be made again: the worker re-renders a combo in under a second, and `copy-images` copies the pictures again.

**Missing:** a `deploy/` section, any production setting, any Cloudflare tooling in this repository, and the design note.

## Requirements

**The command**

- R1. `deploy/` holds the publish command, run on the Mac from the repository: `uv run --project deploy python -m combo_publish <subcommand>`. The subcommands are `check`, `publish`, `status`, `prune-images` and `backup`.
- R2. `publish` reads combos only from the local API's public routes (`GET /combo-counts`, then the combos route of each finish with combos). It never reads the database, the dashboard's routes or the originals bucket, and needs no credentials for them. It only reads public combos, so it can never publish a draft.
- R3. The export is consistent. Each finish's list length equals its count, and the glove-side and knife-side totals are equal. On a mismatch, for example when the owner edits combos during a publish, it exports once more, then stops with "Combos changed while publishing; run it again." Nothing has been uploaded or deployed at that point.
- R4. The website is built from one commit, never from the working tree. A production publish uses the tip of `origin/main` after `git fetch`. `--ref <commit>` is allowed only with `--preview`. The build happens in a temporary folder outside the repository, made with `git archive`. The checkout the command runs from is not changed: files, branch, index and stash stay as they were.
- R5. The build is `npm ci` and `npm run build` with the production settings (R22), plus the data files and `_headers` (spec 022 adds its pages). The settings go to the build as environment variables. No `.env` file is written.
- R6. Before anything is uploaded, the assembled site is checked against Pages' limits: at most 20,000 files, no file over 25 MiB, at most 100 `_headers` rules, no header line over 2,000 characters. It is also checked against our own rules: every data file is valid JSON in the public schema (R14), and no file holds a local URL (`localhost`, `127.0.0.1`, the local API or image base).
- R7. Images are uploaded before the site is deployed, and only the missing ones (R15).
- R8. A production publish runs in this order: (1) deploy the assembled folder as a preview deployment; (2) smoke-test that deployment's own URL; (3) deploy the same folder to production. Pages only uploads files it does not already have, so step 3 sends no file again. A failure at any step stops the publish with a non-zero exit, and the production site stays on its previous deployment. `--preview` stops after step 2.
- R9. The smoke test fetches `/`, `/data/combo-counts.json` (it must equal the export), one finish's data file, and one screenshot from the image host. It checks the headers of `/` (R18 to R20). Any difference fails the publish.
- R10. Only one publish or `prune-images` runs at a time, enforced by a lock file in the state folder (R16). A second run exits 1 and says which one is running.
- R11. `publish` prints, in this order: the commit and where it goes (preview or production); the number of published combos and of glove and knife finishes with combos; data files written and how many changed since the last production publish; images referenced, uploaded (count and MB), already there, and waiting to be pruned; Pages files and the preview URL checked; then the production URL and deployment id, with one line on how to roll back. `--dry-run` prints the same plan, uploads nothing and deploys nothing. Nothing printed, logged or written to the state folder holds a credential.
- R12. `status` prints the live production deployment (its id, commit and date, read from Pages), how many commits it is behind `origin/main`, and whether the local published combos differ from the live data. It changes nothing.
- R13. `check` checks the settings, the credentials' presence in the Keychain (never their values), that the local API and image bucket answer, that `node`, `npm` and the pinned `wrangler` work, and that `wrangler` sees the configured account. It changes nothing.

**Data files**

- R14. The deploy holds `/data/combo-counts.json` (the `ComboCounts` of `GET /combo-counts`) and one file per finish in the built commit's catalog: `/data/gloves/<type>/<finish>.json` and `/data/knives/<type>/<finish>.json`, each a `PublicCombo[]` in the API's order. A finish without combos gets `[]`. Each file holds exactly the API's JSON, with one change: every image URL under the local image base URL is rewritten under `https://img.combo.skin`. A URL anywhere else, or a field the public schema in `api/openapi.json` does not list, stops the publish.

**Images**

- R15. The public image bucket holds, for every published combo, its three watermarked WebP versions under the same keys as locally, and our copy of every catalog and agent picture named by the built `catalog.json` and `agents.json` (`image_key`). Spec 022 adds one link-preview JPEG per finish with combos. Each object is read anonymously from the local public bucket and uploaded with its `Content-Type` and `Cache-Control: public, max-age=31536000, immutable`. After each upload the returned ETag is compared with the MD5 of the bytes sent. A difference stops the publish. Keys already in the bucket (one listing per publish) are not uploaded again. `--verify-images` re-checks every key's size and ETag.
- R16. A state folder outside the repository (a setting, by default in the user's Application Support folder) records for each image key the date of the last production publish that used it, plus the last production deployment's id and commit. If the state is lost, the next production publish marks every listed key as used that day. Nothing is pruned because of lost state.
- R17. After a successful production publish, images no production publish has used for 30 days are deleted from the public bucket. Preview publishes never delete. `prune-images --dry-run` lists what would go. `prune-images --now <combo id>` deletes one combo's images at once, for content that must go right away, and says that Cloudflare's cache may keep serving them until they are purged in the dashboard (runbook).

**Headers** (Pages' `_headers`, generated from the settings by the publish command)

- R18. Every response has:
  - `Content-Security-Policy: default-src 'none'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self'; img-src 'self' https://img.combo.skin https://community.akamai.steamstatic.com; font-src 'self'; connect-src 'self' https://cloudflareinsights.com; frame-src https://view.combo.skin; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
  - `Strict-Transport-Security: max-age=31536000`;
  - `X-Content-Type-Options: nosniff`;
  - `Referrer-Policy: strict-origin-when-cross-origin`;
  - `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)`;
  - `Cross-Origin-Opener-Policy: same-origin`.
- R19. `/assets/*` (Vite's hashed files) and `/fonts/*` get `Cache-Control: public, max-age=31536000, immutable`. HTML and `/data/*` keep Pages' default, which revalidates on every load (`max-age=0, must-revalidate` with an ETag).
- R20. `https://:project.pages.dev/*` and `https://:version.:project.pages.dev/*` get `X-Robots-Tag: noindex`. Pages also adds it to preview deployments on its own. `combo.skin` does not get it.
- R21. No page triggers a CSP violation in Chrome or Firefox: home, a type page, a combos page with screenshots, the 3D window, the agent list, and a catalog picture falling back to the game's host.

**Production settings and the website**

- R22. Production builds use `VITE_IMAGE_BASE_URL=https://img.combo.skin` and `VITE_VIEWER_ORIGIN=https://view.combo.skin`, taken from the publish settings. No production value is in committed config or code. The publish settings file is gitignored, with an example of placeholders committed (R40).
- R23. The website reads combos and counts only from its own origin: `/data/<kind>/<type>/<finish>.json` and `/data/combo-counts.json`, with the same `Api` interface, the same `PublicCombo` and `ComboCounts` types, `credentials: 'omit'`, `redirect: 'error'`, and a refusal of any other origin. A 404, or a response that is not `application/json`, is `not_found`. A body of the wrong shape is `http`. The pages, queries and caching are unchanged.
- R24. `VITE_API_BASE_URL` is gone from the client. Its job becomes `DEV_API_BASE_URL` (no `VITE_` prefix, default `http://localhost:8000`, the same origin rules). The Vite dev server and `vite preview` answer `/data/...` from that API, so development shows the dashboard's published combos live. Setting `VITE_API_BASE_URL` stops the dev server and the build with a note to use `DEV_API_BASE_URL`.
- R25. The website bundles Montserrat (weights 400 to 700, Latin, `@fontsource/montserrat` as in the admin) and makes no request to Google's font hosts. `THIRD_PARTY_NOTICES.md` names the website too.
- R26. When a lazy-loaded chunk of an older deployment is gone (Vite's `vite:preloadError`), the page reloads once. A second failure in the same visit shows the error instead of reloading again.
- R27. `website/nginx.toml` is deleted.

**Credentials**

- R28. The command gets credentials only from the macOS Keychain at run time: a Cloudflare API token limited to Pages edits on the owner's account, an R2 token (access key id and secret) limited to object read and write on the public image bucket, and a separate R2 token limited to the backup bucket. Wrangler gets the Pages token only through the environment of its own process (`CLOUDFLARE_API_TOKEN`, with `CLOUDFLARE_ACCOUNT_ID` from the settings), so wrangler's own login is never used and no other account can be reached.
- R29. No credential is in the repository, in any `.env` file, on a command line, in the state folder, in the build folder or in any output. A missing Keychain item stops the command with its service name and the `security` command to add it, never with a value.

**Backups**

- R30. `backup` dumps the database of the Compose project's `db` service (`pg_dump -Fc` through `docker exec`), checks the dump with `pg_restore --list`, stores it with mode 600 and keeps the newest 30 locally. Then it uploads it to the private backup bucket and keeps the newest 30 daily dumps there, plus the first dump of each month for 12 months. A failed upload is logged and exits non-zero. It never deletes a local dump that has no copy in the bucket.
- R31. `deploy/backup/` holds the LaunchAgent template (label `skin.combo.db-backup`, 03:00 daily, log file) and an install script. The script writes the agent with the machine's real paths into the user's LaunchAgents folder and replaces the old job. `deploy/README.md` documents setup, logs and a tested restore.

R32 to R38 (Part B of the draft) moved to spec 022, which numbers them R1 to R7. The numbers are not reused here.

- R39. `docs/static-publishing.md` is the design note: the decision, what runs where (a diagram of Mac and Cloudflare), why static beat a server, the trade-offs accepted, the free-tier numbers, and what later visitor features would add (Workers with D1 or Analytics Engine).
- R40. `deploy/README.md` holds the runbooks: one-time setup (Cloudflare objects, tokens into the Keychain, settings file), the test run, going live, rollback, removing content now, backup setup and restore. The root README and `website/README.md` say how the site is published and drop `VITE_API_BASE_URL`. `deploy/publish.example.toml` lists every setting with placeholders.
- R41. `.github/workflows/deploy.yml` runs the `deploy/` lint, type check and tests on every push and pull request, with read-only permissions and no secrets. Nothing in CI can publish.

## Design

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| How code reaches the live site (owner's choice) | The publish command builds code and data together, from the tip of `origin/main`, on the Mac. A merge goes live on the next publish. `status` says how far behind the live site is | Pages building from GitHub on each merge, with the data in R2: merges go live by themselves (the Auto-deploy card's wish). But data and code get separate lifecycles: a rollback restores code and not data, the build must fetch data from R2 to make link-preview pages, the website reads cross-origin data that needs CORS and a wider `connect-src`, and the publish still has to trigger a build after data changes. Both ways, data only changes when the owner publishes. A nightly LaunchAgent publish: unattended deploys of whatever is on main; possible later as a one-line agent over `publish` |
| Data inside the deploy or in R2 (owner's choice) | Inside the deploy, as static files on the site's own origin. One deploy pairs code and data, one rollback restores both, `connect-src 'self'`, no CORS | Data in R2: needed only by the GitHub-build option above; two places to keep in step, and a second origin for every page load |
| Per-combo pages (owner's choice) | Finish pages only for now (spec 022). A combo stays `?3d=<id>` on its finish page, and a shared link shows the finish's preview with its best combo. Per-combo pages come with a share control later | `/combos/<id>` pages (about 2,000 more files, well within limits) with each combo's own preview: a visitor has no way to reach those links today, since the 3D window's address is `?3d=`, which static hosting cannot tell apart from the finish page. They need a share button or a new window address, a website design change of its own |
| Images of deleted or unpublished combos (owner's choice) | Deleted 30 days after the last production publish that used them. A rollback within Pages' window still finds its images, and `prune-images --now` covers urgent removal | Deleting on the next publish: rolling back would show catalog pictures in place of screenshots (the card's fallback). Never deleting: unpublished screenshots stay public for ever, and the bucket only grows. Keys have random version ids, so nobody can guess a deleted one in the meantime |
| Credentials (owner's choice) | Scoped API tokens in the macOS Keychain (Pages edit on the owner's account; R2 object read and write per bucket), read at run time | Wrangler's own OAuth login: no setup, but its token reaches every account the owner belongs to, including one that is not theirs, and gives R2 no S3 keys. Keys in a gitignored `.env`: plain-text secrets on disk, one `git add -f` from public |
| One spec or two (owner's choice) | Split. Part B moved unchanged into spec 022 at approval, as spec 012's split into 012 and 015 did. This spec alone can go live: without a `404.html`, Pages answers every path with `index.html`, as the app needs | One spec and one review: Part A is already about the size of spec 015, and Part B (route pages, previews, titles, sitemap) is reviewed on different grounds |
| Where the command reads combos | The local API's public routes over HTTP, and images from the local public bucket anonymously | The database directly: needs database credentials on the host, and repeats the query code that decides what is public. Reading through the API means the publish sees exactly what the site would. |
| Language and home | A Python package in `deploy/` (uv, ruff, mypy, pytest, like `api/`), using `boto3` for R2 (and, in spec 022, Pillow for preview JPEGs). It runs `npm` and wrangler as child processes (and spec 022's prerender script). `wrangler` is pinned exactly in `deploy/package.json` | Inside `api/`: the API image has no Node or wrangler, and the Keychain is on the host. All in Node: a second S3 client and image library for work `api/` already does in Python |
| 3D on the test address (owner's choice) | Before the test run, a change in the viewer's own repository adds `https://<project>.pages.dev` and `https://preview.<project>.pages.dev` to the viewer's allowed parents (`frame-ancestors` and message origins), so the test run checks "View in 3D" too. That change is the viewer's work, not this spec's | Testing 3D only after going live: the test run would miss the one cross-site feature most likely to break on a new origin |
| Uploading the site | `wrangler pages deploy` with `--branch` and `--commit-hash`; production branch `main`, previews on branch `preview` (`preview.<project>.pages.dev`) | The Pages REST API by hand: wrangler already hashes files and uploads only new ones |
| Safe production deploy | Preview deploy, smoke test, then production deploy of the same folder (R8) | Deploying to production then rolling back on failure: visitors could see the broken deploy for a moment |
| Image upload | Upload missing keys found by one listing; keys never change for changed content, so existence means up to date; ETag check per upload; 8 at a time | rclone sync: one more install and its own config file holding keys; its checks don't know our key rules |
| Data file layout | One file per finish (670) plus counts, matching today's two requests one for one. About 2 KB per combo per side; about 8 MB in all at 2,000 combos | One file for all combos: every page downloads every combo. Only finishes with combos: a missing file could not be told from a typo in a URL |
| Routing | Pages' SPA mode (no `404.html`): every path serves `index.html` with 200. Spec 022 adds a file per route and `404.html` | A `_redirects` rewrite: not needed while there is no `404.html` |
| Fonts | Bundled Montserrat, as the admin and the coming-soon page do | Allowing Google's font hosts in the CSP: a third party on every page view for no gain |
| CSP sources | Exactly R18. Web Analytics' script from `static.cloudflareinsights.com`; its beacon goes to `/cdn-cgi/rum` on the site's own origin, or to `cloudflareinsights.com`, so both are allowed. Any source added during implementation is recorded in Implementation notes | `'unsafe-inline'` for styles: React sets styles through the DOM, which the CSP allows, and the prerendered HTML has no inline styles |
| HSTS | `max-age=31536000` without `includeSubDomains`, as `combo.skin` sends today | `includeSubDomains` and preload: every subdomain is HTTPS on Cloudflare today, but preload is hard to undo; a later decision |
| State | One JSON file and a lock file in a folder outside the repository | The bucket itself: the public bucket is readable by anyone. Pages' deployment list: holds no image history |
| Backups | A `backup` subcommand (the same Keychain and `boto3` code), run by the LaunchAgent. Database only: screenshots and picture copies can be made again (Context) | A shell script with `aws` or `rclone`: one more install and its own key file. iCloud Drive: no retention control and not scriptable without a synced folder. Also backing up the originals bucket: about 0.5 GB for data the worker re-renders in minutes |
| Later visitor features | The site stays static. A Worker can later take a path such as `/api/*` through Pages Functions or a route on the zone, with D1 or Analytics Engine, and the CSP's `connect-src 'self'` already allows same-origin calls | |

**Free-tier limits** (Cloudflare's docs, checked 22 November; estimates at about 2,000 combos and the catalog's 670 finishes)

| Limit (free plan) | Value | Our use | Headroom |
| --- | --- | --- | --- |
| Pages files per deploy | 20,000 | About 720 here (670 finish files, counts, about 40 built files, fonts, headers); about 1,425 with spec 022's pages. Per-combo pages would add about 2,000 | 14 to 28 times |
| Pages file size | 25 MiB | Largest: the catalog chunk, about 300 KB. The largest finish file is about 88 KB today, maybe 0.5 MB at 2,000 combos | 50 times or more |
| `_headers` rules / line length | 100 / 2,000 characters | 6 rules; the CSP line is about 420 characters | Ample |
| Pages static requests and bandwidth | Free and unlimited | All site traffic (no Functions) | Unlimited |
| Pages builds | 500 a month | 0 (direct upload) | n/a |
| Pages deployments kept | The 100 most recent and the live one always; older than 30 days deleted after that | One or two per publish | The rollback window |
| R2 storage | 10 GB-month | About 220 KB × 2,000 = 0.44 GB of screenshots, about 55 MB of picture copies, about 0.1 GB of preview JPEGs. Backups well under 0.1 GB | About 15 times |
| R2 Class A (writes, lists) | 1 million a month | About 7,300 uploads once. Then new images and a few listings per publish, and about 100 a month for backups | Over 100 times |
| R2 Class B (reads) | 10 million a month | Only cache misses on `img.combo.skin`, with a cache rule as `assets.combo.skin` has. Even with no cache, about 330,000 image loads a day | Large |
| R2 egress | Free | | |
| Workers requests | 100,000 a day | 0 | n/a |

Sources: [Pages limits](https://developers.cloudflare.com/pages/platform/limits/), [direct upload](https://developers.cloudflare.com/pages/get-started/direct-upload/), [preview deployments](https://developers.cloudflare.com/pages/configuration/preview-deployments/), [rollbacks](https://developers.cloudflare.com/pages/configuration/rollbacks/), [Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [R2 limits](https://developers.cloudflare.com/r2/platform/limits/), [R2 tokens](https://developers.cloudflare.com/r2/api/tokens/), [R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/), [Web Analytics FAQ](https://developers.cloudflare.com/web-analytics/faq/).

**Runbooks** (in `deploy/README.md`. Each Cloudflare step is done by the owner, or with the owner's go-ahead at the time)

- *One-time setup, before the test run:* create the Pages project with production branch `main`; create the public image bucket and connect `img.combo.skin` (TLS 1.2 minimum, `r2.dev` off, a cache rule like `assets.combo.skin`'s). Nothing links to it before go-live, so connecting it early is safe. Create the private backup bucket; create the three scoped tokens; add them to the Keychain with `security add-generic-password ... -w`, typing each value at the prompt so it is never on a command line; fill `deploy/publish.toml`; run `check`.
- *Test run:* `publish --preview`, then check `preview.<project>.pages.dev` against criterion 25. Then a production publish to `<project>.pages.dev` (not yet `combo.skin`), and the rollback rehearsal of criterion 26.
- *Going live* (when the owner says, after the credits page is merged): a production publish; remove `combo.skin` from the coming-soon project's custom domains; add it to the new project; check `https://combo.skin` (headers, HSTS, pages, images, 3D); turn on Web Analytics for the new project and check `combo.skin`'s history stays in its Web Analytics site; keep the `www` rule; keep the coming-soon project for a week as the fallback (going back means moving the domain back), then delete it if the owner wants.
- *Rollback:* Pages dashboard → the project → Deployments → an earlier production deployment → "Rollback to this deployment" (or the API with the Pages token). Data rolls back with the code. Images unused for more than 30 days may show as catalog pictures.
- *Removing content now:* unpublish in the dashboard, `publish`, `prune-images --now <combo id>`, then purge the image URLs from Cloudflare's cache in the dashboard.
- *Restore:* download a dump from the backup bucket, `pg_restore` into a new database, compare row counts.

## API / data model

No API changes.

**Data files** (in the deploy, same origin):

| Path | Content |
| --- | --- |
| `/data/combo-counts.json` | `ComboCounts`: `{"gloves": {"<type>": {"<finish>": n}}, "knives": {...}}`, finishes without combos left out |
| `/data/gloves/<type>/<finish>.json` | `PublicCombo[]` of that glove finish, best rated first; `[]` without combos |
| `/data/knives/<type>/<finish>.json` | The same for a knife finish |

Image URLs inside are `https://img.combo.skin/combos/<combo id>/<version id>/<width>.webp` and `https://img.combo.skin/catalog/<32 hex>.png`. `fallback_image_url` stays the game's URL.

**Public bucket keys:** `combos/<combo id>/<version id>/<640|1280|1920>.webp`, `catalog/<32 hex>.png`, and (spec 022) `og/<combo id>/<version id>.jpg`. All use `Cache-Control: public, max-age=31536000, immutable`.

**Backup bucket keys:** `db/<YYYY-MM-DD_HHMMSS>.dump`.

**Settings** (`deploy/publish.toml`, gitignored, an example committed): `account_id`, `pages_project`, `site_origin`, `image_base_url`, `viewer_origin`, `public_bucket`, `backup_bucket`, `local_api_url` (default `http://127.0.0.1:8000`), `local_image_base_url` (default the local public bucket), `state_dir`, `compose_project`, and the Keychain service names of the three tokens. None of them is a secret.

**State** (`<state_dir>/state.json`): `{"live": {"deployment": "...", "commit": "...", "at": "..."}, "data_sha256": "...", "images": {"<key>": "<YYYY-MM-DD last used>"}}`.

## Security

- S1. The back office is never on the internet. The publish command talks to the local API and bucket on loopback addresses only, and to Cloudflare. Nothing it deploys can reach the Mac.
- S2. Only data the public API returns is published: no drafts, admin fields, screenshot agents, worker data or originals. Data files hold only fields of the public schema (R14).
- S3. Credentials come only from the Keychain, are scoped to the least they need (Pages edit on one account; object read and write on one bucket each), reach wrangler only through its process environment, and never appear in the repository, `.env` files, command lines, state, build folders, logs or output (R28, R29).
- S4. Every Cloudflare call uses the owner's account id from the settings; the Pages token cannot reach any other account.
- S5. The site sends the CSP and headers of R18 to R20; the CSP allows scripts only from the site and Web Analytics, frames only from the viewer, images only from the site, the image host and the game's host.
- S6. Data files are served as `application/json` with `nosniff`, never as HTML.
- S7. The backup bucket is private, reachable only with its own token. Dumps hold admin password hashes and sessions, so they are never put in the public bucket and are mode 600 on disk.
- S8. CI has read-only permissions and no Cloudflare secrets.
- S9. No account id, bucket name, project name, token or local path is committed; production hosts appear only in the gitignored settings and in what the command generates.

## Acceptance criteria

**Command** (`deploy/tests`, pytest, with a fake API, fake bucket, fake Keychain and a fake `wrangler` that records its arguments and environment)

1. `check` with everything present exits 0 and prints each item as ready; with a missing Keychain item it exits 1 naming the service and the `security` command, and no value.
2. Export against a fake API with 3 finishes with combos writes 670 finish files and the counts for a 670-finish catalog; the 3 files equal the fake's answers with image URLs rewritten under the image host; the rest are `[]`; the counts equal the fake's.
3. Export stops, with nothing uploaded and wrangler never run, on: an image URL off the local image base; an extra field in a combo (`status`, `screenshot_agent`); a list length that differs from its count on both tries (the message of R3). One mismatch followed by a match succeeds.
4. The build folder comes from `git archive` of the resolved commit in a temporary repository; a production publish of a commit not on `origin/main` and `--ref` without `--preview` both exit 1; after a publish the source checkout's status, branch, stash list and files are unchanged.
5. The production settings reach `npm run build` as environment variables; no `.env` file is created anywhere; the built bundle contains `https://img.combo.skin` and `https://view.combo.skin` and no `localhost`, `127.0.0.1` or local API URL.
6. Limits: an assembled folder of 20,001 files, a 26 MiB file, 101 header rules, or a 2,001-character header line each exit 1 before any upload.
7. Images: the referenced keys are every screenshot version in the data plus every `image_key` of the built `catalog.json` and `agents.json`; missing keys are uploaded with their `Content-Type` and the immutable `Cache-Control`; present keys are not; a wrong ETag exits 1 before wrangler runs; the command has no setting or code path for the originals bucket (a test asserts the settings model and a grep of the package).
8. Order: wrangler is called with `--branch preview` then, after the smoke test passes, `--branch main` on the same folder; a failing preview deploy, smoke test or production deploy exits 1, and in the first two cases the production deploy is never called and the state is unchanged.
9. Smoke test: a preview whose counts differ from the export, or whose `/` lacks a header of R18, fails the publish.
10. Prune: keys unused for 30 or more days are deleted only after a successful production publish; a preview publish deletes nothing; `--dry-run` deletes nothing and lists them; with no state file nothing is deleted and every listed key is marked used today; `--now <id>` deletes exactly that combo's keys and prints the cache note.
11. A second `publish` while the lock is held exits 1 naming the running one.
12. With fake Keychain values, none of them appears in stdout, stderr, the state folder, the build folder or wrangler's arguments; wrangler's environment has `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` and no R2 keys.
13. `publish --dry-run` prints the plan of R11, uploads nothing and never calls wrangler; a real run prints the lines of R11 in order (golden test).
14. `status` against a fake deployment list prints the live commit, how far behind `origin/main` it is, and whether the data differs.
15. `_headers` generated from the example settings equals the expected file (golden test), including R18 to R20 exactly.

**Website** (Vitest)

16. `src/api/client.test.ts`: both calls request same-origin `/data/...` paths with `credentials: 'omit'` and `redirect: 'error'`; a URL off the page's origin is refused before `fetch`; 404 and a `text/html` 200 give `not_found`; a wrong shape gives `http`. The page tests pass with the fake moved to the data paths.
17. The dev and preview servers' `/data/` middleware maps each path to the right API route on `DEV_API_BASE_URL` and passes the status through (unit test of the mapping); `VITE_API_BASE_URL` set stops the build with the note of R24 (`vite.config` test or a build run in CI).
18. `npm run build` output references no `fonts.googleapis.com` or `fonts.gstatic.com` and contains a Montserrat `woff2`; `THIRD_PARTY_NOTICES.md` names the website.
19. A `vite:preloadError` reloads the page once; a second one in the same visit does not.
20. `website/nginx.toml` is gone; `grep -rn VITE_API_BASE_URL website/src website/.env.example` prints nothing.

**Backups**

21. Tests with fake `docker` and bucket: a good dump is kept locally (mode 600), uploaded, and retention keeps 30 local, 30 daily remote plus one a month for 12 months; a failed `pg_restore --list` keeps no dump; a failed upload exits non-zero and deletes no local dump without a remote copy.
22. Manual: after `deploy/backup/install.sh`, `launchctl print` shows the job at 03:00; a forced run logs "OK" and the dump appears in the bucket; a restore of the bucket's copy into a throwaway database matches the row counts of every table.

**Docs and CI**

23. `docs/static-publishing.md`, `deploy/README.md` (every runbook of Design), `deploy/publish.example.toml`, and the root and website READMEs match R39 and R40; `.github/workflows/deploy.yml` runs lint, types and tests with `contents: read` and no secrets, and passes on the branch.
24. `gitleaks git --no-banner --redact` on the branch finds nothing; `git grep -nE '[0-9a-f]{32}' -- deploy docs` finds only test fakes; `git ls-files deploy` holds no `publish.toml`.

**Test run** (manual, the owner's Cloudflare objects made per the runbook)

25. `publish --preview` succeeds; on the preview URL, home, a type page, a combos page with screenshots from `img.combo.skin`, a catalog picture and its fallback all load, with no CSP violation in Chrome and Firefox consoles; `curl -sI` shows the headers of R18 and `X-Robots-Tag: noindex`; a second `publish --preview` with no changes uploads 0 images and wrangler reports no new files; "View in 3D" opens, draws the combo, and plays Inspect (with the viewer change of Design in place).
26. Rollback rehearsal on `<project>.pages.dev`: two production publishes with different data, a dashboard rollback to the first shows its data, and its screenshots still load.

Criteria 27 to 33 (Part B of the draft) moved to spec 022 as its criteria 1 to 7.

## Test plan

| Criterion | How it is checked |
| --- | --- |
| 1 to 15 | pytest in `deploy/tests` with fakes (API, bucket, Keychain, `wrangler`, `git` in a temporary repository) |
| 16 to 20 | Vitest in `website/`, the build, and `grep` |
| 21 | pytest with fake `docker` and bucket |
| 22 | Manual on the Mac, after the backup bucket exists |
| 23 | Reading the docs against R39 and R40; the workflow run page after the owner pushes |
| 24 | The `gitleaks` and `git grep` commands |
| 25, 26 | Manual test run per the runbook |

Commands:

```bash
cd deploy && uv sync --locked && uv run ruff check && uv run ruff format --check && uv run mypy && uv run pytest
cd website && npm ci && npm run api:types:check && npm run lint && npm test && npm run build
gitleaks git --no-banner --redact
```

## Open questions

None. On 22 November the owner approved every recommendation of the draft: the publish command builds code and data together from `origin/main`; the data lives inside the deploy; finish pages only, with per-combo pages later with a share control; images are deleted 30 days after their last production use, with `prune-images --now` for urgent cases; scoped tokens in the Keychain; Part B split into spec 022; and a viewer change before the test run so 3D works on the `pages.dev` addresses. The answers are recorded in Design as the owner's choice.

## Implementation notes

Implemented on 22 November. Test ids are `deploy/tests/<file>::<test>` and `website/<file>` (Vitest).

### Criteria and tests

| Criterion | Covered by |
| --- | --- |
| 1 | `test_check.py`: `test_everything_present_is_ready`, `test_a_missing_keychain_item_names_the_service_and_command_but_no_value`, `test_missing_keychain_items_and_no_api_are_reported`, `test_a_wrong_wrangler_version_or_account_is_reported`, `test_schema_drift_is_reported`, `test_bad_settings_stop_the_check` |
| 2 | `test_export.py::test_every_finish_of_the_catalog_gets_a_file` (670-finish catalog; 3 combos over 2 glove and 2 knife finishes), `test_the_api_order_is_kept` |
| 3 | `test_export.py`: `test_an_image_url_off_the_local_base_stops_the_publish`, `test_an_extra_field_stops_the_publish` (`status`, `screenshot_agent`), `test_a_list_that_differs_from_its_count_twice_stops_with_the_message`, `test_one_mismatch_then_a_match_succeeds`, `test_unequal_glove_and_knife_totals_are_a_mismatch`, `test_a_finish_missing_from_the_built_catalog_stops` |
| 4 | `test_publish.py`: `test_the_build_comes_from_an_archive_of_origin_main_outside_the_checkout` (an unpushed commit, an uncommitted `catalog.json` change and an untracked file: the build sees exactly `origin/main`'s files and the deploy exactly its finishes), `test_a_production_publish_takes_no_ref`, `test_a_preview_can_build_another_commit`, `test_the_build_folder_is_refused_inside_the_repository` |
| 5 | `test_publish.py`: `test_the_production_settings_reach_the_build_as_its_environment`, `test_a_local_url_in_the_build_stops_before_any_upload`, `test_a_bare_localhost_base_in_a_library_is_not_a_local_url`; a production-settings `vite build` of the website holds `https://img.combo.skin` and `https://view.combo.skin`, no `127.0.0.1`, and `localhost` only as React Router's bare `"http://localhost"` (Deviations, 3); no asset inlined as a `data:` URL: `test_an_inlined_data_url_in_the_build_stops_before_any_upload`, `test_a_data_key_in_the_bundle_is_not_a_data_url` (Deviations, 15) |
| 6 | `test_limits.py`: `test_20001_files_fail`, `test_a_26_mib_file_fails`, `test_101_header_rules_fail`, `test_a_2001_character_header_line_fails`, `test_a_data_file_outside_the_schema_fails`, `test_each_limit_stops_the_publish_before_any_upload` |
| 7 | `test_images.py`: `test_the_referenced_keys_are_every_screenshot_and_every_catalog_picture`, `test_uploads_keep_their_type_and_get_the_immutable_cache_control`, `test_present_keys_are_not_uploaded_again`, `test_a_wrong_etag_stops_before_wrangler_runs`, `test_uploads_are_checked_against_md5`, `test_verify_images_uploads_a_changed_copy_again`; `test_headers.py::test_the_settings_have_no_originals_bucket` (settings model and a grep of the package) |
| 8 | `test_publish.py`: `test_preview_then_smoke_test_then_production_of_the_same_folder`, `test_a_failed_preview_or_smoke_test_never_reaches_production`, `test_a_failed_production_deploy_exits_1_and_keeps_the_state`, `test_a_preview_publish_stops_after_its_smoke_test` |
| 9 | `test_publish.py`: `test_counts_that_differ_from_the_export_fail_the_smoke_test`, `test_a_missing_header_fails_the_smoke_test`, `test_a_missing_screenshot_on_the_image_host_fails_the_smoke_test`; the requests' user agent: `test_http.py` (Deviations, 14) |
| 10 | `test_images.py`: `test_keys_unused_for_30_days_are_pruned_after_a_production_publish`, `test_a_preview_publish_deletes_nothing`, `test_a_failed_production_publish_deletes_nothing`, `test_prune_dry_run_lists_and_deletes_nothing`, `test_without_a_state_file_nothing_is_deleted_and_every_key_is_marked_today`, `test_prune_now_deletes_exactly_one_combo_and_prints_the_cache_note`, `test_prune_never_deletes_what_the_live_deployment_uses`, `test_prune_after_lost_state_never_deletes_the_live_images`, `test_prune_refuses_a_state_without_a_live_deployment`, `test_prune_now_works_without_a_recorded_publish` |
| 11 | `test_publish.py`: `test_a_second_publish_while_the_lock_is_held_names_the_running_one`, `test_the_lock_is_held_by_a_running_process` |
| 12 | `test_publish.py::test_no_credential_appears_anywhere`, `test_a_missing_credential_stops_before_anything_is_uploaded`; `test_backup.py::test_a_good_dump_is_kept_private_and_uploaded` |
| 13 | `test_publish.py`: `test_a_dry_run_prints_the_plan_and_uploads_and_deploys_nothing`, `test_a_dry_run_without_the_image_token_still_plans`, `test_a_real_run_prints_the_lines_in_order` (golden) |
| 14 | `test_status.py`: `test_status_prints_the_live_deployment_and_that_nothing_changed`, `test_status_counts_commits_behind_and_changed_data`, `test_status_after_a_rollback_reads_the_rolled_back_deployment` |
| 15 | `test_headers.py`: `test_headers_from_the_example_settings_equal_the_golden_file` (`deploy/tests/golden/_headers`), `test_the_golden_file_holds_r18_to_r20_exactly` |
| 16 | `website/src/api/client.test.ts`; the page tests pass with the fake on the data paths (`src/test/fakeApi.ts`, unknown paths answered like Pages: the app's HTML with 200) |
| 17 | `website/src/api/devData.test.ts` (mapping and status pass-through), `website/scripts/removedSettings.test.ts`; the website workflow's step "Check VITE_API_BASE_URL is gone and stops the build" runs a build with it set |
| 18 | The website workflow's step "Check the build bundles Montserrat and no Google fonts"; `THIRD_PARTY_NOTICES.md` names the website |
| 19 | `website/src/staleChunks.test.ts` |
| 20 | `website/nginx.toml` deleted; `grep -rn VITE_API_BASE_URL website/src website/.env.example` prints nothing (also a workflow step) |
| 21 | `test_backup.py`: `test_a_good_dump_is_kept_private_and_uploaded`, `test_a_dump_that_does_not_read_back_is_not_kept`, `test_a_failed_upload_exits_non_zero_and_deletes_no_local_dump`, `test_retention_keeps_30_local_and_30_daily_plus_12_monthly_remote`, `test_remote_keep_takes_the_first_dump_of_each_of_12_months`; the LaunchAgent template and installer: `test_launch_agent.py` |
| 22 | **Pending the Cloudflare setup** (the backup bucket and its token). Runbook: `deploy/README.md`, Backups. The restore steps and `deploy/backup/counts.sql` were tried on a throwaway PostgreSQL container. The new LaunchAgent is not installed; the old backup job keeps running until then |
| 23 | `docs/static-publishing.md`, `deploy/README.md` (every runbook), `deploy/publish.example.toml`, the root and website READMEs; `.github/workflows/deploy.yml` (`contents: read`, no secrets). The workflow run waits for the push |
| 24 | `gitleaks git --no-banner --redact`: no leaks. `git grep -nE '[0-9a-f]{32}' -- deploy docs` finds the test fakes and the example's placeholder zeros in `deploy/`, and outside it only lock-file hashes and the public dataset commit hashes of older specs; no account id. `git ls-files deploy` holds no `publish.toml` |
| 25, 26 | **Pending the Cloudflare setup.** Runbooks: `deploy/README.md`, Test run (step 7 is the rollback rehearsal) |

### Deviations

1. **Schema drift check (owner's fix, 22 November).** A production publish builds the website from `origin/main`, but the local API runs whatever the stack was last rebuilt from. R14 only caught extra fields. Before the export, the command now compares the public schemas (`PublicCombo`, `ComboCounts` and everything they reference) in the running API's `/openapi.json` with the built commit's `api/openapi.json`, and stops with "Rebuild the stack first: docker compose up -d --wait --build", naming the differing schemas. `check` reports the same against `origin/main` as last fetched. Titles and descriptions are ignored, since they change no document. Tests: `test_schema.py`, `test_publish.py::test_schema_drift_stops_the_publish_before_the_export`, `test_check.py::test_schema_drift_is_reported`.
2. **R6's reference (owner's fix).** R6 pointed to "(R12)" for the public schema; it means R14. Fixed in R6.
3. **Local addresses (R6, criterion 5).** React Router parses relative URLs against a bare `"http://localhost"`, so every real build holds that string. The check refuses `localhost` followed by a port (every local service has one), any `127.0.0.1` or `[::1]`, and the configured local API and image base, and allows the bare `localhost` base.
4. **Pruning never touches the live deployment's images.** As written, a `prune-images` run more than 30 days after the last production publish would delete the live site's own images, whose last use is that publish. The state's `live` entry now also lists the image keys the live deployment uses, and those are never due. The state also keeps each data file's hash (`data_files`), to count the changed files R11 prints. The first audit found that after a lost state, `prune-images` alone still could: it marked every key as used and wrote a state with no live deployment, so a second run 30 days later deleted everything. Now `prune-images` (without `--now`) refuses until a production publish has recorded the live deployment, and writes nothing (R16).
5. **`backup_dir` setting.** The local dump folder is a setting (default under Application Support), alongside `state_dir`.
6. **Dry run without credentials.** `publish --dry-run` runs before the setup: without the image token it says the bucket was not checked and counts every referenced image as to upload, with sizes read from the local bucket.
7. **Missing catalog copies.** A catalog copy missing from the local bucket is skipped and counted, since the site shows the game's picture for it. A missing screenshot stops the publish.
8. **`status` reads the live deployment from the Pages API** (the project's canonical deployment, with the Pages token). Wrangler's deployment list doesn't say which one is live after a rollback. The data comparison reads the live deployment's own data files.
9. **R2 credentials** are one Keychain item per token, holding `<access key id>:<secret access key>`.
10. **Wrangler's environment** is built from scratch: PATH, the locale, the temporary folder, an empty home and config folder, the Pages token and the account id. Its login and config can't be read even by accident.
11. **`_headers` has 5 rules**, not the 6 of the free-tier table. Vite bundles the Montserrat files into `/assets/`, so the `/fonts/*` rule of R19 is kept but matches nothing today.
12. **Criterion 20's grep and R24's refusal.** The note that refuses `VITE_API_BASE_URL` lives in `website/scripts/removedSettings.ts`, outside `src/`, so the grep prints nothing while the refusal still works.
13. **The website drops `openapi-fetch`**: the client builds its own `/data/` URLs with `fetch`. Slugs that are not catalog slugs are `not_found` without a request.
14. **The command's user agent (R9; first preview publish, 24 November).** The first `publish --preview` uploaded and deployed, then its smoke test failed with status 403: Cloudflare answers 403 to Python's default `Python-urllib/3.x` user agent, on the Pages addresses and on `img.combo.skin` alike. Every request the command makes now sends `User-Agent: combo-publish/<the package's version>`; a user agent passed in by the caller still wins. Tests: `test_http.py`.
15. **No inlined assets (R6, R21; first preview publish, 24 November).** On the preview, the CSP blocked the Karambit icon before "About Us" on the home page: Vite had inlined `karambit.svg` (3.5 KB, under its default 4 KB `assetsInlineLimit`) as a `data:image/svg+xml` URL, and `img-src` rightly has no `data:`. The website's build now sets `assetsInlineLimit: 0`, so every asset is a file from the site's own origin; the CSP is unchanged. It was the only inlined asset: the Montserrat files, `logo.svg` and every picture were already files, and `footer.svg` and `react.svg` are not imported. So it can't come back, the site check of R6 also refuses a `.js`, `.mjs`, `.css` or `.html` file holding a `data:image/` or `data:font/` URL (`font-src` has no `data:` either) before any upload; pictures and fonts themselves are not searched, and object keys named `data` are not URLs. The website workflow checks its build the same way. Tests: `test_publish.py`: `test_an_inlined_data_url_in_the_build_stops_before_any_upload`, `test_a_data_key_in_the_bundle_is_not_a_data_url`; `test_limits.py`: `test_an_inlined_data_image_in_code_fails`, `test_an_image_file_is_not_searched_for_data_urls`; the website workflow's step "Check the build inlines no assets as data URLs".

### Follow-ups

- The viewer's own repository adds the `pages.dev` addresses to its allowed parents before the test run (Design, 3D on the test address).
- Criteria 22, 25 and 26 after the one-time Cloudflare setup, per the runbooks; then `deploy/backup/install.sh` replaces the old backup job.
- After merging, `VITE_API_BASE_URL` in a local `website/.env` stops the dev server: rename it to `DEV_API_BASE_URL` (or delete it to use the default).
- Spec 022 (link previews) builds on this command: prerendered pages, preview JPEGs (Pillow) and `404.html`.

### Dry run on the owner's data (22 November)

`publish --preview --ref <this branch> --dry-run` against the local API and bucket, with settings whose Keychain names don't exist: 302 published combos, 16 glove and 210 knife finishes with combos; 671 data files (1.15 MB, the largest 85 KB); 1,639 images referenced (906 screenshot versions and 733 catalog and agent copies, none missing locally), 146.1 MB to upload; 782 Pages files, 5.7 MB. Nothing was uploaded or deployed.

## Audit

**Date:** 2026-11-22 · **Branch:** 021-serverless-publish · **Commit:** 07a87d1
**Verdict:** Pass with follow-ups

Re-audit. The first audit (commit 5cf6006) failed on two findings, both fixed since: `prune-images` could delete the live site's images after a lost state (fixed in `deploy/src/combo_publish/prune.py`, Deviations 4), and criterion 4's test did not show the build uses the commit's files. Criteria 22, 25 and 26 are manual and wait for the Cloudflare setup.

Test ids are `deploy/tests/<file>::<test>`; pytest ran with `uv run pytest`, Vitest with `npm test`.

| # | Criterion | Result | Evidence |
| --- | --- | --- | --- |
| 1 | `check` | Pass | `test_check.py` (6 tests): ready lines, missing item names service and command, no value |
| 2 | Export of a 670-finish catalog | Pass | `test_export.py::test_every_finish_of_the_catalog_gets_a_file`, `test_the_api_order_is_kept` |
| 3 | Export stops | Pass | `test_export.py`: off-base URL, `status` and `screenshot_agent`, two mismatches, one mismatch then a match; nothing uploaded, wrangler and npm never run |
| 4 | Build from `git archive`, ref rules, checkout unchanged | Pass | `test_the_build_comes_from_an_archive_of_origin_main_outside_the_checkout`: with an unpushed commit, an uncommitted `catalog.json` change and an untracked file, the build sees exactly `origin/main`'s files and the deploy exactly its finishes; a build that copied the working tree was tried and fails it. `test_a_production_publish_takes_no_ref`, `test_a_preview_can_build_another_commit` |
| 5 | Production settings reach the build; no local URL | Pass | `test_the_production_settings_reach_the_build_as_its_environment`, `test_a_local_url_in_the_build_stops_before_any_upload`; a production-settings `vite build` of this commit holds both hosts and no local address with a port, `127.0.0.1` or `[::1]` |
| 6 | Pages limits | Pass | `test_limits.py` (20,001 files, 26 MiB, 101 rules, 2,001 characters, each before any upload) |
| 7 | Images | Pass | `test_images.py` (referenced keys, type and immutable `Cache-Control`, present keys skipped, wrong ETag before wrangler); `test_headers.py::test_the_settings_have_no_originals_bucket` |
| 8 | Deploy order | Pass | `test_preview_then_smoke_test_then_production_of_the_same_folder`, `test_a_failed_preview_or_smoke_test_never_reaches_production` (state compared before and after), `test_a_failed_production_deploy_exits_1_and_keeps_the_state` |
| 9 | Smoke test | Pass | `test_counts_that_differ_from_the_export_fail_the_smoke_test`, `test_a_missing_header_fails_the_smoke_test` |
| 10 | Prune | Pass | `test_images.py` (30 days, preview, dry run, no state, `--now`), and since the first audit `test_prune_after_lost_state_never_deletes_the_live_images`, `test_prune_refuses_a_state_without_a_live_deployment`, `test_prune_now_works_without_a_recorded_publish` |
| 11 | Lock | Pass | `test_a_second_publish_while_the_lock_is_held_names_the_running_one`, `test_the_lock_is_held_by_a_running_process` |
| 12 | No credential anywhere | Pass | `test_no_credential_appears_anywhere`: output, state, the deployed site folder, wrangler's arguments and environment. Its scan of the temporary folder runs after the folder is deleted (follow-up) |
| 13 | Dry run and output order | Pass | `test_a_dry_run_prints_the_plan_and_uploads_and_deploys_nothing`, `test_a_real_run_prints_the_lines_in_order` |
| 14 | `status` | Pass | `test_status.py` (live commit, behind count, data differs, rollback) |
| 15 | `_headers` golden | Pass | `test_headers_from_the_example_settings_equal_the_golden_file`, `test_the_golden_file_holds_r18_to_r20_exactly` |
| 16 | Website client | Pass | `website/src/api/client.test.ts` (data paths, `omit`, `error`, refusals before fetch, 404 and HTML 200 as `not_found`, wrong shape as `http`); page tests pass on the data paths |
| 17 | Dev `/data/` and the old setting | Pass | `website/src/api/devData.test.ts`, `website/scripts/removedSettings.test.ts`; a build with `VITE_API_BASE_URL` set exited 1 with the note |
| 18 | Fonts | Pass | `npm run build`: no Google font host in `dist`, 4 Montserrat `woff2` files; `THIRD_PARTY_NOTICES.md` names the website |
| 19 | Stale chunk reload | Pass | `website/src/staleChunks.test.ts` |
| 20 | `nginx.toml`, `VITE_API_BASE_URL` | Pass | File gone; the grep printed nothing |
| 21 | Backup | Pass | `test_backup.py` (5 tests), `test_launch_agent.py` |
| 22 | Backup on the Mac | Pending | Manual, after the backup bucket exists (runbook: `deploy/README.md`, Backups) |
| 23 | Docs and CI | Pass | The design note, `deploy/README.md`, the example settings and both READMEs match R39 and R40; `deploy.yml` has `contents: read` and no secrets. Its first run waits for the push; its commands pass locally from a clean install |
| 24 | Secrets and hashes | Pass | gitleaks clean; the 32-hex grep finds only test fakes and the example's zeros in `deploy/`; no `publish.toml` tracked |
| 25 | Test run | Pending | Manual, after the Cloudflare setup |
| 26 | Rollback rehearsal | Pending | Manual, after the Cloudflare setup |

| Check | Command | Result |
| --- | --- | --- |
| Lint | `uv run ruff check`, `uv run ruff format --check` (fresh `.venv`, `uv sync --locked`); `npm run lint` (after a fresh `npm ci`) | Pass |
| Types | `uv run mypy` (38 files); `npm run api:types:check` | Pass |
| Tests | `uv run pytest`: 114 passed; `npm test`: 379 passed in 21 files | Pass |
| Build | `npm run build`, plus the workflow's checks for `/src/` paths, fonts and the old setting | Pass |
| Secret scan | `gitleaks git --log-opts="origin/main..021-serverless-publish"`, `gitleaks dir .` | Pass |
| Public exposure | Manual review of the diff and log: only public hosts, loopback addresses, documentation links and test values; all 13 commits by shb327, one line, no trailers; `.claude/` and `CLAUDE.md` ignored and untracked | Pass |
| Design conformance | Manual review, and an independent read of R1 to R41 and S1 to S9; every difference is recorded in Implementation notes | Pass |

**Findings**

- (follow-up) S9 and R22: `deploy/publish.example.toml` holds the production hosts, as do the golden `_headers` and `website/README.md`. Criterion 15 requires that (the golden file from the example settings must equal R18), so the spec contradicts itself. Record it, or build the golden file from test settings.
- (follow-up) R12: `status` exports with the live commit's catalog and schema, so after a merge that adds a catalog finish or a public field it stops with an export error instead of saying the data differs (`status.py`). With no commit hash from the Pages API it counts from `HEAD` and reads files from the index.
- (follow-up) R11: the last lines print `site_origin` as the production URL. Before going live that is still the coming-soon page; the deployment's own address is not printed (`publish.py`).
- (follow-up) R29: an error outside the expected ones (an S3 `ClientError`, a JSON error) prints a raw traceback that skips the output scrubbing, and in `backup`'s log it has no timestamp (`cli.py`). No known message holds a key.
- (follow-up) Criterion 12's scan of the temporary folder runs after the folder is deleted; check it before cleanup.
- (follow-up) R30: the bucket keeps the newest 30 dumps, which is fewer than 30 days if `backup` also runs by hand.
- (follow-up) R23: a non-JSON error response such as a 503 page is `http`, not `not_found`.
- (follow-up) R19 and rollback: `/assets/*` is immutable, so Pages' HTML fallback for a missing old chunk could be cached under that chunk's name, and rolling back to the deployment that has it would leave those browsers on the error page after one reload.
- (follow-up) The `OutsideOriginError` guard in `website/src/api/client.ts` can't be reached by any test; slugs are refused first. `state_dir` and `backup_dir` are not checked to be outside the repository.
- (follow-up) `deploy.yml` has not run yet; check its first run after the push.
- (pending) Criteria 22, 25 and 26, per the runbooks in `deploy/README.md`. Criterion 25 also confirms that R2 accepts boto3's default upload checksums.
- (checked) Pages keeps `_headers` values as set: `combo.skin`'s coming-soon page sends one `X-Content-Type-Options` and one `Referrer-Policy`, so the smoke test's exact match holds.
