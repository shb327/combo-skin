# 001: Website README and CI

**Status:** Audited
<!-- Lifecycle: Draft → Approved → Implemented → Audited -->

**Section:** website
**Branch:** 001-website-readme-and-ci

## Summary

Replace the website's Vite template README with a real one that explains what Combo Skin does, shows it, and tells a newcomer how to run it. Add a GitHub Actions workflow that runs the website's lint and build on every push and pull request, with a status badge, so a broken build is visible before it is merged.

## Goals and non-goals

**Goals**

- A website README that a visitor or contributor can read top to bottom: what the site is, screenshots, how to run it locally, how the code and data are organised.
- A CI workflow that runs `npm run lint` and `npm run build` for `website/` on every push and every pull request.
- A status badge for that workflow in the root and website READMEs.

**Non-goals**

- Adding a test runner or tests for the website. CI runs only what exists today: lint and build.
- Deploying the site, or any CI for `api/`, `admin/` or `deploy/` (they do not exist yet).
- Linking to a live deployment. Hosting is not settled yet.
- Changing application code, data, or the Vite or ESLint configuration.
- Automated dependency updates for the pinned actions.

## Context

- `website/README.md` is the unmodified Vite React TypeScript template README. It says nothing about Combo Skin.
- `README.md` (root) has a project table and short "Running the website" instructions.
- There is no `.github/` directory and no CI of any kind.
- `website/package.json` defines `dev`, `build` (`tsc -b && vite build`), `lint` (`eslint .`) and `preview`. There is no `test` script. `website/package-lock.json` is committed, so `npm ci` works.
- `npm run lint` and `npm run build` both pass today. The build also passes on a clean checkout with no `website/.env` file.
- `website/.env.example` declares one variable, `VITE_ASSET_BASE_URL`, with a placeholder value. It is declared in `website/src/vite-env.d.ts` and read in `website/src/data/gloves.ts`, `website/src/data/knives.ts`, `website/src/pages/GloveFinishes.tsx` and `website/src/pages/KnifeFinishes.tsx` to build finish image URLs (`<base>/gloves/<type>/<finish>.png`, `<base>/knives/<type>/<finish>.png`). Without it the site runs, but finish images do not load.
- Routes are defined in `website/src/App.tsx`: home, glove search, glove finishes, knife search, knife finishes, and a combos page per glove or knife finish.
- Site data lives in `website/src/data/`: `gloves.ts` (glove types and finishes), `knives.ts` (knife types and finishes), `combos.ts` (curated glove + knife combos per glove finish, with images under `website/src/assets/combos/`). Knife-to-glove combos are not implemented yet (`website/src/pages/Combos.tsx` returns an empty list for knives).
- `website/CS2_FINISHES.md` explains how knife finishes are distributed in CS2.
- Local development uses Node 24 and npm 11.

## Requirements

- R1. `website/README.md` describes Combo Skin: a site that helps CS2 players find good-looking glove and knife combinations, and what a visitor can do on it today.
- R2. `website/README.md` shows at least three screenshots of the running site, stored in the repository.
- R3. `website/README.md` explains how to run the site locally from a fresh clone: prerequisites, install, environment setup, dev server, and the other npm scripts.
- R4. `website/README.md` explains `VITE_ASSET_BASE_URL` using only a placeholder value, and states that finish images do not load without it.
- R5. `website/README.md` describes the project layout (`src/pages`, `src/components`, `src/data`, `src/assets`) and how to add a glove finish, knife finish or combo in `src/data`.
- R6. A GitHub Actions workflow runs `npm ci`, `npm run lint` and `npm run build` in `website/` on every push to any branch and on every pull request.
- R7. The workflow's status badge appears near the top of both `README.md` and `website/README.md` and links to the workflow's runs.
- R8. The root `README.md` points to `website/README.md` for website details instead of duplicating its setup steps.

