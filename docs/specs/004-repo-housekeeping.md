# 004: Repo housekeeping

**Status:** Draft
<!-- Lifecycle: Draft → Approved → Implemented → Audited -->

**Section:** repo
**Branch:** 004-repo-housekeeping

## Summary

Clear the follow-ups that the audits of specs 001 to 003 left open: a dev tunnel hostname committed in the website's Vite config, two entries for local tool configuration in the public `.gitignore`, an outdated uv pin, `LOG_LEVEL` not reaching uvicorn's own logs, stale "not yet checked" lines in two specs, and branches that are already merged.

## Goals and non-goals

**Goals**

- Remove the committed tunnel hostname, and let a developer allow a tunnel host locally through the uncommitted `website/.env`.
- Move the two local tool configuration entries from the public `.gitignore` to this machine's `.git/info/exclude`, without anything becoming tracked.
- Move uv to the current release everywhere it is pinned, together.
- Make `LOG_LEVEL` apply to uvicorn's error and access logs as well as the API's own logs.
- Correct the stale criterion lines in the Implementation notes of specs 001 and 003.
- Give the owner the list of fully merged branches and the commands to delete them.

**Non-goals**

- Rewriting git history. The removed hostname stays in old commits.
- The API image size (226 MB of a 250 MB budget): watched, not changed.
- Finish images and the offline asset host: the catalog spec handles them.
- Deleting any branch without the owner's confirmation, and deleting remote branches at all.

## Context

- `website/vite.config.ts` sets `server.allowedHosts` to a single hard-coded dev tunnel hostname. It is public on `main` and in history.
- Vite's own `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` variable is read only from the real process environment: Vite's `.env` loader does not copy it there, so setting it in `website/.env` has no effect. It also takes a single host and is undocumented.
- `website/.gitignore` ignores `*.env`, so `website/.env` is never committed. `website/.env.example` holds one placeholder, `VITE_ASSET_BASE_URL`.
- The root `.gitignore` ends with two entries for a local tool's configuration (a file name that also matches a copy under `website/`, and a directory). Those files exist on the owner's machine and must stay untracked.
- uv is pinned at 0.11.2 in `api/Dockerfile` (the official uv image, by digest) and in `.github/workflows/api.yml` (`astral-sh/setup-uv` `version`). `api/pyproject.toml` requires `uv_build>=0.11,<0.12`. `api/uv.lock` was written by uv 0.11. The development machine runs uv 0.11.2. `api/README.md` names uv as a prerequisite without a version. The current release is 0.13.6; its release notes require raising the `uv_build` upper bound and make Python 3.15 the default only when no version is pinned (`api/.python-version` pins 3.14).
- `api/src/combo_api/main.py` sets the `combo_api` logger's level from `LOG_LEVEL` at startup. Uvicorn's `uvicorn`, `uvicorn.error` and `uvicorn.access` loggers keep uvicorn's default level. `api/tests/test_settings.py::test_log_level_applies_to_app_logger` covers only the app logger.
- `docs/specs/001-website-readme-and-ci.md` Implementation notes list criterion 8 as "Not yet checked"; its Audit verified it. `docs/specs/003-website-combo-images.md` has the same stale line for criterion 9. Spec 003 must be merged into `main` before this work starts, and this branch updated from `main`.
- Branches fully merged into `main` today: `spec-workflow`, `001-website-readme-and-ci`, `002-api-foundation`, locally and on the remote. `003-website-combo-images` joins them once merged.

## Requirements

- R1. No tracked file contains the previously committed tunnel hostname.
- R2. A developer can allow one or more tunnel hosts for the dev server by setting `DEV_ALLOWED_HOSTS` in the uncommitted `website/.env`. With it unset, the dev server allows only Vite's default hosts.
- R3. `DEV_ALLOWED_HOSTS` never reaches the browser bundle.
- R4. `website/README.md` documents `DEV_ALLOWED_HOSTS` with a placeholder value only, and `website/.env.example` lists it commented out with the same placeholder.
- R5. The public `.gitignore` no longer lists the two local tool configuration entries, and those files stay ignored on the owner's machine through `.git/info/exclude`; none becomes tracked.
- R6. uv 0.13.6 is used everywhere uv is pinned: the Dockerfile's uv image, the `api` workflow, the `uv_build` requirement, the lockfile and the development machine. A uv older than 0.13.6 is refused with a clear message.
- R7. `LOG_LEVEL` sets the level of the `combo_api`, `uvicorn`, `uvicorn.error` and `uvicorn.access` loggers.
- R8. The Implementation notes of specs 001 and 003 cite the workflow runs that verified their CI criteria instead of "Not yet checked".
- R9. The owner receives the list of local and remote branches fully merged into `main`, with exact delete commands. Local branches are deleted only after the owner confirms; remote branches are never deleted by the implementer.

