# 002: API foundation

**Status:** Draft
<!-- Lifecycle: Draft → Approved → Implemented → Audited -->

**Section:** api
**Branch:** 002-api-foundation

## Summary

Create the `api/` section: a FastAPI service with PostgreSQL, Alembic migrations, liveness and readiness endpoints, served OpenAPI docs, tests against a real database, a small non-root Docker image, a local Docker Compose stack, and a CI workflow. It adds no product features. It is the base that the catalog (003), admin login (004) and combos (005) specs build on, so they can start with endpoints and tables instead of tooling.

## Goals and non-goals

**Goals**

- An `api/` uv project with a uv-managed, pinned Python version, ruff, mypy and pytest.
- Settings read from environment variables, documented in a committed `api/.env.example` with placeholders only.
- An async PostgreSQL connection and Alembic, with a baseline migration that later specs build on.
- `GET /health/live` and `GET /health/ready` (database reachable and migrated).
- OpenAPI served by the app, plus a committed `api/openapi.json` snapshot that CI keeps in sync.
- A Docker image for the API and a root `compose.yaml` that starts PostgreSQL, migrations and the API with one command.
- Tests that run against a real PostgreSQL, locally and in CI.
- A GitHub Actions workflow for `api/`, following the conventions of spec 001.
- `api/README.md` explaining how to run, test and migrate.

**Non-goals**

- Catalog data, admin accounts or login, combos, image storage, or any table other than Alembic's own version table.
- CORS, rate limiting, authentication middleware, or any route other than health and docs.
- The `admin/` dashboard, the `deploy/` setup, production Compose files, image publishing or a registry.
- Any change to `website/`.
- Hot reload inside the container. Day-to-day API work runs on the host with `uv run`; the container runs the built image.
- Automated dependency or image digest updates.

## Context

- There is no `api/` directory, no Python code, and no Docker or Compose file anywhere in the repo.
- There is no `.github/` directory. Spec 001 (Draft) defines the CI conventions this spec follows: one workflow per section in `.github/workflows/<section>.yml`, `push` and `pull_request` triggers with no filters, `permissions: contents: read`, actions pinned to full commit SHAs, no secrets, one concurrent run per ref, and a status badge in the root and section READMEs.
- `README.md` (root) lists only `website/` in its project table and says a Python backend is planned in `api/`, an admin dashboard in `admin/` and deployment config in `deploy/`.
- `.gitignore` (root) ignores editor files, `node_modules/` and local assistant configuration. It does not ignore `.env` files; `website/.gitignore` ignores `*.env` for the website only.
- `docs/specs/README.md` and `docs/specs/_template.md` define the spec process.
- Development machines may have an old system Python. The API must not depend on it: uv installs and pins the interpreter.
- Docker with Compose v2 (`docker compose`, including `--wait`) is available locally.
- Stack decided before this spec: FastAPI, PostgreSQL, SQLAlchemy 2, Alembic, uv, ruff, pytest, settings from environment variables.

## Requirements

