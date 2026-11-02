# combo-skin

Monorepo for the Combo Skin project.

| Path | Project | Stack |
| --- | --- | --- |
| [`website/`](website) | Frontend | Vite + React + TypeScript |

Planned: a Python backend in `api/`, an admin dashboard in `admin/`, and self-hosted deployment config in `deploy/`.

## Running the website

```bash
cd website
cp .env.example .env   # set VITE_ASSET_BASE_URL
npm install
npm run dev
```