## Design

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| Workflow file | `.github/workflows/website.yml`, workflow name `website` | One repo-wide `ci.yml`: per-section workflows give one badge per section and stay independent as `api/` and `admin/` arrive. |
| Triggers | `push` (all branches) and `pull_request`, no path filters | Path filters on `website/**`: a skipped required check blocks merges, and the build is fast. Revisit when the repo has more sections. |
| Action versions | Pinned to full commit SHAs, with the version tag as a trailing comment | Major version tags: a moved tag would change what runs without a commit in this repo. |
| Node version | Node 24 via the official setup-node action, npm cache keyed on `website/package-lock.json` | Node 22: local development already uses 24. A version matrix: unnecessary for a static site. |
| Install | `npm ci` | `npm install`: can rewrite the lockfile and hides lockfile drift. |
| Working directory | `defaults.run.working-directory: website` | `cd website` in every step: repetitive and easy to miss. |
| Concurrency | One run per branch or pull request; a new push cancels the older in-progress run | No concurrency group: wastes runner time on superseded commits. |
| Environment in CI | No `.env`, no secrets; the build runs without `VITE_ASSET_BASE_URL` | Injecting the real asset URL as a secret: the build does not need it, and CI should not depend on private configuration. |
| Screenshots | PNGs captured from the local dev server at 1440 px wide, stored in `website/docs/screenshots/` | Live site: hosting is not settled. Images hosted elsewhere: links rot and depend on outside services. |
| Screenshot pages | Home, search by gloves, and the combos page for one glove finish cropped to its combo cards; all use images stored in the repository | Every page: more weight in the repo for little extra information. Glove finishes: its images come from the asset host, which is offline, so it would show broken images. |
| Badge placement | Root `README.md` and `website/README.md` | Root only: the website README is what people land on from the `website/` folder. |
| Live site link | None for now | Linking the domain: hosting is not settled. |
| Licensing | The README says nothing about a license; licensing is decided in a separate spec | Stating a license now: the repository has no LICENSE file, and choosing one is a separate decision. |
| Asset URL in docs | Placeholder only, as in `.env.example` | Publishing the real asset URL: not needed to build, and keeps infrastructure out of the public repo. |

## API / data model

None.

## Security

- S1. The workflow has read-only access to repository contents (`permissions: contents: read`) and no other permissions.
- S2. The workflow uses no repository or organisation secrets and does not need any to pass.
- S3. The workflow runs on `pull_request`, not `pull_request_target`, so code from forks never runs with elevated permissions.
- S4. Every third-party action is pinned to a full commit SHA.
- S5. The READMEs and screenshots contain no real hostnames, asset URLs, IP addresses, credentials, personal email addresses or local file paths. Screenshots show only the site's own pages, with no browser chrome, bookmarks or other tabs.
- S6. `website/.env.example` keeps a placeholder value.

## Acceptance criteria

1. `.github/workflows/website.yml` exists and `actionlint .github/workflows/website.yml` exits 0.
2. The workflow triggers on `push` and `pull_request` with no branch or path filters, and does not use `pull_request_target`.
3. The workflow sets `permissions: contents: read` at the top level and grants nothing else.
4. Every `uses:` line in the workflow references a 40-character commit SHA: `grep -E '^\s*-?\s*uses:' .github/workflows/website.yml | grep -vE '@[0-9a-f]{40}( |$)'` prints nothing.
5. The workflow references no secrets: `grep -n 'secrets\.' .github/workflows/website.yml` prints nothing.
6. The workflow sets up Node 24, runs `npm ci`, `npm run lint` and `npm run build` in `website/`, and cancels superseded in-progress runs for the same ref.
7. On a fresh clone with no `website/.env`, `cd website && npm ci && npm run lint && npm run build` exits 0.
8. After the branch is pushed, the `website` workflow run for its latest commit succeeds on GitHub.
9. `website/README.md` contains no text from the Vite template (`grep -c 'This template provides' website/README.md` prints 0) and has these sections: what the site does, screenshots, getting started, scripts, configuration, project structure, and data.
10. `website/README.md` embeds at least three screenshots by relative path, every referenced image file exists in `website/docs/screenshots/`, each has alt text, and each file is under 500 KB.
11. The `website` badge appears in the first five lines of both `README.md` and `website/README.md`, using `https://github.com/shb327/combo-skin/actions/workflows/website.yml/badge.svg` and linking to `https://github.com/shb327/combo-skin/actions/workflows/website.yml`.
12. `website/README.md` documents `VITE_ASSET_BASE_URL` with the same placeholder as `website/.env.example`, and states that finish images do not load without a real value.
13. Following the getting-started steps in `website/README.md` literally on a fresh clone starts the dev server, and the home page renders.
14. The root `README.md` links to `website/README.md` and no longer contains its own copy of the website setup commands.
15. The only URLs in the changed files point to `github.com/shb327/combo-skin`, public documentation (Node.js, npm, Vite), or the `example.com` placeholder from `website/.env.example`, and `gitleaks dir . --no-banner --redact` reports no findings.

## Test plan

The website has no test runner, and this spec does not add one. Each criterion is checked by a command or a precise manual step.