- R1. `api/` is a uv project with a committed `uv.lock` and `.python-version`. A fresh clone installs with `uv sync --locked` using a uv-managed Python 3.14, whatever the system Python is.
- R2. Lint (`ruff check`), format check (`ruff format --check`), type check (`mypy`, strict) and tests (`pytest`) each run with one `uv run` command from `api/` and pass.
- R3. The app reads its settings from environment variables, with an optional `api/.env` file for local use. A missing or invalid required setting stops startup with an error that names the variable and never prints its value.
- R4. `api/.env.example` lists every setting the app reads, with placeholder values only. Copied to `api/.env` unchanged, it is enough to start the local stack.
- R5. The app connects to PostgreSQL through async SQLAlchemy 2 sessions, opened per request and disposed on shutdown.
- R6. Alembic manages the schema. The repo has exactly one migration, a baseline with no tables, which later specs chain from. Migrations upgrade and downgrade cleanly, and model metadata never drifts from them.
- R7. `GET /health/live` returns 200 whenever the process is serving, without touching the database.
- R8. `GET /health/ready` returns 200 when the database answers and is at the latest migration, and 503 otherwise, within a bounded time.
- R9. The app serves its OpenAPI schema at `/openapi.json` and interactive docs at `/docs`, both of which a setting can turn off.
- R10. `api/openapi.json` is a committed snapshot of the schema. One command regenerates it, the same command with `--check` fails when it is stale, and neither needs a database or an `.env` file.
- R11. Every operation in the schema has a unique, stable `operationId` suitable for generating TypeScript client names.
- R12. `api/Dockerfile` builds a small image that runs the API as a non-root user, with no dev dependencies, no uv and no `.env` file inside.
- R13. From a fresh clone, after copying `api/.env.example` to `api/.env`, `docker compose up` in the repo root starts PostgreSQL, applies migrations, then starts the API.
- R14. Tests run against a real PostgreSQL: the Compose database locally, a service container in CI. If the database is unreachable, the database tests fail; they are never skipped.
- R15. A GitHub Actions workflow `api` runs lint, format check, type check, tests, the OpenAPI snapshot check, the image build and a Compose smoke test on every push and pull request.
- R16. `api/README.md` explains prerequisites, setup, running (Compose and host), tests, lint, type check, migrations (apply, create, roll back), the OpenAPI snapshot, and the settings.
- R17. The root `README.md` lists `api/`, shows the one-command local start, and links to `api/README.md`.

