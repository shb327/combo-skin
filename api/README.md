# Combo Skin API

[![api](https://github.com/shb327/combo-skin/actions/workflows/api.yml/badge.svg)](https://github.com/shb327/combo-skin/actions/workflows/api.yml)

The backend for Combo Skin: a FastAPI service on PostgreSQL, with SQLAlchemy 2 (async) and Alembic migrations. Today it serves health checks and its OpenAPI docs; catalog, admin and combo endpoints come in later specs (see [`docs/specs/`](../docs/specs)).

## Prerequisites

- [uv](https://docs.astral.sh/uv/) 0.13.6 or newer (older versions are refused). It installs the pinned Python version (see `.python-version`) itself, so the system Python does not matter.
- [Docker](https://docs.docker.com/get-started/) with Compose v2, for PostgreSQL and the full local stack.

## Getting started

From the repository root:

```bash
cp api/.env.example api/.env
docker compose up -d --wait
```

This starts PostgreSQL, applies migrations, then starts the API on port 8000. Check it with:

```bash
curl http://localhost:8000/health/ready
```

Open http://localhost:8000/docs for the interactive docs. Stop everything with `docker compose down` (add `-v` to delete the database volume too).

## Running

**In Compose** (repository root): `docker compose up -d --wait` runs the built image. After changing code, rebuild with `docker compose up -d --wait --build`.

**On the host**, for day-to-day work with auto-reload. Start only the database, then run the API from `api/`:

```bash
docker compose up -d --wait db
cd api
uv sync
uv run alembic upgrade head
uv run uvicorn combo_api.main:app --reload
```

Stop the Compose `api` service first (`docker compose stop api`) if it is running, since both use port 8000.

## Tests

Tests run against a real PostgreSQL: start the Compose database first. They use a separate `<POSTGRES_DB>_test` database, created and migrated automatically, so your local data is never touched.

```bash
docker compose up -d --wait db
cd api
uv run pytest
```

If the database is not running, the database tests fail rather than skip.

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

## OpenAPI snapshot

`openapi.json` is a committed copy of the API schema, used to generate TypeScript types for the website and admin. After changing any route, regenerate it from `api/`:

```bash
uv run python -m combo_api.openapi
```

CI runs the same command with `--check` and fails if the committed file is out of date. Neither needs a database or an `.env` file.

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

A missing or invalid setting stops startup with an error that names the variable but never shows its value.

## Endpoints

| Route | Meaning |
| --- | --- |
| `GET /health/live` | 200 while the process is serving. Never touches the database. |
| `GET /health/ready` | 200 when the database answers and is at the latest migration, 503 otherwise. |
| `GET /docs`, `GET /openapi.json` | Interactive docs and the schema, unless `DOCS_ENABLED=false`. |

## Layout

| Path | Contents |
| --- | --- |
| `src/combo_api/main.py` | App factory and docs routes |
| `src/combo_api/settings.py` | Settings |
| `src/combo_api/db.py` | Engine, per-request sessions, model base |
| `src/combo_api/health.py` | Health endpoints |
| `src/combo_api/openapi.py` | Snapshot export and check |
| `migrations/` | Alembic environment and revisions |
| `tests/` | pytest suite |
| `Dockerfile` | Production image: non-root, runtime dependencies only |
