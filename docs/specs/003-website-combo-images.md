# 003: Bundle combo images in production builds

**Status:** Draft
<!-- Lifecycle: Draft → Approved → Implemented → Audited -->

**Section:** website
**Branch:** 003-website-combo-images

## Summary

Combo screenshots load on the dev server but are missing from production builds, so a deployed site shows broken images on every combos page. Import the images through Vite so the build bundles them, add a CI check that catches the mistake if it comes back, and correct the website README.

## Goals and non-goals

**Goals**

- Every combo image referenced in `website/src/data/combos.ts` is bundled by `npm run build` and loads from the built site.
- CI fails if the build output still references files under `/src/`.
- `website/README.md` shows the correct way to add a combo image.

**Non-goals**

- Finish images served from `VITE_ASSET_BASE_URL`, or the offline asset host.
- New combos, knife-side combos, or any change to how combos are displayed.
- A test runner for the website.

## Context

- `website/src/data/combos.ts` sets each combo's `image` to a string such as `/src/assets/combos/mogul/1.jpeg`. The Vite dev server serves files under `/src/`, so the images load in development. `npm run build` only bundles assets that are imported, so `dist/` contains none of the four files in `website/src/assets/combos/mogul/` and the built site requests paths that do not exist.
- `website/src/pages/Combos.tsx` renders `combo.image` as the `src` of the combo screenshot.
- Other bundled images already use imports, e.g. `website/src/components/Hero.tsx` and `website/src/pages/SearchKnives.tsx` import from `@/assets/...`. `website/src/vite-env.d.ts` references `vite/client`, which types image imports as URL strings.
- `website/README.md` (Data section) tells contributors to set `image: '/src/assets/combos/<finish>/<n>.jpeg'`, and its Configuration section says combo screenshots always load. Both are wrong for production builds.
- `.github/workflows/website.yml` runs `npm ci`, `npm run lint` and `npm run build`. The website has no test runner.
- Spec 001's audit recorded this bug as a follow-up.

## Requirements

- R1. A production build (`npm run build`) contains every combo image referenced in `src/data/combos.ts`, and the built combos page loads them.
- R2. Combo images still load on the dev server.
- R3. No source file under `website/src/` refers to an image by a `/src/...` string path.
- R4. The `website` CI workflow fails when the build output references a path under `/src/`.
- R5. `website/README.md` explains how to add a combo image using an import, and no longer claims something the build does not do.

## Design

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| How images reach the build | Import each image in `src/data/combos.ts` (`import mogul1 from '@/assets/combos/mogul/1.jpeg'`) and set `image: mogul1` | Moving images to `public/` and keeping string paths: no content hashing, and a missing or misspelled file only shows up as a broken image at runtime instead of failing the build. `new URL(..., import.meta.url)`: works, but differs from how every other image in the site is loaded. |
| `Combo.image` type | Stays `string`: an imported image is its URL | A new type for image modules: no benefit, and `Combos.tsx` would need changes. |
| Image location | Unchanged: `src/assets/combos/<finish>/<n>.jpeg` | Renaming files: unnecessary churn. |
| Regression check | A CI step after the build that fails if any file in `dist/` contains `/src/` asset paths | A test runner with a test: heavier than the problem; the website has none, and adding one is its own decision. No check: the bug is silent in development, so it would come back unnoticed. |
| Check implementation | A single shell `grep` step in `.github/workflows/website.yml`, no new dependency | A Node script in the repo: more code for the same check. |

## API / data model

None. The `Combo` interface in `src/data/combos.ts` is unchanged; only the values of `image` change from string paths to imported URLs.

## Security

- S1. The workflow keeps read-only repository access, uses no secrets, and every action stays pinned to a full commit SHA.
- S2. The change adds no new hostnames, URLs or configuration values to the repository.

## Acceptance criteria

1. `grep -rnE "['\"]/src/" website/src` prints nothing.
2. On a fresh clone with no `website/.env`, `cd website && npm ci && npm run lint && npm run build` exits 0.
3. After that build, `dist/assets/` contains four JPEG files (one per combo image in `src/data/combos.ts`), and `grep -rlF '/src/' website/dist` prints nothing.
4. With the build served by `npm run preview`, the combos page for Specialist Gloves | Mogul shows four combo images and each has loaded (`naturalWidth > 0` in the browser).
5. With `npm run dev`, the same page shows the same four images loaded.
6. `.github/workflows/website.yml` has a step after `npm run build` that fails when `grep -rlF '/src/' dist` finds a match; `actionlint` exits 0; triggers, permissions and SHA pins are unchanged.
7. Reverting `src/data/combos.ts` to string paths and running the new workflow step's command locally after a build exits non-zero.
8. `website/README.md` Data section shows adding a combo image with an import; `grep -c "/src/assets" website/README.md` prints 0; the Configuration section's statement about images stored in the repository is accurate for production builds.
9. After the branch is pushed, the `website` workflow run for its latest commit succeeds on GitHub.
10. `gitleaks dir . --no-banner --redact` on a clean clone reports no findings.

## Test plan

The website has no test runner, and this spec does not add one.

| Criterion | How it is checked |
| --- | --- |
| 1 | The grep in criterion 1 |
| 2 | Fresh clone into a temporary directory, then the commands in criterion 2 |
| 3 | `ls dist/assets/*.jpeg \| wc -l`; the grep in criterion 3 |
| 4 | `npm run preview`, open the page, evaluate `[...document.querySelectorAll('img')].filter(i => i.src.includes('/assets/') && i.naturalWidth > 0)` in the browser for the four combo images |
| 5 | Same as 4 with `npm run dev` |
| 6 | Read the workflow; `actionlint .github/workflows/website.yml`; `git diff` shows no change to triggers, permissions or `uses:` lines |
| 7 | Temporarily restore the old `image` strings, `npm run build`, run the step's command, confirm a non-zero exit, discard the change |
| 8 | Read the README sections; the grep in criterion 8 |
| 9 | The workflow run page for the branch's latest commit (checked after the owner pushes) |
| 10 | `gitleaks dir . --no-banner --redact` |

Section commands, run in `website/`:

```bash
npm ci
npm run lint
npm run build
```

## Open questions

None.

## Implementation notes

Filled in during implementation: deviations from the design and why, follow-ups discovered, and which test covers each acceptance criterion.

## Audit

Filled in by the audit: one line per acceptance criterion (pass or fail, with evidence), the results of lint, tests, build and the secret scan, and a verdict of Pass, Pass with follow-ups, or Fail.
