# Combo Skin API

[![api](https://github.com/shb327/combo-skin/actions/workflows/api.yml/badge.svg)](https://github.com/shb327/combo-skin/actions/workflows/api.yml)

The backend for Combo Skin: a FastAPI service on PostgreSQL, with SQLAlchemy 2 (async) and Alembic migrations. It serves health checks, its OpenAPI docs, the knife and glove catalog, admin login, combos (the admin endpoints that enter them and the public endpoints that list them) and combo screenshots, which screenshot workers send and the API stores in S3-compatible object storage (see [`docs/specs/`](../docs/specs)).

## Prerequisites

- [uv](https://docs.astral.sh/uv/) 0.13.6 or newer (older versions are refused). It installs the pinned Python version (see `.python-version`) itself, so the system Python does not matter.
- [Docker](https://docs.docker.com/get-started/) with Compose v2, for PostgreSQL and the full local stack.

## Getting started

From the repository root:

```bash
cp api/.env.example api/.env
docker compose up -d --wait
```

This starts PostgreSQL and the storage service, applies migrations, imports the catalog, creates the two storage buckets, then starts the API on port 8000. Check it with:

```bash
curl http://localhost:8000/health/ready
```

Open http://localhost:8000/docs for the interactive docs. Stop everything with `docker compose down` (add `-v` to delete the database and storage volumes too).

The Compose services, in `compose.services.yaml` (included by `compose.yaml`, which reads `api/.env` for their settings). The API's containers get all of `api/.env`; `db` and `storage` only the values they use:

| Service | What it does |
| --- | --- |
| `db` | PostgreSQL, on `127.0.0.1:54320`, data in the `db-data` volume. It gets only `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` |
| `storage` | [RustFS](https://github.com/rustfs/rustfs), an S3-compatible object store, pinned by digest, on `127.0.0.1:9000`, data in the `storage-data` volume. It gets only its credentials, `STORAGE_ACCESS_KEY_ID` and `STORAGE_SECRET_ACCESS_KEY` from `api/.env` under RustFS's own names |
| `migrate`, `catalog` | One-shot: apply migrations, import the catalog |
| `storage-init` | One-shot: `python -m combo_api.screenshots init`, which creates both buckets and lets anyone read the public one, through the S3 API. Safe to re-run |
| `api` | The API on `127.0.0.1:8000`, once the one-shot services succeeded |

## Running

**In Compose** (repository root): `docker compose up -d --wait` runs the built image. After changing code, rebuild with `docker compose up -d --wait --build`.

**On the host**, for day-to-day work with auto-reload. Start only the database and storage, then run the API from `api/`:

```bash
docker compose up -d --wait db storage storage-init
cd api
uv sync
uv run alembic upgrade head
uv run python -m combo_api.catalog import
uv run uvicorn combo_api.main:app --reload --no-proxy-headers
```

Stop the Compose `api` service first (`docker compose stop api`) if it is running, since both use port 8000.

## Tests

Tests run against a real PostgreSQL: start the Compose database first. They use a separate `<POSTGRES_DB>_test` database, created and migrated automatically, so your local data is never touched. Storage tests use an in-memory store, except `tests/screenshots/test_s3.py`, which runs against the storage service on throwaway buckets it removes again.

```bash
docker compose up -d --wait db storage
cd api
uv run pytest
```

If the database or the storage service is not running, their tests fail rather than skip.

## Lint and type check

From `api/`:

```bash
uv run ruff format .        # format (CI runs ruff format --check .)
uv run ruff check .         # lint
uv run mypy                 # strict type check of src/ and tests/
```

## Migrations

Migrations live in `migrations/versions/` and are numbered `0001`, `0002`, ... From `api/`, with the database running:

```bash
uv run alembic upgrade head                                       # apply all
uv run alembic downgrade -1                                       # roll back one
uv run alembic revision --autogenerate --rev-id 0002 -m "add x"   # create from model changes
uv run alembic check                                              # models match migrations
uv run alembic history                                            # list revisions
```

Models inherit from `combo_api.db.Base`, whose metadata names keys, indexes and constraints consistently. In Compose, the one-shot `migrate` service runs `alembic upgrade head` before the API starts; the API never migrates itself.

## Catalog

The catalog lists every CS2 knife and glove type and every finish each can have, with the game's identifiers (item definition index, paint index and paint kit codename), English names, Doppler and Gamma Doppler phases, rarity, float range and a Steam image URL. Vanilla knives are finishes with paint index 0 and no float range.

It also lists every agent (the game's player characters), for combo screenshots: definition index, codename, English name, team (`ct` or `t`), rarity and a Steam image URL. Agents come from the same source commit as knives and gloves, are identified by their definition index, and need no display order: the API lists Counter-Terrorists first, then Terrorists, each by name.

It is generated from [ByMykel/CSGO-API](https://github.com/ByMykel/CSGO-API), a dataset built from the game's files, used under the MIT licence (see [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md)). Its files live in `src/combo_api/catalog/`:

| File | Contents |
| --- | --- |
| `snapshot.json` | The catalog, generated by `refresh`. Never edit it by hand. Records the source commit and both source files (`skins.json`, `agents.json`). |
| `display_order.json` | Hand-kept order: type slugs per kind, finish slugs per type. |
| `slug_overrides.json` | Slugs for new finishes and types that must not follow the name rule: a finish keyed `<def_index>:<paint_index>`, a type keyed `type:<def_index>`. |

Commands, from `api/`:

```bash
uv run python -m combo_api.catalog refresh --commit <sha>    # rewrite snapshot.json (network)
uv run python -m combo_api.catalog import                   # load snapshot.json into the database
uv run python -m combo_api.catalog export-website           # write website/src/data/catalog.json and agents.json
```

Only `refresh` uses the network. `import` needs the database; `export-website` needs neither. `export-website` writes two files for the website: `catalog.json` (the glove and knife types and finishes) and, beside it, `agents.json` (each agent's definition index, name, team and picture, Counter-Terrorists first, then Terrorists, each by name), which the website loads only with its 3D window. No API route serves agents publicly: `agents.json` is public game data from the same dataset. CI runs `export-website --check` and fails if either file is out of date. In Compose, the one-shot `catalog` service runs `import` after `migrate` and before the API starts.

**Slugs** come from English names: lowercase, apostrophes removed, other runs of punctuation and spaces turned into `-`; type slugs drop a trailing "Knife" or "Gloves" (`bowie`, `broken-fang`), and phases are part of the finish slug (`doppler-phase-2`). Once assigned, a slug never changes: `refresh` keeps the slug of every finish already in the snapshot, and `import` refuses a snapshot that would change or reuse a stored slug. If two new finishes of one type would get the same slug, `refresh` fails and names both; add an override.

**After a game update:**

1. Find the dataset's latest commit on GitHub and run `refresh --commit <full sha>`. It fails without writing anything if the data does not validate.
2. Review the `snapshot.json` diff and what `refresh` printed: the types, finishes and agents retired since the previous snapshot, those back in the game, and the finishes not placed in `display_order.json` yet. Place new finishes in `display_order.json`, or leave them last. Retired ones can stay listed there: they are skipped.
3. Run `export-website`, then `import`, and commit `snapshot.json`, `display_order.json` and both exported files together.

**Retired entries.** A type, finish or agent that leaves the game is not removed from `snapshot.json`: `refresh` keeps it as it was last seen, with `"retired": true` (every entry has the flag). Its slug stays taken, so no later finish can take over its URL, and it comes back with the same slug if the game brings it back. Retired entries are left out of the website export, the type lists and the type pages; the single-finish endpoint still returns them, with `active: false`, and says whether their type is still in the game (`item_type.active`).

`import` is safe to re-run. It never deletes a row or changes a row's id or slug: new types and finishes are inserted, changed fields are updated in place, and retired entries are stored inactive, inserted if needed so their slugs are taken in the database too. It refuses a type or an agent whose codename is stored under another definition index. It writes everything or nothing.

## Admin accounts

Admins log in with a username and password. There is no sign-up and no HTTP route that creates or changes an admin: accounts are managed only with the command below, run by the owner on the server or locally. Admins are never deleted, only disabled.

**Creating the first admin.** On the host, from `api/`, with the database running and migrated:

```bash
uv run python -m combo_api.admins create <username>
```

In Compose, from the repository root, with the stack up:

```bash
docker compose exec api python -m combo_api.admins create <username>
```

The command asks for the password twice at a hidden prompt. It never takes a password as an argument, an option or an environment variable, and refuses to run without an interactive terminal, so a password never ends up in shell history, a process list or a script.

Usernames are 3 to 32 characters: lowercase letters, digits, `.`, `-` and `_`. Login matches them case-insensitively. Passwords follow current NIST guidance: 15 to 256 characters (counted after Unicode NFKC normalisation), any characters including spaces, not on the bundled list of common passwords (see [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md)), and not containing the username. There are no composition rules and no expiry. Passwords are hashed with Argon2id.

The other commands, from `api/` (or through `docker compose exec api python -m combo_api.admins ...`):

```bash
uv run python -m combo_api.admins set-password <username>   # new password; ends all its sessions
uv run python -m combo_api.admins disable <username>        # can no longer log in; ends all its sessions
uv run python -m combo_api.admins enable <username>         # can log in again; old sessions stay ended
uv run python -m combo_api.admins list                      # username, enabled, created, last login, live sessions
```

**Logging in from a client.** The admin dashboard, served from an origin listed in `ADMIN_ORIGINS`, calls the API with credentials included (`fetch(..., {credentials: "include"})`):

1. `POST /admin/login` with `Content-Type: application/json` and `{"username": ..., "password": ...}`. The response sets the session cookie and returns `{"admin": {"username": ...}, "csrf_token": ..., "expires_at": ...}`.
2. Keep `csrf_token` in memory, and send it in the `X-CSRF-Token` header with every `POST`, `PUT`, `PATCH` and `DELETE`. After a page reload, `GET /admin/me` returns it again.
3. `POST /admin/logout` with the `X-CSRF-Token` header ends the session.

From the command line, against the local stack (whose `api/.env` must set `SESSION_COOKIE_SECURE=false` for plain http):

```bash
curl -c cookies.txt -H 'Origin: http://localhost:5174' -H 'Content-Type: application/json' \
  -d '{"username": "<username>", "password": "<password>"}' http://localhost:8000/admin/login
curl -b cookies.txt http://localhost:8000/admin/me
curl -b cookies.txt -X POST -H 'Origin: http://localhost:5174' -H 'X-CSRF-Token: <csrf_token>' \
  http://localhost:8000/admin/logout
```

Typing a password on a command line puts it in shell history; use a throwaway local account for this.

**Sessions** live in PostgreSQL. A session ends after `SESSION_IDLE_MINUTES` without a request, `SESSION_MAX_HOURS` after login, at logout, or as soon as its admin is disabled or gets a new password. Each login starts a new session.

**Protection.** The session cookie is HttpOnly, `SameSite=Strict`, host-only and, unless `SESSION_COOKIE_SECURE=false`, Secure. Writes need the session's CSRF token and an `Origin` listed in `ADMIN_ORIGINS`; only those origins get CORS headers with credentials. Failed logins are limited to 10 per client IP and 20 per username in 15 minutes; over a limit, login returns 429 with `Retry-After`. The client IP is the connecting address, or, when that is a proxy listed in `TRUSTED_PROXIES`, the right-most address in `X-Forwarded-For` that is not a trusted proxy. Uvicorn's own forwarded-header handling is off (`--no-proxy-headers`).

**Public CORS.** The public read routes, those tagged `catalog` or `combos` (the catalog and published combos), answer `GET` requests from any other origin, or none, with `Access-Control-Allow-Origin: *` and never allow credentials, so the website can read them from its own origin. No preflight is answered for them: the website's requests are simple `GET`s. These routes also send `Vary: Origin`, because an origin in `ADMIN_ORIGINS` gets its own CORS headers on the same URLs. A new route tagged `catalog` or `combos` gets the same headers; admin, health and docs routes get none.

**For later routes.** Every admin route depends on `require_admin` from `combo_api.admins.deps` (or the `AdminDep` type) and declares `ADMIN_RESPONSES`. A test fails if a `POST`, `PUT`, `PATCH` or `DELETE` route is added without it. `require_admin` adds `Cache-Control: no-store` to the route's response; a route that returns a `Response` object of its own must set that header itself.

Logins, failed and rate-limited logins, logouts and account changes are logged by the `combo_api.admins` logger, without passwords or tokens.

## Combos

A combo recommends one glove finish and one knife finish from the catalog as a pair. Each combo has:

- **Conditions** for each item (the gloves and the knife): an optional float range, `float_from` and `float_to`, at most 4 decimals and inside the finish's own float range from the catalog; and a list of pattern seeds, 0 to 1000, at most 100, no duplicates, stored in ascending order. An empty list means any pattern. Vanilla knives take neither.
- **A rating** from 0 to 10 with at most 2 decimals, stored exactly (`numeric(4,2)`) and returned as a JSON number, and an optional plain-text **description** of up to 1000 characters.
- **A status**: `draft` when created, `published` (shown on the public endpoints) or `unpublished` (taken down after being published).
- **A screenshot agent**: the agent whose arms hold the knife and gloves in the combo's screenshot, by definition index (`screenshot_agent`), or null for the default agent. A retired agent cannot be chosen, but a combo that already has one keeps it. Admin-only: the public endpoints never mention agents.
- **A version**, which increases with every change to the rating, description, conditions or screenshot agent, and who created and last changed it, and when.

There is one combo per pairing of a glove finish and a knife finish, and a combo's pairing never changes. Combos are identified by a random 12-character `id`; the API never shows catalog ids. In the database they refer to catalog finishes by foreign key, so combos move to another database with a whole-database dump and restore. A retired finish cannot be used for a new combo, but existing combos with one keep working.

**Editing safely.** Updates send every field, `screenshot_agent` included (null for the default), so a client that leaves it out gets 422 instead of resetting it. Updates and removals carry the `version` the admin read; if another admin changed the combo since, the API answers 409 `version_conflict` and changes nothing. Publishing and unpublishing do not change the version. Removal deletes a draft or unpublished combo; a published one must be unpublished first (409 `combo_published`). The removed combo's content is written to the log.

**Batches.** A batch pairs one glove finish with one knife finish name (`doppler-ruby`, `blue-steel`) across knife types. `GET /admin/batches/finishes` lists the names; `GET /admin/batches/candidates` lists every active knife type with that finish, in knife order, with the combo it already has with those gloves. `POST /admin/batches` creates the new combos and changes the rating and description of existing ones in one request, all or nothing. The dashboard computes ratings, batch-wide conditions and each new combo's screenshot agent (batch-wide, or the knife's own); the API stores what it is sent. Existing combos in a batch keep their conditions and screenshot agent.

**Default agent.** Combos without their own screenshot agent use one default agent, Lt. Commander Ricksaw | NSWC SEAL (definition index 5404) until an admin changes it with `PUT /admin/screenshot-settings`. It is one stored setting: changing it changes no combo row, but the combos using it get a new screenshot (see Screenshots).

**Knife order.** Batches follow one shared knife order, editable by any admin with `PUT /admin/knife-order`. It starts as Butterfly, Karambit, M9 Bayonet, Talon, Skeleton, Stiletto, Bayonet, Flip, Nomad, Huntsman, Falchion, Bowie, Classic, Ursus, Kukri, Paracord, Survival, Gut, Shadow Daggers, Navaja. Knife types added by a game update follow in catalog order until placed; retired ones are skipped.

Refused input gets 422 in FastAPI's list format, with `loc` pointing at the field (in a batch, at the item) and a `type` code such as `finish_not_found`, `finish_retired`, `float_outside_finish`, `duplicate_seed`, `agent_not_found` or `agent_retired`. Conflicts get 409 with `{"detail": "<code>"}`. Every change is logged by the `combo_api.combos` logger with the admin's username.

## Screenshots

Every combo, in any status, gets a screenshot made by a **screenshot worker**: a separate program that claims a combo, draws it in the 3D viewer on its screenshot agent's arms, and sends the image back. The API keeps the original and makes watermarked WebP versions from it for the website and the dashboard.

**Storage.** Two buckets, through the S3 API: originals (never public) and public images (readable by anyone at `IMAGE_BASE_URL`). Cloudflare R2 in production; the Compose `storage` service locally. Keys:

| Bucket | Key |
| --- | --- |
| Originals | `combos/<combo id>/<upload id>.png`, kept byte for byte with its SHA-256 recorded; never served |
| Public | `combos/<combo id>/<version id>/<width>.webp`, `Content-Type: image/webp`, `Cache-Control: public, max-age=31536000, immutable` |

Upload and version ids are 12 random characters, new for every upload and every rebuild, so a changed image always has a new URL. Responses build full URLs from `IMAGE_BASE_URL` at request time. Drafts' versions are in the public bucket too, reachable only by a URL with two random ids.

**Workers and tokens.** An admin creates a worker on the dashboard's Screenshots page with a name and gets its token once: `csw_` and 43 base64url characters (256 random bits). The API stores only its SHA-256 digest. Revoking a worker stops its token at once and releases its claims; workers are never deleted. A worker sends `Authorization: Bearer <token>` and may use only the worker routes; admin routes refuse worker tokens and worker routes refuse admin sessions. Worker routes refuse any request with an `Origin` header (403 `origin_not_allowed`), so no browser page can use them, also when the body is malformed; they send no CORS headers and `Cache-Control: no-store`. A refused token is logged with the client IP, never the token.

**Worker routes.**

| Route | Meaning |
| --- | --- |
| `GET /worker/me` | `{"name"}` of the token's worker |
| `POST /worker/jobs/claim` | Claim one due combo for 5 minutes: 200 with a job, 204 when nothing is due |
| `PUT /worker/jobs/{job}/screenshot` | The raw PNG, `Content-Type: image/png`, exactly 1920 by 1080, 8-bit RGB or RGBA, at most 16 MiB. 201 `{"combo_id", "screenshot"}` once stored |
| `POST /worker/jobs/{job}/fail` | `{"reason": "render_failed" \| "asset_missing" \| "timeout", "detail": "<at most 300 characters>"}`; counts an attempt. The detail is logged, not stored. 204 |
| `POST /worker/jobs/{job}/release` | `{"reason": "shutting_down" \| "gpu_unavailable"}`; frees the combo without counting. 204 |

Refusals: 401 `not_authenticated`; 404 `job_not_found` (unknown job, another worker's, or one whose combo was claimed again since); 409 `claim_expired` (lease over or claim closed) or `inputs_changed` (the combo changed: nothing is stored and it is due again); 413 `too_large`; 415 `unsupported_media_type`; 422 `not_png`, `wrong_size` or `bad_pixel_format`. The PNG's signature and header are checked before any pixel is decoded.

A job holds what the viewer needs and nothing else (no rating, description, status or admin names):

```json
{
  "job_id": "w8d2k0q5n1zc", "lease_expires_at": "2026-11-05T12:05:00Z", "combo_id": "k3v9x0m2q7ab",
  "image": {"width": 1920, "height": 1080, "type": "image/png"},
  "glove": {"def_index": 5034, "codename": "specialist_gloves", "paint_index": 10064, "paint_codename": "...",
            "name": "Specialist Gloves | Mogul", "float": 0.06, "seed": null,
            "float_from": null, "float_to": null, "seeds": []},
  "knife": {"def_index": 507, "codename": "weapon_knife_karambit", "paint_index": 419, "paint_codename": "...",
            "name": "Karambit | Doppler (Phase 2)", "float": 0.0, "seed": 387,
            "float_from": 0.0, "float_to": 0.01, "seeds": [387, 512]},
  "agent": {"def_index": 5404, "codename": "customplayer_ctm_st6_varianti", "name": "...", "team": "ct", "default": true},
  "render_revision": 1
}
```

Each item is drawn with the start of the combo's float range (else the finish's minimum, null for Vanilla) and its lowest seed (else null, the viewer's default); the full conditions come too. The agent is the combo's own or the default (`default: true`).

**The queue.** A combo's render inputs are both items' definition and paint indexes with the float and seed they are drawn with, the effective agent, and `RENDER_REVISION` (`screenshots/inputs.py`, raised when the viewer changes how combos look). A combo is due when it has no screenshot, when its render inputs differ from those of its screenshot, or when an admin asked for a new one (`POST /admin/screenshots/request`) after it was made. So changing a float range, the lowest seed or the agent makes a combo due; changing its rating or description does not; changing the default agent makes due every combo without its own agent, and `PUT /admin/screenshot-settings` answers how many were done before the change and are due after it (`requeued`). Claims take published combos first, then drafts and unpublished ones, each the longest waiting first, with a row lock (`SKIP LOCKED`), so two claims never get the same combo. A failure report or an expired lease counts a failed attempt; the combo then waits 1 minute, then 10; after 3 failed attempts for the same render inputs it is `failed` until they change or an admin asks again. The current screenshot stays shown until a new one is stored.

States in admin responses (`screenshot_state`): `none` (no screenshot yet), `waiting` (an older one is shown, a new one is due), `done`, `failed`; with `rendering` while a worker holds a live claim, the last failure `reason`, the counted `attempts`, and `made_at`, when the current screenshot's render was claimed. A request for a new screenshot made while a worker is rendering is therefore not answered by that render. A revoked worker's claim or answer is refused even if it was authenticated just before the revoke.

**Storing.** The upload is read up to 16 MiB, checked, decoded fully (Pillow's decompression-bomb guard stays on), flattened onto black, and made into WebP versions 640, 1280 and 1920 wide at quality 82, from pixels only, so no metadata or colour profile is copied. One image is processed at a time. The original and versions are written first; one transaction then points the combo at them; the old objects are deleted last. Removing a combo deletes its objects. A failed delete is logged (`object delete failed`) and left for `sweep`.

**Watermark.** The Combo Skin logo, all white at 60% opacity with no shadow or outline, bottom-right. At 1920 wide it is 220 px wide, 40 px from the right and 32 px from the bottom (measured to the logo image's box); the 1280 and 640 versions scale all three with the width. Only the logo's alpha channel is resized (Lanczos) and a white layer is drawn through it, so transparent pixels' colour cannot darken the edges. The logo file, `screenshots/logo-white.png` (1044 by 364, RGBA), is `website/src/assets/logo.svg` with both its colours set to `#FFFFFF`, rendered at twice its size. Changing the mark means raising `WATERMARK_REVISION` (`screenshots/images.py`) and running `rebuild`; revision 2 is the logo, revision 1 was a text mark.

**Commands**, from `api/` or in the image (`docker compose run --rm storage-init python -m combo_api.screenshots ...`):

```bash
uv run python -m combo_api.screenshots init            # create both buckets, the public one readable
uv run python -m combo_api.screenshots init --check    # only check both exist (production); exit 1 if not
uv run python -m combo_api.screenshots rebuild         # remake every public version from its original
uv run python -m combo_api.screenshots sweep --dry-run # list objects under combos/ older than a day that no row refers to
uv run python -m combo_api.screenshots sweep           # delete them
```

`init` sets the bucket policy through the S3 API, so it works the same on any S3 service; it refuses an originals bucket with a policy. `rebuild` gives every screenshot a new version id with the current watermark and deletes its old versions after each commit; originals are untouched, and one that is missing or cannot be decoded is reported and skipped (exit 1). `sweep` only looks at keys under `combos/`. Every screenshot event is logged by the `combo_api.screenshots` logger; tokens and storage credentials never are.

## OpenAPI snapshot

`openapi.json` is a committed copy of the API schema, used to generate TypeScript types for the website and admin. After changing any route, regenerate it from `api/`:

```bash
uv run python -m combo_api.openapi
```

CI runs the same command with `--check` and fails if the committed file is out of date. Neither needs a database or an `.env` file. Then regenerate both apps' types in the same change: `npm run api:types` in `admin/` and in `website/`.

## Configuration

Settings come from environment variables. For local use they are read from `api/.env`, copied from [`.env.example`](.env.example), which holds placeholders only. Never commit `api/.env`.

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `POSTGRES_HOST` | yes | | Database host. Compose sets it to `db` inside the stack. |
| `POSTGRES_PORT` | no | `5432` | Database port. The example uses `54320`, the port Compose publishes on the host; inside the stack Compose sets `5432`. |
| `POSTGRES_USER` | yes | | Database user. |
| `POSTGRES_PASSWORD` | yes | | Database password. |
| `POSTGRES_DB` | yes | | Database name. Tests append `_test`. |
| `LOG_LEVEL` | no | `info` | `debug`, `info`, `warning` or `error`. Applies to the API's logs and to uvicorn's error and access logs. |
| `DOCS_ENABLED` | no | `true` | When `false`, `/docs` and `/openapi.json` return 404. |
| `ADMIN_ORIGINS` | no | empty | Comma-separated exact origins (`scheme://host[:port]`) allowed to send logged-in requests and writes, such as the admin dashboard. No wildcards. The example lists the dashboard's local origin. |
| `SESSION_COOKIE_SECURE` | no | `true` | When `false`, the session cookie is sent over plain http, and the API logs a warning at startup. Local use only; the example sets `false`. |
| `SESSION_IDLE_MINUTES` | no | `60` | A session ends after this many minutes without a request. 5 to 1440, and not more than `SESSION_MAX_HOURS`. |
| `SESSION_MAX_HOURS` | no | `12` | A session ends this many hours after login. 1 to 24. |
| `TRUSTED_PROXIES` | no | empty | Comma-separated IPs or CIDR ranges of reverse proxies whose `X-Forwarded-For` header is used for the client IP. |
| `STORAGE_ENDPOINT_URL` | yes | | The S3 endpoint, an origin. The example uses the storage service's published port; inside the stack Compose sets `http://storage:9000`. |
| `STORAGE_REGION` | no | `auto` | The S3 region; `auto`, as R2 expects. |
| `STORAGE_ACCESS_KEY_ID` | yes | | Storage access key. |
| `STORAGE_SECRET_ACCESS_KEY` | yes | | Storage secret. Never logged. |
| `STORAGE_ORIGINALS_BUCKET` | yes | | The bucket for originals; never public. |
| `STORAGE_PUBLIC_BUCKET` | yes | | The bucket for public versions. Must differ from the originals bucket. |
| `IMAGE_BASE_URL` | yes | | The public bucket's base URL; image URLs are this plus the key. `https`, or plain http on `localhost`; an optional path (path-style locally), no query. |

A missing or invalid setting stops startup with an error that names the variable but never shows its value.

## Endpoints

| Route | Meaning |
| --- | --- |
| `GET /health/live` | 200 while the process is serving. Never touches the database. |
| `GET /health/ready` | 200 when the database answers and is at the latest migration, 503 otherwise. |
| `GET /knives`, `GET /gloves` | Active knife or glove types, in display order, with their finish counts. |
| `GET /knives/{type}`, `GET /gloves/{type}` | One active type with its active finishes, in display order. 404 if unknown. |
| `GET /knives/{type}/{finish}`, `GET /gloves/{type}/{finish}` | One finish, including a retired one (`active: false`); `item_type.active` says whether its type is still in the game. 404 if unknown. |
| `POST /admin/login` | Log in; sets the session cookie. 401, 403, 415, 422 or 429 otherwise. |
| `GET /admin/me` | The logged-in admin and the session's CSRF token, or 401. |
| `POST /admin/logout` | Ends the session and clears the cookie; 204. |
| `GET /gloves/{type}/{finish}/combos`, `GET /knives/{type}/{finish}/combos` | The finish's published combos, highest rating first, each with its `screenshot` (`{width, height, images: [{url, width, height, type}]}`, narrowest first) or null. Each item (`glove`, `knife`) carries its slugs, names, picture, float range and conditions, and the game's `def_index` (its type) and `paint_index` (its finish, 0 for Vanilla), which the website's 3D viewer uses; admin responses carry the same items. `[]` without combos, 404 for an unknown finish. |
| `GET /combo-counts` | How many published combos each finish has, as `{"gloves": {type: {finish: n}}, "knives": {...}}`; finishes without any are left out. Counted exactly as the lists above. |
| `GET /admin/combos` | Combos in any status. Filters: `glove_type`, `glove_finish`, `knife_type`, `knife_finish`, `status`; `sort` (`rating` or `updated`), `limit` (up to 500), `offset`. |
| `POST /admin/combos` | Create a draft combo. 409 `combo_exists` if the pairing has one. |
| `GET`, `PUT`, `DELETE /admin/combos/{id}` | Read, update (with `version`) or remove (`?version=`) one combo. |
| `POST /admin/combos/publish`, `POST /admin/combos/unpublish` | Publish `ids` or `all_drafts`; unpublish `ids`. All or nothing. |
| `GET /admin/batches/finishes`, `GET /admin/batches/candidates`, `POST /admin/batches` | Batch finish names, candidates, and saving a batch. |
| `GET`, `PUT /admin/knife-order` | Read or replace the knife order. |
| `GET /admin/agents` | Agents still in the game: Counter-Terrorists first, then Terrorists, each by name. |
| `GET`, `PUT /admin/screenshot-settings` | The default screenshot agent and how many combos use it (`using_default`); replace it with `{"default_agent": <definition index>}`, which also answers `requeued`, the done combos that get a new screenshot. 503 `default_agent_missing` while the default agent is not in the catalog (before the first import). |
| `POST /admin/screenshots/request` | Ask for new screenshots of up to 500 combos (`{"ids": [...]}`); clears their failed attempts. `{"changed": n}` |
| `GET`, `POST /admin/workers` | List screenshot workers; create one with `{"name"}` (201 with its token, once; 409 `worker_exists`) |
| `POST /admin/workers/{id}/revoke` | Revoke a worker; 404 `worker_not_found` |
| `GET /worker/me`, `POST /worker/jobs/claim`, `PUT /worker/jobs/{job}/screenshot`, `POST /worker/jobs/{job}/fail`, `POST /worker/jobs/{job}/release` | Worker routes, with a worker token (see Screenshots) |
| `GET /docs`, `GET /openapi.json` | Interactive docs and the schema, unless `DOCS_ENABLED=false`. |

## Layout

| Path | Contents |
| --- | --- |
| `src/combo_api/main.py` | App factory and docs routes |
| `src/combo_api/settings.py` | Settings |
| `src/combo_api/db.py` | Engine, per-request sessions, model base |
| `src/combo_api/health.py` | Health endpoints |
| `src/combo_api/openapi.py` | Snapshot export and check |
| `src/combo_api/catalog/` | Catalog data (knives, gloves, agents), commands, tables, import and endpoints |
| `src/combo_api/combos/` | Combo, knife order and screenshot settings tables, admin and public endpoints, catalog checks, batches, agents |
| `src/combo_api/admins/` | Admin tables, accounts command, passwords, sessions, rate limits, `require_admin` and login endpoints |
| `src/combo_api/screenshots/` | Storage (S3 and in memory), screenshot tables, workers and `require_worker`, render inputs and the queue, uploads, images and the watermark logo, admin and worker endpoints, commands |
| `migrations/` | Alembic environment and revisions |
| `tests/` | pytest suite |
| `Dockerfile` | Production image: non-root, runtime dependencies only |