| Criterion | How it is checked |
| --- | --- |
| 1 | `actionlint .github/workflows/website.yml` (local tool, not a repo dependency) |
| 2, 3, 6 | Read the workflow; `grep -n 'pull_request_target' .github/workflows/website.yml` prints nothing |
| 4 | The grep in criterion 4 prints nothing |
| 5 | The grep in criterion 5 prints nothing |
| 7 | `git clone` into a temporary directory, then the commands in criterion 7 |
| 8 | The workflow run page for the branch's latest commit shows success (checked after the owner pushes) |
| 9 | The grep in criterion 9 prints 0; read the README headings |
| 10 | A shell loop over the image paths in `website/README.md`: `test -f` and a size check for each; read the alt text |
| 11 | `head -5 README.md website/README.md` |
| 12 | `grep -n VITE_ASSET_BASE_URL website/README.md website/.env.example` |
| 13 | Manual: fresh clone, follow the README, open the dev server URL |
| 14 | Read `README.md` |
| 15 | `grep -noE 'https?://[^ )>"]+' README.md website/README.md .github/workflows/website.yml`; `gitleaks dir . --no-banner --redact` |

Section commands, run in `website/`:

```bash
npm ci
npm run lint
npm run build
```

## Open questions

None.

## Implementation notes

### Deviations

**2026-11-02, screenshot pages (agreed with the owner).** The Design table picks home, glove finishes for one glove type, and combos for one glove finish. Finish images load from `VITE_ASSET_BASE_URL`, and the configured asset host does not currently resolve, so the glove-finishes page shows only alt text and the combos page header shows a broken thumbnail. Home, the glove and knife search pages, and the combo cards use images stored in the repository and render fully. Instead: home, search by gloves, and the combos page for one glove finish cropped to its combo cards, all captured at 1440 px wide. The Design table was updated to match.

### Criterion coverage

| Criterion | Covered by |
| --- | --- |
| 1 | `actionlint .github/workflows/website.yml` (actionlint 1.7.12, official image pinned by digest) exits 0 |
| 2 | `on: push, pull_request` with no filters; `grep -n pull_request_target .github/workflows/website.yml` prints nothing |
| 3 | Top-level `permissions: contents: read` and nothing else |
| 4 | The grep in criterion 4 prints nothing (checkout v7.0.1 and setup-node v7.1.0, pinned to SHAs) |
| 5 | The grep in criterion 5 prints nothing |
| 6 | The workflow sets up Node 24 with the npm cache keyed on `website/package-lock.json`, runs `npm ci`, `npm run lint`, `npm run build` in `website/`, and sets `concurrency` with `cancel-in-progress` |
| 7 | Fresh clone with no `website/.env`: `npm ci`, `npm run lint`, `npm run build` each exit 0 |
| 8 | Workflow run 41478083919 on commit 12798cf: job `build` succeeded (`npm ci`, `npm run lint`, `npm run build`) |
| 9 | `grep -c 'This template provides' website/README.md` prints 0; sections: what the site does, screenshots, getting started, scripts, configuration, project structure, data |
| 10 | Three screenshots in `website/docs/screenshots/` (189 KB, 294 KB, 448 KB), each embedded with alt text |
| 11 | `head -5 README.md website/README.md` shows the `website` badge and link in both |
| 12 | `website/README.md` documents `VITE_ASSET_BASE_URL` with the `.env.example` placeholder and says finish images do not load without a real value |
| 13 | Fresh clone, getting-started steps followed literally: the dev server starts and the home page renders |
| 14 | The root README links `website/README.md` and has no setup commands (`grep -c 'npm run dev\|npm install' README.md` prints 0) |
| 15 | The URL grep lists only the repo's GitHub URLs, Node.js, npm and Vite docs, and the `example.com` placeholder; `gitleaks dir .` on a clean clone and `gitleaks git` over the branch report no leaks |

### Follow-ups

- The asset host behind `VITE_ASSET_BASE_URL` does not resolve, so finish images fail everywhere the site uses them, including any deployed copy. Restore the host or move the images (spec 003 plans a catalog that 3D viewers and images can build on).
- Combo screenshots are referenced as `/src/assets/combos/...` strings in `src/data/combos.ts`. The dev server serves them, but `npm run build` does not include them, so a production build shows no combo images. Importing them, or moving them to `public/`, fixes it. This spec does not change application code.
- `combos.png` was over 500 KB as captured. All three PNGs were re-encoded losslessly with stronger compression; pixels are unchanged.
- Spec 002's branch also edits the root `README.md`. Whichever pull request merges second needs both badges and both project rows.

