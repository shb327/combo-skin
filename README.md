# combo-skin

[![website](https://github.com/shb327/combo-skin/actions/workflows/website.yml/badge.svg)](https://github.com/shb327/combo-skin/actions/workflows/website.yml)
[![api](https://github.com/shb327/combo-skin/actions/workflows/api.yml/badge.svg)](https://github.com/shb327/combo-skin/actions/workflows/api.yml)

Monorepo for the Combo Skin project.

| Path | Project | Stack |
| --- | --- | --- |
| [`website/`](website) | Frontend ([README](website/README.md)) | Vite + React + TypeScript |
| [`api/`](api) | Backend ([README](api/README.md)) | FastAPI + PostgreSQL |

Planned: an admin dashboard in `admin/` and self-hosted deployment config in `deploy/`.

## Running the local stack

```bash
cp api/.env.example api/.env
docker compose up -d --wait
```

This starts PostgreSQL and the API. See [`api/README.md`](api/README.md) for tests, migrations and running on the host.

See [`website/README.md`](website/README.md) to run the website.