## Design

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| Tunnel host setting | `website/vite.config.ts` reads `DEV_ALLOWED_HOSTS` (comma-separated) from `website/.env` with Vite's `loadEnv` and sets `server.allowedHosts` to that list; empty or unset gives `[]`, Vite's default | `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` in `.env`: Vite ignores it there (see Context). Copying it into the process environment from the config: works for one host only and depends on an undocumented Vite internal. Shell-only variable: the owner wants the setting in `.env`. |
| Variable name and exposure | `DEV_ALLOWED_HOSTS`, no `VITE_` prefix, so Vite never exposes it to client code | A `VITE_` name: anything with that prefix can end up in the browser bundle. |
| Example file | `website/.env.example` gains a commented-out `DEV_ALLOWED_HOSTS` line with the placeholder `tunnel.example.com` | Not listing it: the README would be the only place it is mentioned. |
| History | Not rewritten; the hostname stays in old commits | Rewriting history: the hostname is not a secret, and rewriting breaks every clone and merged pull request. |
| Local tool configuration | Add both entries to `.git/info/exclude` first, confirm with `git check-ignore -v` that they are now ignored through that file, then remove them from `.gitignore` and confirm again | Removing them from `.gitignore` first: the files would show as untracked in between and could be committed by accident. A global gitignore: affects every repository on the machine. |
| uv version | 0.13.6, the current release | 0.12.x: already superseded. |
| uv pins | Official uv image `0.13.6` pinned by digest in `api/Dockerfile`; `version: "0.13.6"` in the workflow; `uv_build>=0.13,<0.14`; `api/uv.lock` regenerated with uv 0.13.6; the development machine upgraded to 0.13.6 | Leaving the lockfile as written by 0.11: `uv sync --locked` may reject it after the upgrade. |
| Minimum uv | `[tool.uv] required-version = ">=0.13.6"` in `api/pyproject.toml`; `api/README.md` prerequisites name uv 0.13.6 or newer | No minimum: an older local uv fails later with less clear errors, or silently rewrites the lockfile. |
| Uvicorn log level | At startup, the app sets the same level on `uvicorn`, `uvicorn.error` and `uvicorn.access` as on `combo_api` | A `--log-level` flag in the Docker command: covers only the container, not `uv run uvicorn` on the host, and adds a second place the level is set. Uvicorn's own `UVICORN_LOG_LEVEL` variable: a second setting for the same thing. The few lines uvicorn logs before the app starts stay at its default level; this is accepted. |
| Stale notes | Replace the two "Not yet checked" cells with the run id, commit and result already recorded in each spec's Audit | Leaving them: the Implementation notes contradict the Audit. |
| Branch cleanup | List with `git branch --merged main` and `git branch -r --merged origin/main`; give `git branch -d <name>` and `git push origin --delete <name>` commands; delete local branches only after confirmation | Deleting automatically: the owner asked to confirm first, and remote deletion is the owner's action. |

## API / data model

None. One new website setting:

| Variable | File | Example | Meaning |
| --- | --- | --- | --- |
| `DEV_ALLOWED_HOSTS` | `website/.env` (uncommitted) | `tunnel.example.com` | Comma-separated extra hosts the dev server accepts, e.g. a tunnel. Dev server only. |

## Security

- S1. No hostname, IP address or tunnel URL is added to any tracked file; documentation uses `example.com` placeholders only.
- S2. `DEV_ALLOWED_HOSTS` is not exposed to client code or the production bundle.
- S3. No local tool configuration file becomes tracked at any point.
- S4. The uv image stays pinned by digest; workflows keep read-only permissions, SHA-pinned actions and no secrets.
- S5. No remote branch is deleted by the implementer.

## Acceptance criteria

