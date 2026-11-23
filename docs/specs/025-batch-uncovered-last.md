# 025: Batch: uncovered knives go to the end

**Status:** Audited
<!-- Lifecycle: Draft → Approved → Implemented → Audited -->

**Section:** admin
**Branch:** 025-batch-uncovered-last

## Summary

Picking a batch-wide special pattern unticks the knives the group has no seed for (spec 024). They stay in place, so with a narrow group such as Diamond Gem (4 of 10 knives) the knives that are still ticked are scattered between unticked ones, and the owner has to look for them. Now the unticked knives also move to the end of the batch, so the covered knives are together at the top.

## Goals and non-goals

**Goals**

- On a group pick, the knives it unticks move to the end of this batch's order, and every other knife keeps its place relative to the others.
- No rating changes because of the move.

**Non-goals**

- Moving knives back when the group is removed.
- The shared knife order (`/knife-order`): unchanged, as for every batch order (spec 017).
- Any API change.

## Context

Builds on spec 024, on its branch `024-batch-form` (not merged yet).

- `admin/src/combos/batch.ts`: `applyGroup(rows, text, knife)` unticks and marks (`RowText.untickedFor`) the knives a new group does not cover, and ticks them again on removal. It changes `rows`, not `order`. `BatchText.order` is this batch's knife order (spec 017); `batchRows()` lists rows in it, and the fill (`fillRatings`) gives ratings to ticked rows only, in that order. `untickedNote()` and the announcement name the unticked knives.
- `admin/src/pages/BatchPage.tsx`: calls `applyGroup` from the Every knife values and shows its announcement in the page's live region.
- Tests: `admin/src/combos/batch.test.ts` (`applyGroup`), `admin/src/pages/BatchPage.test.tsx`, "a special pattern for the batch" and "the batch order".

## Requirements

- R1. When a pick unticks knives (spec 024, R2), those knives move to the end of this batch's order, in the order they had. All other knives keep their order. This happens whether or not the order is locked by "Refill from top".
- R2. The move changes no rating: ticked knives keep their order relative to each other, and the fill skips unticked knives.
- R3. Removing the group ticks the knives again where they are, at the end; it does not move them back. Ticked again, they follow the fill from there.
- R4. A knife ticked again by hand stays where it is.
- R5. The note in the Every knife box and the announcement say the knives were moved: "6 knives with no Diamond Gem unticked and moved to the end: Butterfly Knife, .... Tick one to include it with any pattern." and "Unticked 6 knives with no Diamond Gem and moved them to the end: ...".
- R6. The new order is kept with the batch's other unsaved values, as any batch order.

## Design

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| What moves | The knives the pick unticks go to the end; everything else stays in order (a stable split) | Moving the covered knives to the top: the same list for a fresh batch, but it would also move knives that already exist and knives unticked by hand, which the group does not decide for (spec 024, R1) |
| Ratings | Unchanged: the fill counts ticked knives only, and their order among themselves does not change. Applies while the order is locked too, since the locked ratings stay the same | Skipping the move while the order is locked: the scattered list the owner asked to fix, for no gain |
| On Remove | The knives are ticked again at the end; the order is not restored | Restoring the order from before the pick: needs the old order kept, and would undo any drag made since. A Remove right after a pick is rare; the knives can be dragged back |
| Where | In `applyGroup`, which already knows the batch's rows in order: it returns the new `order` with the new `rows`, so one change sets both | A second step in `BatchPage`: two changes for one pick |

## API / data model

None. `BatchText.order` (spec 017) holds the new order.

## Security

- S1. No API, dependency or storage change; the order stays in the in-memory unsaved values.

## Acceptance criteria

1. Unit test (`batch.test.ts`): picking Test Pattern (only Karambit covered) in the order Karambit, Butterfly Knife, M9 Bayonet gives the order Karambit, Butterfly Knife, M9 Bayonet with the last two unticked; in the order M9 Bayonet, Butterfly Knife, Karambit it gives Karambit, M9 Bayonet, Butterfly Knife. A knife unticked by hand and a combo that exists keep their places.
2. Unit test: the ratings of the ticked knives (from `batchRows`) are the same before and after a pick that moves knives, with the order locked and not.
3. Unit test: removing the group leaves the order as it is.
4. Test (`BatchPage.test.tsx`): on the Case Hardened batch with M9 Bayonet moved to position 1 first, picking Test Pattern lists Karambit first, then M9 Bayonet and Butterfly Knife, in that order, unticked; the note and the live region say "moved to the end".
5. Test: picking Gold Gem with top rating 9 leaves Karambit at 9.00 and M9 Bayonet at 8.95, with Butterfly Knife moved to the end.
6. In `admin/`: `npm ci`, `npm run api:types:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` and `npm run check:bundle` exit 0. `admin/README.md` says unticked knives move to the end.

## Test plan

| Criterion | How it is checked |
| --- | --- |
| 1–3 | `admin/src/combos/batch.test.ts` |
| 4–5 | `admin/src/pages/BatchPage.test.tsx`, "a special pattern for the batch" |
| 6 | The commands below |