## Audit

**Date:** 2026-11-02 · **Branch:** 001-website-readme-and-ci · **Commit:** 12798cf
**Verdict:** Pass with follow-ups

All local checks ran on a fresh clone of the branch with no `website/.env`.

| # | Criterion | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Workflow exists and passes actionlint | Pass | `actionlint .github/workflows/website.yml` (1.7.12) exit 0 |
| 2 | `push` and `pull_request`, no filters, no `pull_request_target` | Pass | `.github/workflows/website.yml` `on:` block; the `pull_request_target` grep prints nothing |
| 3 | `permissions: contents: read` only | Pass | Top-level `permissions` block in the workflow |
| 4 | Every action pinned to a commit SHA | Pass | The grep in criterion 4 prints nothing (checkout v7.0.1, setup-node v7.1.0) |
| 5 | No secrets | Pass | `grep -n 'secrets\.' .github/workflows/website.yml` prints nothing |
| 6 | Node 24, `npm ci`, lint, build in `website/`, cancels superseded runs | Pass | Workflow steps, `defaults.run.working-directory: website`, `concurrency` with `cancel-in-progress` |
| 7 | Clean clone without `.env`: install, lint and build pass | Pass | `npm ci`, `npm run lint`, `npm run build` each exit 0 |
| 8 | `website` workflow succeeds on GitHub | Pass | Run 41478083919 on commit 12798cf: job `build` succeeded, with `npm ci`, `npm run lint` and `npm run build` all successful |
| 9 | No template text; required sections | Pass | `grep -c 'This template provides' website/README.md` prints 0; headings cover what the site does, screenshots, getting started, scripts, configuration, project structure, data |
| 10 | At least three screenshots, present, with alt text, under 500 KB | Pass | Three embeds by relative path; files exist in `website/docs/screenshots/` at 188,981, 293,978 and 448,380 bytes, all 1440 px wide; each has alt text |
| 11 | Badge in the first five lines of both READMEs | Pass | `head -5 README.md website/README.md`: badge image and link to the workflow in both |
| 12 | `VITE_ASSET_BASE_URL` documented with the placeholder; images need a real value | Pass | `website/README.md` Configuration section uses the same placeholder as `website/.env.example` and says finish images do not load without a real value |
| 13 | Getting-started steps start the dev server; home renders | Pass | Fresh clone, steps followed literally; the dev server started and the rendered home page contains its search-by-gloves and search-by-knives cards |
| 14 | Root README links the website README, no setup commands | Pass | `README.md` lines 9 and 13 link `website/README.md`; no `npm` commands remain |
| 15 | Only allowed URLs; no secrets | Pass | URL grep: the repo's GitHub URLs, Node.js, npm and Vite docs, and the `example.com` placeholder; gitleaks: no findings |

| Check | Command | Result |
| --- | --- | --- |
| Lint | `npm run lint` (clean `npm ci`), locally and in CI | Pass |
| Tests | None: the website has no test runner, by design of this spec | Not applicable |
| Build | `npm run build`, locally and in CI | Pass |
| Secret scan | `gitleaks git --log-opts="origin/main..001-website-readme-and-ci"`, `gitleaks dir .` on a clean clone | Pass |
| Public exposure | Manual review of the diff and log: no secrets, hosts, addresses or local paths; screenshots show only the site's pages; local tool configuration is ignored and nothing private or `.env` is tracked; all 7 commits are authored by the owner with one-line messages and no trailers | Pass |
| Design conformance | Manual review against Design; the diff touches only the workflow, READMEs, screenshots and this spec, with no application code | Pass, one recorded deviation |

**Findings**

- (follow-up) Recorded deviation: the screenshots show home, search by gloves and a cropped combos page instead of glove finishes, because the asset host does not resolve. Swap in a glove-finishes screenshot once finish images load again.
- (follow-up) `website/README.md` says combo screenshots "always load". That is true on the dev server only: combo images are referenced as `/src/assets/...` strings and are missing from `npm run build` output (recorded under Follow-ups in Implementation notes). Correct the README when that bug is fixed, or sooner.
- (follow-up) The Implementation notes still list criterion 8 as not yet checked; this audit verified it.
- (follow-up) Recorded in Implementation notes, still open: the asset host is offline; combo images are missing from production builds; the root `README.md` will conflict with spec 002's branch at merge time.