1. `git grep -nF` for the hostname removed from `website/vite.config.ts` (taken from this branch's diff) prints nothing, and `website/vite.config.ts` contains no hostname literal.
2. With no `DEV_ALLOWED_HOSTS`, `npm run dev` answers a request whose `Host` header is `tunnel.example.com` with 403; with `DEV_ALLOWED_HOSTS=tunnel.example.com` in `website/.env`, the same request gets 200; with two comma-separated hosts, both get 200.
3. With `DEV_ALLOWED_HOSTS` set in `website/.env`, `npm run build` exits 0 and `grep -rF -e DEV_ALLOWED_HOSTS -e tunnel.example.com website/dist` prints nothing.
4. `website/README.md` documents `DEV_ALLOWED_HOSTS` with the placeholder `tunnel.example.com` and says the file is not committed; `website/.env.example` has the same line commented out.
5. Before `.gitignore` changes, `git check-ignore -v` on each local configuration path (including the copy under `website/`) reports `.gitignore`; after the change, it reports `.git/info/exclude`. `.gitignore` no longer contains either entry, and `git status --porcelain --ignored` shows those paths as ignored, never as untracked or staged.
6. `api/Dockerfile` uses the uv `0.13.6` image pinned by `@sha256:` digest; `.github/workflows/api.yml` sets `version: "0.13.6"`; `api/pyproject.toml` requires `uv_build>=0.13,<0.14` and sets `required-version = ">=0.13.6"`; `uv --version` on the development machine prints 0.13.6.
7. `cd api && uv lock --check` exits 0 with uv 0.13.6, and `uv sync --locked`, `uv run ruff format --check .`, `uv run ruff check .`, `uv run mypy`, `uv run pytest` and `uv run python -m combo_api.openapi --check` all exit 0.
8. `docker build -t combo-skin-api api` exits 0, and `docker compose up -d --wait` brings the stack up with `/health/ready` returning 200.
9. A test sets `LOG_LEVEL=warning`, runs the app's startup, and checks that `combo_api`, `uvicorn`, `uvicorn.error` and `uvicorn.access` are all at `WARNING`.
10. `grep -n "Not yet checked" docs/specs/001-website-readme-and-ci.md docs/specs/003-website-combo-images.md` prints nothing, and the corrected rows match the run ids in each spec's Audit.
11. The implementation report lists every local and remote branch fully merged into `main` with its delete command, and `git ls-remote --heads origin` after the work still lists every remote branch it listed before.
12. After the branch is pushed, the `api` and `website` workflow runs for its latest commit succeed on GitHub.
13. `gitleaks dir . --no-banner --redact` on a clean clone and `gitleaks git` over the branch report no findings.

## Test plan

| Criterion | How it is checked |
| --- | --- |
| 1 | Take the removed value from `git diff main -- website/vite.config.ts`, run `git grep -nF` for it; read `website/vite.config.ts` |
| 2 | `npm run dev`, then `curl -s -o /dev/null -w '%{http_code}' -H 'Host: tunnel.example.com'` against the dev server, with the variable unset, set to one host, and set to two hosts |
| 3 | The commands in criterion 3 |
| 4 | Read `website/README.md` and `website/.env.example` |
| 5 | `git check-ignore -v` before and after; `git diff main -- .gitignore`; `git status --porcelain --ignored` |
| 6 | Read the four files; `uv --version` |
| 7 | The commands in criterion 7, with the Compose database up |
| 8 | The commands in criterion 8, then `curl` the readiness endpoint and `docker compose down -v` |
| 9 | pytest: the extended log level test in `api/tests/test_settings.py` |
| 10 | The grep in criterion 10; compare with each Audit table |
| 11 | Read the report; `git ls-remote --heads origin` before and after |
| 12 | The workflow run pages for the branch's latest commit (checked after the owner pushes) |
| 13 | `gitleaks dir . --no-banner --redact`; `gitleaks git --log-opts="main..004-repo-housekeeping" --no-banner --redact` |

Section commands. In `website/`:

```bash
npm ci
npm run lint
npm run build
```

In `api/`, with the Compose database up:

```bash
uv sync --locked
uv run ruff format --check .
uv run ruff check .
uv run mypy
uv run pytest
uv run python -m combo_api.openapi --check
```

## Open questions

None.

## Implementation notes

Filled in during implementation: deviations from the design and why, follow-ups discovered, and which test covers each acceptance criterion.

## Audit

Filled in by the audit: one line per acceptance criterion (pass or fail, with evidence), the results of lint, tests, build and the secret scan, and a verdict of Pass, Pass with follow-ups, or Fail.
