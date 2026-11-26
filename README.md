# combo-skin

[![website](https://github.com/shb327/combo-skin/actions/workflows/website.yml/badge.svg)](https://github.com/shb327/combo-skin/actions/workflows/website.yml)
[![api](https://github.com/shb327/combo-skin/actions/workflows/api.yml/badge.svg)](https://github.com/shb327/combo-skin/actions/workflows/api.yml)
[![admin](https://github.com/shb327/combo-skin/actions/workflows/admin.yml/badge.svg)](https://github.com/shb327/combo-skin/actions/workflows/admin.yml)
[![deploy](https://github.com/shb327/combo-skin/actions/workflows/deploy.yml/badge.svg)](https://github.com/shb327/combo-skin/actions/workflows/deploy.yml)

Monorepo for the Combo Skin project.

| Path | Project | Stack |
| --- | --- | --- |
| [`website/`](website) | Frontend ([README](website/README.md)) | Vite + React + TypeScript |
| [`api/`](api) | Backend ([README](api/README.md)) | FastAPI + PostgreSQL |
| [`admin/`](admin) | Admin dashboard ([README](admin/README.md)) | Vite + React + TypeScript |
| [`deploy/`](deploy) | Publishing and backups ([README](deploy/README.md)) | Python + wrangler |

## How the site is published

The live site has no server. The back office (the admin dashboard, the API, PostgreSQL, storage and the screenshot worker) runs on one Mac and is never on the internet. A publish command on that Mac reads the published combos from the local API, builds the website from the tip of `origin/main` with that data inside it, uploads new screenshots and pictures to a public R2 bucket at `img.combo.skin`, and deploys the site to Cloudflare Pages at `combo.skin`. Code changes go live by themselves: every merge to `main` is deployed by GitHub Actions on the data that is already live, so combos still change only when the owner publishes. See [`deploy/README.md`](deploy/README.md) for the command and runbooks, and [`docs/static-publishing.md`](docs/static-publishing.md) for why.

## Running the local stack

```bash
cp api/.env.example api/.env
docker compose up -d --wait
```

This starts PostgreSQL and the API. See [`api/README.md`](api/README.md) for tests, migrations and running on the host.

See [`website/README.md`](website/README.md) to run the website, and [`admin/README.md`](admin/README.md) to run the admin dashboard against the local API.
