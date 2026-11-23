# 025: Batch: uncovered knives go to the end

**Status:** Draft
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

- On Remove, the knives are ticked again at the end, not where they were (Design, On Remove). Recommended as written; say if Remove should put them back.

## Implementation notes

Filled in during implementation: deviations from the design and why, follow-ups discovered, and which test covers each acceptance criterion.

## Audit

Filled in by the audit: one line per acceptance criterion (pass or fail, with evidence), the results of lint, tests, build and the secret scan, and a verdict of Pass, Pass with follow-ups, or Fail.