## Design

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| Python version | 3.14, in `api/.python-version`; `requires-python = ">=3.14,<3.15"` | 3.15: newly released, and binary wheels for database drivers lag. 3.13: no reason to start a new project a version behind. System Python: too old and not under the project's control. |
| Package layout | `src` layout: `api/src/combo_api/`, tests in `api/tests/`, migrations in `api/migrations/` | Flat `api/app/`: the `src` layout keeps tests running against the installed package, not the working directory. |
| Dependency groups | Runtime dependencies in `[project]`; ruff, mypy, pytest and test helpers in the `dev` dependency group | `requirements*.txt`: uv's lockfile and groups replace them. |
| Type checker | mypy in strict mode, with the pydantic plugin, over `src/` and `tests/` | pyright: also good, but mypy has first-party plugins for pydantic and works with SQLAlchemy 2's typed `Mapped` columns. ty: still pre-release. |
| Ruff rules | Default formatter; lint rules `E`, `F`, `W`, `I`, `B`, `UP`, `SIM`, `ASYNC`, `S`, `RUF`, with `S101` (assert) allowed in tests | Ruff defaults only: misses async and security checks that matter for a web service. `ALL`: too noisy for the value. |
| Database access | Async SQLAlchemy 2 (`AsyncEngine`, `AsyncSession`) with the psycopg 3 driver | Sync sessions: simpler, but the owner chose async for the whole API. asyncpg: async-only, so Alembic would need a second driver; psycopg 3 serves both. |
| Engine lifecycle | Engine created at app startup (lifespan) from settings, `pool_pre_ping` on, disposed at shutdown; a FastAPI dependency yields one `AsyncSession` per request | Module-level engine: reads settings at import time, which breaks the OpenAPI export and tests that need a different database. |
| Settings | pydantic-settings, no prefix; database settings as separate `POSTGRES_*` variables; password typed as a secret so it never appears in `repr` or logs | One `DATABASE_URL`: the same file then could not also configure the PostgreSQL container, which reads `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB`. |
| Env files | One committed `api/.env.example`; `api/.env` is gitignored; Compose passes `api/.env` to both the database and the API containers and overrides only `POSTGRES_HOST` for the API | A root `.env` for Compose plus `api/.env` for the host: two files with the same values that drift apart. |
| Migrations | Alembic with an async-aware `env.py` on the same psycopg 3 driver; sequential revision IDs (`0001`, `0002`, ...) with file names `NNNN_slug.py`; a SQLAlchemy naming convention for keys, indexes and constraints set on the shared metadata | Random revision hashes: harder to read in review. No naming convention: auto-generated constraint names differ between databases and break later downgrades. |
| Baseline migration | `0001_baseline`: no tables, empty `upgrade` and `downgrade`; it only creates Alembic's version table | A placeholder table: schema that nobody needs. No migration at all: readiness and tests could not check "at head". |
| Running migrations | A one-shot `migrate` Compose service (same image, `alembic upgrade head`); the API starts only after it succeeds. The API never migrates on its own startup | Migrating in the API's entrypoint: races when several API containers start, and hides failures. Production migration is left to `deploy/`. |
| API versioning | None. No `/v1`-style prefix now or in later specs; routes live at plain paths such as `/health/live`. The website and admin in this repo are the only clients and regenerate their types from the snapshot, so a breaking change is fixed in the same pull request | A `/v1` prefix: only pays off with outside clients that upgrade on their own schedule, and this API has none. |
| Health routes | `GET /health/live` and `GET /health/ready` | `/healthz` and `/readyz`: fine, but less self-explanatory in the docs. One `/health`: cannot tell "process up" from "can serve traffic". |
| Readiness checks | `SELECT 1` and a comparison of the database's Alembic revision with the code's head revision, together bounded by a 2-second timeout | Database ping only: the API would report ready against an unmigrated schema. No timeout: a hung database hangs the probe. |
| Server | Uvicorn, one process, port 8000 inside the container, behind whatever `deploy/` chooses | Gunicorn with Uvicorn workers: process management belongs to the deployment, and one process is enough locally. |
| OpenAPI docs | `/openapi.json` and Swagger UI at `/docs`; ReDoc off; `DOCS_ENABLED` setting (default `true`, for local use) turns both off. Production runs with docs off; the `deploy/` spec sets `DOCS_ENABLED=false` | Docs public in production: they would hand anyone a full map of the API, including admin routes, and nothing needs them there because frontend types come from the committed snapshot. |
| OpenAPI snapshot | `uv run python -m combo_api.openapi` writes `api/openapi.json` (sorted keys, two-space indent, trailing newline); `--check` exits 1 if the file differs | Generating types from a running server: frontend builds would need the API and a database running. |
| Operation IDs | Each route's `operationId` is its Python function name; a test enforces uniqueness | FastAPI's default IDs (`name_path_method`): long and unstable, and they produce awkward TypeScript names. |
| API metadata | Title "Combo Skin API"; version from the package version in `pyproject.toml` | A hard-coded version string: drifts from the package. |
| Tests | pytest with the AnyIO plugin for async tests; httpx `AsyncClient` over the ASGI app, no network server | pytest-asyncio: an extra dependency when AnyIO already ships with FastAPI. A live server: slower and adds ports to manage. |
| Test database | A separate database named `<POSTGRES_DB>_test` on the same server, created by the test session if missing and migrated to head; each test runs in a transaction that is rolled back | testcontainers: needs Docker access from the test process and is slower; the Compose database is already running. Sharing the dev database: tests would wipe local data. |
| Docker image | Multi-stage `api/Dockerfile`: uv (copied from the official uv image) builds a virtualenv with `uv sync --locked --no-dev`; the runtime stage on `python:3.14-slim` copies only the virtualenv, source, `alembic.ini` and `migrations/`; fixed non-root UID and GID; `HEALTHCHECK` on `/health/live` using Python's standard library | Alpine: musl breaks binary wheels and makes builds slow. Distroless: no shell, harder to debug locally for little size gain. Shipping uv in the runtime image: not needed to run. |
| Image pinning | Every `FROM` and every Compose and CI service image pinned by tag and `sha256` digest | Tags only: a re-tagged image changes what runs without a commit, the same reason spec 001 pins actions to SHAs. |
| Compose location | Root `compose.yaml`, project name `combo-skin`, for local development only. `website` and `admin` services are added there by later specs; `deploy/` keeps its own production files | `api/compose.yaml`: each section would bring its own stack and they could not run together. `deploy/`: mixes local and production config. |
| Compose services | `db` (PostgreSQL 18, named volume, `pg_isready` health check), `migrate` (one-shot), `api` (health-checked) | Running the API from a bind-mounted source with reload: see non-goals; host `uv run` covers it. |
| Published ports | API on 8000 and PostgreSQL on 5432, both bound to the host's loopback interface only | All interfaces: exposes a database with a placeholder password to the local network. Not publishing PostgreSQL: host-run tests and tools could not reach it. |
| PostgreSQL version | 18, in Compose and CI | 17: no reason to start on an older major version. |
| CI workflow | `.github/workflows/api.yml`, name `api`; triggers, permissions, SHA pinning and concurrency as in spec 001; uv installed by the official setup-uv action at a pinned uv version, with its cache keyed on `api/uv.lock` | A repo-wide workflow: see spec 001. Path filters: see spec 001. |
| CI jobs | `check`: sync, format check, lint, type check, OpenAPI snapshot check, tests against a PostgreSQL 18 service container. `docker`: build the image, start the Compose stack from `api/.env.example`, wait for health, request `/health/ready`, tear down | One job: the Docker build would wait for tests it does not depend on. No Compose smoke test: the image could build and still fail to start. |
| CI configuration | The workflow sets the same placeholder values as `api/.env.example` in plain `env:`; no secrets | Repository secrets: CI must not depend on private configuration. |
| Badges | `api` workflow badge in the first five lines of `README.md` and `api/README.md` | Root only: same reasoning as spec 001. |
| Ignored files | `api/.gitignore` ignores `.env`, `.venv/`, and tool caches; `api/.dockerignore` excludes the same plus `tests/` and `.git` | Relying on the root `.gitignore`: it does not cover `.env` files today. |