Commands, from `admin/`:

```bash
npm ci
npm run api:types:check
npm run lint
npm run typecheck
npm test
npm run build
npm run check:bundle
```

## Open questions

None. Answered by the owner on 2026-11-23: on Remove, the knives are ticked again at the end, as in Design.

## Implementation notes

| Criterion | Covered by |
| --- | --- |
| 1 | `admin/src/combos/batch.test.ts:101`, "moves the knives it unticks to the end, in their order"; `:107`, "leaves knives unticked by hand and combos that exist in their places" |
| 2 | `admin/src/combos/batch.test.ts:120`, "changes no rating with the order open" and "... locked" |
| 3 | `admin/src/combos/batch.test.ts:133`, "leaves the order as it is when the group is removed" |
| 4 | `admin/src/pages/BatchPage.test.tsx:658`, "moves the knives the group unticks to the end of the batch" |
| 5 | `admin/src/pages/BatchPage.test.tsx:672`, "changes no rating when it moves knives" |
| 6 | The commands below; `admin/README.md`, Special patterns |

- `applyGroup` returns the new `order` with the new `rows`. It keeps `order` as it was when nothing moves, so a batch that still follows the shared order keeps an empty `order`.
- R4 (a knife ticked again by hand stays where it is): `BatchPage.test.tsx:680`, "sends a knife ticked again by hand with any pattern", now checks Butterfly Knife stays last and is sent last.
- The announcement says "moved it" for one knife and "moved them" for more (R5 gives the plural).
- Browser check, 2026-11-23, in the built dashboard against a separate local stack: on the Gamma Doppler Phase 1 batch with top rating 9, picking Diamond Gem listed Karambit, Bayonet, Flip Knife and Gut Knife first (9.00, 8.95, 8.90, 8.85), then the six unticked knives in their earlier order, and announced "Unticked 6 knives with no Diamond Gem and moved them to the end: ...".
- Commands, from `admin/`, all exit 0: `npm ci`, `npm run api:types:check`, `npm run lint`, `npm run typecheck`, `npm test` (29 files, 436 tests), `npm run build`, `npm run check:bundle`.

## Audit

**Date:** 2026-11-23 · **Branch:** 025-batch-uncovered-last (on 024-batch-form) · **Commit:** 3eb733d
**Verdict:** Pass with follow-ups

| # | Criterion | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Test Pattern moves the unticked knives to the end in their order; hand-unticked knives and existing combos stay | Pass | `admin/src/combos/batch.test.ts:101`, `:107`; that the last two are unticked is asserted for the same pick at `:27`. `npm test` |
| 2 | No rating changes from the move, order open or locked | Pass | `batch.test.ts:120`: the moved order gives the ticked knives the same ratings as the same ticks in the old order |
| 3 | Remove leaves the order | Pass | `batch.test.ts:133` |
| 4 | Page: M9 Bayonet first, then Test Pattern: Karambit first, M9 Bayonet and Butterfly Knife after it, unticked; note and live region say "moved to the end" | Pass | `admin/src/pages/BatchPage.test.tsx:658` |
| 5 | Gold Gem, top 9: Karambit 9.00, M9 Bayonet 8.95, Butterfly Knife last | Pass | `BatchPage.test.tsx:672` |
| 6 | Commands exit 0; README updated | Pass | Table below; `admin/README.md`, Special patterns |

| Check | Command | Result |
| --- | --- | --- |
| Install | `npm ci` in `admin/`, after removing `node_modules` | Pass (exit 0) |
| API types | `npm run api:types:check` | Pass (exit 0) |
| Lint | `npm run lint` | Pass (exit 0) |
| Types | `npm run typecheck` | Pass (exit 0) |
| Tests | `npm test` | Pass (29 files, 436 tests) |
| Build | `npm run build` | Pass (exit 0) |
| Bundle | `npm run check:bundle` | Pass ("dist: bundle checks passed") |
| Dependencies | `npm audit --omit=dev`; `admin/package.json` and lockfile unchanged from 024-batch-form | Pass (0 vulnerabilities) |
| Secret scan | `gitleaks git` over the commits after 024-batch-form; `gitleaks dir .` | Pass (no leaks) |
| Public exposure | manual review of the diff and log against 024-batch-form: five commits by shb327, one line, no trailers; `.claude/` and `CLAUDE.md` ignored and untracked | Pass |
| Design conformance | manual review of `applyGroup` | Pass |

**Findings**

- (follow-up) Criterion 2 says the ratings are "the same before and after a pick"; the untick itself changes them (spec 024), so the test compares the moved order with the same ticks in the old order, which is what R2 means. The criterion's wording could say so.
- (follow-up) R6 (the moved order kept with the unsaved values) has no test of its own; it uses `BatchText.order`, whose keeping is tested by spec 017's "keeps the order, lock and step when the page is left and opened again".
- (follow-up) The note keeps saying "moved to the end" while the knives stay unticked, also after one of them is dragged elsewhere.