## API / data model

**Settings** (environment variables, all listed in `api/.env.example`):

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `POSTGRES_HOST` | yes | none | Database host. Compose sets it to the `db` service for the API container. |
| `POSTGRES_PORT` | no | `5432` | Database port. |
| `POSTGRES_USER` | yes | none | Database user. |
| `POSTGRES_PASSWORD` | yes | none | Database password. Placeholder only in the example file. |
| `POSTGRES_DB` | yes | none | Database name. Tests use this name with a `_test` suffix. |
| `LOG_LEVEL` | no | `info` | One of `debug`, `info`, `warning`, `error`. |
| `DOCS_ENABLED` | no | `true` | When `false`, `/docs` and `/openapi.json` return 404. |

**Endpoints:**

`GET /health/live` → `200`

```json
{"status": "ok"}
```

`GET /health/ready` → `200` when every check passes:

```json
{"status": "ok", "checks": {"database": "ok", "migrations": "ok"}}
```

→ `503` otherwise. `database` is `ok` or `unavailable`; `migrations` is `ok`, `pending` (database reachable but not at the head revision) or `unknown` (database unreachable). Example:

```json
{"status": "unavailable", "checks": {"database": "unavailable", "migrations": "unknown"}}
```

Both are tagged `health` in the schema, with operation IDs `health_live` and `health_ready`.

`GET /openapi.json` (OpenAPI 3.1) and `GET /docs` (Swagger UI), unless `DOCS_ENABLED` is `false`.

**Schema:** no application tables. Migration `0001_baseline` creates only Alembic's version table.

**Layout** (paths under `api/`):

| Path | Contents |
| --- | --- |
| `pyproject.toml`, `uv.lock`, `.python-version` | Project, locked dependencies, Python version; ruff, mypy and pytest configuration |
| `.env.example` | Placeholder settings |
| `Dockerfile`, `.dockerignore`, `.gitignore` | Image build and ignore rules |
| `alembic.ini`, `migrations/` | Alembic configuration, `env.py`, revision template, `versions/0001_baseline.py` |
| `openapi.json` | Committed OpenAPI snapshot |
| `src/combo_api/` | `main.py` (app factory), `settings.py`, `db.py` (engine, session dependency, metadata with naming convention), `health.py`, `openapi.py` (snapshot export and check) |
| `tests/` | `conftest.py` (test database, client) and tests per acceptance criterion |
| `README.md` | Section documentation |

At the repo root: `compose.yaml` and `.github/workflows/api.yml`.

## Security

- S1. The workflow has read-only access to repository contents (`permissions: contents: read`) and no other permissions.
- S2. The workflow uses no repository or organisation secrets and does not need any to pass.
- S3. The workflow runs on `pull_request`, not `pull_request_target`.
- S4. Every third-party action is pinned to a full commit SHA, and every container image (Dockerfile, Compose, CI services) is pinned by digest.
- S5. `api/.env` is gitignored and excluded from the Docker build context. `api/.env.example`, the workflow and `compose.yaml` contain placeholder values only, and `compose.yaml` holds no credentials of its own.
- S6. The API container runs as a non-root user.
- S7. The database password never appears in logs, error messages, `repr` output or HTTP responses.
- S8. Health responses contain only the status values defined above: no error messages, hostnames, versions or stack traces.
- S9. Compose publishes ports on the host's loopback interface only.
- S10. Dependencies are installed from `uv.lock` with `--locked`, locally, in the image and in CI.

## Acceptance criteria

1. On a fresh clone, `cd api && uv sync --locked` exits 0 and `uv run python --version` prints `Python 3.14.x`, on a machine whose system Python is older.
2. In `api/`, `uv run ruff format --check .` and `uv run ruff check .` exit 0.
3. In `api/`, `uv run mypy` exits 0, and `pyproject.toml` sets mypy `strict = true` for `src` and `tests`.
4. With the Compose `db` service running and `api/.env` copied from `api/.env.example`, `cd api && uv run pytest` exits 0 and reports no skipped tests.
5. With the `db` service stopped (`docker compose stop db`), `cd api && uv run pytest` exits non-zero and reports no skipped tests.
6. A test removes each required setting in turn and checks that startup fails with an error naming that variable; another test checks that the configured password does not appear in the settings' `repr` or in the startup error output.
7. A test checks that the variables in `api/.env.example` are exactly the settings the app reads.
8. A test checks that `GET /health/live` returns 200 with body `{"status": "ok"}`, including when the database is unreachable.
9. Tests check `GET /health/ready`: 200 with all checks `ok` on a migrated database; 503 with `migrations: pending` on a database downgraded to base; 503 with `database: unavailable` and `migrations: unknown`, returned in under 5 seconds, when the configured database port has nothing listening.
10. A test upgrades the test database to head, downgrades to base, and upgrades to head again without errors, and `cd api && uv run alembic check` reports no new upgrade operations.
11. `cd api && uv run alembic history` lists exactly one revision, `0001`, with no down revision.
12. Tests check that `/openapi.json` returns an OpenAPI 3.1 document titled "Combo Skin API" with both health paths, that `/docs` returns HTML, and that both return 404 when `DOCS_ENABLED=false`.
13. A test checks that every `operationId` in the schema is unique and equals the route function's name.
14. With no `api/.env` and no database running, `cd api && uv run python -m combo_api.openapi --check` exits 0 on the branch. After adding any route without regenerating, it exits 1; regenerating and re-running `--check` exits 0 again.
15. From the repo root, `docker build -t combo-skin-api api` exits 0; `docker run --rm --entrypoint id combo-skin-api -u` prints a non-zero UID; the image is under 250 MB (`docker image inspect combo-skin-api --format '{{.Size}}'`); `docker run --rm --entrypoint sh combo-skin-api -c 'test ! -e .env && ! command -v uv'` exits 0.
16. Every `FROM` line in `api/Dockerfile` and every `image:` in `compose.yaml` and `.github/workflows/api.yml` carries an `@sha256:` digest.
17. From a fresh clone, `cp api/.env.example api/.env && docker compose up -d --wait` exits 0, `migrate` exits 0, `GET /health/ready` on the API's local port returns 200 with all checks `ok`, and `docker compose down -v` removes the stack.
18. Without `api/.env`, `docker compose up` fails with an error naming the missing file.
19. `docker compose config` shows every published port bound to the loopback interface.
20. `.github/workflows/api.yml` passes `actionlint`, triggers on `push` and `pull_request` with no filters, does not use `pull_request_target`, sets `permissions: contents: read` only, pins every `uses:` to a 40-character SHA (the check from spec 001 criterion 4 prints nothing), and contains no `secrets.` reference.
21. The workflow runs the commands of criteria 2, 3, 4 and 14 against a PostgreSQL 18 service container, builds the image, runs the Compose smoke test of criterion 17, and cancels superseded runs for the same ref.
22. After the branch is pushed, the `api` workflow run for its latest commit succeeds on GitHub.
23. `api/README.md` has sections for prerequisites, getting started, running (Compose and host), tests, lint and type check, migrations, OpenAPI snapshot, and configuration; following its getting-started steps literally on a fresh clone brings the stack up as in criterion 17.
24. The `api` badge, using `https://github.com/shb327/combo-skin/actions/workflows/api.yml/badge.svg` and linking to `https://github.com/shb327/combo-skin/actions/workflows/api.yml`, appears in the first five lines of `README.md` and `api/README.md`; the root README lists `api/` in its project table and links to `api/README.md`.
25. The only URLs in the changed files point to `github.com/shb327/combo-skin`, public documentation, or the API's local address, and `gitleaks dir . --no-banner --redact` reports no findings.

## Test plan

| Criterion | How it is checked |
| --- | --- |
| 1 | Fresh clone into a temporary directory, then the commands in criterion 1 |
| 2, 3 | The commands in the criteria |
| 4, 5 | The commands in the criteria; read the pytest summary line |
| 6, 7, 8, 9 | pytest: settings, env example and health tests |
| 10 | pytest: migration round-trip test; `uv run alembic check` |
| 11 | `uv run alembic history` |
| 12, 13 | pytest: OpenAPI tests |
| 14 | The command in criterion 14; manual: add a dummy route, run `--check`, regenerate, run `--check`, discard the change |
| 15 | The commands in criterion 15 |
| 16 | `grep -nE '^FROM\|image:' api/Dockerfile compose.yaml .github/workflows/api.yml \| grep -v '@sha256:'` prints nothing |
| 17 | The commands in criterion 17; `docker compose ps -a` shows `migrate` exited with code 0 |
| 18 | Move `api/.env` aside, run `docker compose up`, read the error |
| 19 | `docker compose config`, read every `ports` entry |
| 20 | `actionlint .github/workflows/api.yml`; the grep checks from spec 001 criteria 4 and 5; `grep -n pull_request_target .github/workflows/api.yml` prints nothing; read triggers and permissions |
| 21 | Read the workflow |
| 22 | The workflow run page for the branch's latest commit (checked after the owner pushes) |
| 23 | Read the README headings; manual: fresh clone, follow the steps |
| 24 | `head -5 README.md api/README.md`; read the project table |
| 25 | `grep -rnoE 'https?://[^ )>"]+' README.md api compose.yaml .github/workflows/api.yml --exclude-dir=.venv`; `gitleaks dir . --no-banner --redact` |

Section commands, run in `api/` with the Compose database up:

```bash
uv sync --locked
uv run ruff format --check .
uv run ruff check .
uv run mypy
uv run pytest
uv run python -m combo_api.openapi --check
```

Stack commands, run in the repo root:

```bash
docker build -t combo-skin-api api
docker compose up -d --wait
docker compose down -v
```

## Open questions

None.

## Implementation notes

Filled in during implementation: deviations from the design and why, follow-ups discovered, and which test covers each acceptance criterion.

## Audit

Filled in by the audit: one line per acceptance criterion (pass or fail, with evidence), the results of lint, tests, build and the secret scan, and a verdict of Pass, Pass with follow-ups, or Fail.
