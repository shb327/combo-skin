# 024: Batch form: untick uncovered knives, drag to order

**Status:** Implemented
<!-- Lifecycle: Draft → Approved → Implemented → Audited -->

**Section:** admin
**Branch:** 024-batch-form

## Summary

Two fixes to the batch form. Picking a special pattern for every knife now unticks the knives the group has no seed for, so a Diamond Gem batch no longer saves six "any pattern" combos by accident. The knives of a batch are put in order by dragging a handle, with the mouse, by touch or with the keyboard, instead of Up and Down buttons.

## Goals and non-goals

**Goals**

- Picking a batch-wide pattern group unticks every new knife the group does not cover, says why on the row and in the Every knife box, and announces it.
- Removing the group ticks again the knives the form unticked; picking another one decides again.
- A knife ticked again by hand stays ticked while that group stays picked.
- Batch knives are ordered by dragging a handle (mouse, touch, keyboard), and the Up and Down buttons go.

**Non-goals**

- The Knife order page (`/knife-order`): it keeps its Up, Down and position controls. Dragging there can be a later spec.
- Per-knife special patterns (a knife's own knife values) and combos that already exist: unchanged. A batch still never changes an existing combo's pattern (spec 020).
- Any API, schema or groups file change.
- Collapsing open rows while dragging.

## Context

- `admin/src/pages/BatchPage.tsx`: `BatchRows` renders the Every knife box (`ConditionsFields` with `special={{ choices: batchChoices(...), perKnife: true }}`) and one `BatchRow` per knife type in an `<ol aria-label="Knives">`. Each row's checkbox is "Include <knife>" (or "Update <knife>" for a combo that exists). While `orderLocked` is false and there are two or more rows, each row shows `OrderControls`. `move()` writes the new order to the draft, sets the page's polite live region to `movedText()` and restores focus with `useMoveFocus()`.
- `admin/src/combos/batch.ts`: `BatchText` (the draft: `knife`, `rows`, `order`, `orderLocked`, ...), `RowText.ticked`, `batchRows()`, `resolved()` and `rowPattern()`. A row with no `RowText` yet uses `defaultRow()`: ticked when the combo does not exist. `rowPattern()` gives "Blue Gem · 601", or "No Gold Gem for this knife" when the batch-wide group has no seed for the row's knife type and the row has no own knife values. Today the row stays ticked and is saved with any pattern and no group.
- `admin/src/combos/patterns.ts`: `batchChoices()` copies each group's seeds into the pick (`GroupPick.seeds`, by knife type slug). `rowKnife()` resolves a batch-wide pick to one knife type's seed. A knife type is covered when `pick.seeds[slug]` is defined.
- `admin/src/combos/fields.tsx`: `ConditionsFields` with `perKnife` shows "Each knife gets its own <group> seed." in place of the seeds field. `admin/src/combos/SpecialPattern.tsx`: the button, the list and the chip with Remove.
- `admin/src/combos/OrderControls.tsx`: Up, Down and a position `<select>`, shared by the batch and `admin/src/pages/KnifeOrderPage.tsx` (spec 017). `admin/src/combos/moves.ts`: `moveSlug()`, `movedText()`, `useMoveFocus()`.
- `admin/src/combos/ComboList.tsx`: drag to reorder a finish's combos (spec 017) with `@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0 and `@dnd-kit/utilities` 3.2.2 (MIT, already in `admin/package.json` and the lockfile): a handle button "Drag <combo>", mouse (5 px), touch (press and hold 250 ms) and keyboard (Space, Up, Down, Space, Escape) sensors, announcements and screen reader instructions.
- Spec 017, Design, "Batch order controls", rejected dragging batch rows because they hold many fields. This spec reverses that: only the handle starts a drag, so the fields stay as they are.
- Group coverage in `api/src/combo_api/patterns/groups.json`: Diamond Gem has seeds for 4 of the 10 knife types with Gamma Doppler Phase 1; Gold Gem for 18 of 20 with Case Hardened; Fire & Ice for 4 of 18 with Marble Fade.
- Tests: `admin/src/pages/BatchPage.test.tsx`, "the batch order" (Move buttons and position lists) and "a special pattern for the batch" (Gold Gem in the fake catalog has no Butterfly Knife seed). `admin/src/pages/FinishPage.test.tsx` has `layOutCombos()`, which gives each list item a box so dnd-kit can measure it in jsdom. `admin/src/combos/drafts.test.tsx` restores a batch after a session end.

## Requirements

**Untick uncovered knives**

- R1. A row is **eligible** when its combo does not exist yet, its knife type has a float range, and it has no own knife values.
- R2. Picking a batch-wide group unticks every ticked eligible row that the group does not cover, and marks it as unticked by the form. Rows the owner unticked by hand are not marked and are never ticked by the form.
- R3. Removing the batch-wide group ticks again every row the form unticked and clears every mark.
- R4. Switching to another group is Remove, then a new pick, as the Special pattern control works today, so R3 then R2 apply: rows the form unticked come back, and the new group unticks the ticked rows it does not cover, including one ticked by hand under the old group. Should the batch-wide group ever change in one step (a restored draft, a later control), the same holds: the result is that of removing the old group, then picking the new one.
- R5. Ticking a marked row by hand clears its mark. The row stays ticked while that group stays picked, shows "No <group> for this knife" as today, and is saved with any pattern and no group. Unticking it again is a hand untick: removing the group does not tick it.
- R6. A row the form unticked shows "Unticked: no <group> for this knife" next to its name, and its checkbox is described by that text.
- R7. While some rows are unticked by the form, the Every knife box shows, under "Each knife gets its own <group> seed.", "<n> knife/knives with no <group> unticked: <names in batch order>. Tick one to include it with any pattern."
- R8. Each pick, switch or removal that changes ticks announces it once in the page's polite live region: "Unticked 6 knives with no Diamond Gem: Bayonet, Bowie Knife, ...", and "Ticked again: Butterfly Knife." when rows come back.
- R9. Setting or clearing a row's own knife values, the save refusal reload of spec 010 and the fill do not tick or untick anything beyond what they do today. The fill skips unticked rows as it does now.
- R10. The marks are kept with the batch's other unsaved values, so leaving the page or a session end and logging in again brings them back (in memory only, as today).

**Drag to order**

- R11. While the order is not locked and there are two or more rows, each row starts with a handle button "Drag <knife>". Dragging it with the mouse, or by press and hold on a touch screen, moves the row. The page scrolls while dragging near the top or bottom edge.
- R12. With the keyboard, Space on the handle picks the row up, Up and Down move it one place, Space drops it, and Escape cancels and leaves the order as it was. Focus stays on the handle after a drop or cancel.
- R13. A drop changes this batch's order only, as Up and Down did. The fill follows the new order at once. Nothing is sent to the API.
- R14. A screen reader hears instructions on the handle, and announcements on pick up, move, drop and cancel that name the knife and its position: "Karambit moved to position 3."
- R15. The Up and Down buttons are gone from the batch. Each row keeps its position list ("Position of <knife>"), next to the handle, with the same behaviour and announcement as today.
- R16. "Refill from top" hides the handles and position lists, and "Change order" shows them again, as today.
- R17. Fields, checkboxes, buttons and pickers inside a row never start a drag. Typing, selecting text and clicking in them work as before.
- R18. The Knife order page is unchanged.

## Design

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| When rows are unticked | Only when the batch-wide group changes: picked, switched or removed. A pure function in `batch.ts`, `applyGroup(rows, text, nextKnife)`, returns the next `BatchText` and the announcement. `BatchRows` calls it from the Every knife `onChange` when `knife.group?.slug` changes, and otherwise sets the values as today | Unticking on every render while a group is picked: a knife could never be ticked again by hand. Hiding uncovered rows: the owner could not include one on purpose, and the list would change length under them |
| Which rows | Eligible rows only (R1). A combo that exists keeps its pattern in a batch (spec 020), so the group does not decide for it. A row with own knife values has its own pattern | Every row: unticks updates the owner chose for their rating, which a group does not touch |
| The mark | `RowText.untickedFor?: string`, the slug of the group that unticked the row. Set by `applyGroup`, cleared by a hand tick and by removing the group | A list of slugs on `BatchText`: one more thing to keep in step with `rows`. No mark at all: removing the group could not tell the form's unticks from the owner's |
| Removing the group | Every row the form unticked is ticked again: the batch is back to where it was before the pick | Leaving them unticked: Remove would not undo the pick, and a later pick of a wider group would leave knives out for no reason |
| A hand tick, then another group | The hand tick holds while its group stays picked. After Remove and a new pick, the new group decides again: a ticked row it does not cover is unticked | Remembering hand ticks across picks: the tick was made knowing "No Gold Gem for this knife"; under another group the form cannot know it still holds, and the goal is no combo by accident. The owner ticks it again in one click |
| Showing why | On the row, "Unticked: no Diamond Gem for this knife" (R6), linked to the checkbox with `aria-describedby`. In the Every knife box, the count and names (R7). One live region message per change (R8) | A dialog asking first: one more click on every pick, for something that is easy to undo. Only the live region: sighted owners miss it |
| Text on a ticked uncovered row | Unchanged: "No Gold Gem for this knife" | A new text: the row can only be ticked by hand now, so the owner already knows it takes any pattern |
| Drag library | The `@dnd-kit` packages already used by the finish list (spec 017): `@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0, `@dnd-kit/utilities` 3.2.2. No new package | Native HTML drag and drop: no touch or keyboard. `@dnd-kit/modifiers` to keep the drag vertical: a new package for a nicety; the sortable list strategy already moves rows only up and down |
| Sensors and handle | The same as `ComboList`: a handle button with the sortable attributes and listeners, mouse with a 5 px activation distance, touch with press and hold 250 ms (tolerance 5 px), keyboard with `sortableKeyboardCoordinates`, `closestCenter`. The sensor setup moves into a shared hook in `src/combos/` used by both lists | Dragging the whole row: every field would become a drag start (R17). Copying the setup: the two lists would drift |
| Announcements | dnd-kit's announcements and instructions, naming knives: "Picked up Karambit.", "Karambit is over position 2, M9 Bayonet.", drop: `movedText()` ("Karambit moved to position 3."), "Moving Karambit was cancelled.", or "Karambit was dropped in its place." The page's own live region is not also set on a drag, so nothing is read twice. Instructions: "To move a knife, press Space on its handle. Use the Up and Down keys to move it, Space to drop it, or Escape to cancel." | The page's live region only: dnd-kit's announcements then say nothing useful about pick up and cancel |
| Up and Down | Removed from the batch. The keyboard drag does the same one place at a time | Keeping them: the clutter the owner asked to remove, and two ways to do one thing |
| Position list | Kept, next to the handle. It is the single-pointer way to reorder that does not need dragging (WCAG 2.2, 2.5.7 Dragging Movements), and the quick way for long moves: 1 to 20 is one choice instead of 19 key presses or a long drag over tall rows. `OrderControls` is split so the position list is one component used by the batch and the Knife order page | Removing it too: dragging becomes the only pointer way, which fails 2.5.7, and long moves get slow. A "Move to top" button: covers only one case |
| Tall rows | Rows keep their size while dragging, own values open or not; dnd-kit's auto-scroll moves the page | Collapsing open rows on pick up: their fields would lose focus and layout would jump |
| Tests in jsdom | `layOutCombos()` moves to `src/test/` as a shared helper that gives each row of a list a box, matched on the list's direct children so nested lists inside a row (the special pattern list, error lists) are not counted. Keyboard drags are tested in jsdom; mouse and touch by hand (as in spec 017) | A browser test runner for two checks: the admin has none |

## API / data model

None in the API. In the admin's unsaved batch values (`BatchText`, memory only), `RowText` gains one optional field:

```ts
export interface RowText {
  // ... as today
  /** Unticked by the form when this batch-wide group was picked: the group's slug. */
  untickedFor?: string
}
```

## Security

- S1. No API, schema or permission change: the batch is saved with `POST /admin/batches` as today, by an authenticated admin.
- S2. No new dependency. `npm audit --omit=dev` in `admin/` reports nothing new.
- S3. The marks and order stay in the in-memory unsaved changes store; nothing is written to browser storage (the lint guard rails in `src/lint.test.ts` still pass).
- S4. The admin Content Security Policy is unchanged (`style-src 'self'`); `npm run check:bundle` passes.

## Acceptance criteria

1. Test: on the fake catalog's Case Hardened batch with Gold Gem picked, Butterfly Knife is unticked and shows "Unticked: no Gold Gem for this knife"; its checkbox's description is that text; Karambit and M9 Bayonet stay ticked; the button reads "Save 2 as drafts"; the Every knife box shows "1 knife with no Gold Gem unticked: Butterfly Knife. Tick one to include it with any pattern."; the live region says "Unticked 1 knife with no Gold Gem: Butterfly Knife."
2. Test: after criterion 1, ticking Butterfly Knife by hand shows "No Gold Gem for this knife", and Save sends it with no seeds and no group, as in spec 020.
3. Test: after criterion 1, removing Gold Gem ticks Butterfly Knife again, and the live region says "Ticked again: Butterfly Knife."; picking Blue Gem then leaves all three ticked, Butterfly Knife with "Blue Gem · 670". A row unticked by hand before the pick stays unticked through pick and removal.
4. Test: after criterion 2 (Butterfly Knife ticked by hand under Gold Gem), Remove then Gold Gem again unticks it and marks it again.
5. Test: a combo that exists ("Update Karambit", ticked) and a row with own knife values are not unticked by a group that does not cover them.
6. Unit tests of `applyGroup` in `batch.test.ts`: pick, removal, a change from one group to another in one step (the same result as removal then pick), and no change when the group slug is the same (seeds or floats typed in the Every knife box).
7. Test: a batch with a group picked and a row unticked by the form, after a session end and logging in again, has the same ticks, marks and texts (`drafts.test.tsx`).
8. Test, keyboard drag with rows laid out by the shared helper: focus "Drag M9 Bayonet", Space, Up, Up, Space puts M9 Bayonet first, the fill follows (9.50, 9.45, 9.40 from the top), "M9 Bayonet moved to position 1." is announced, focus is on the handle, and no `PUT /admin/knife-order` is sent.
9. Test: Space, Down, Escape leaves the order as it was and announces the cancel.
10. Test: no button named "Move <knife> up" or "Move <knife> down" is in the batch; "Position of <knife>" works as today; after "Refill from top" no handle or position list is shown, and "Change order" brings them back.
11. Test: the Knife order page tests pass unchanged, and it still has Up, Down and position controls.
12. Manual, in the built dashboard (`npm run preview`) against a local stack: on a Gamma Doppler Phase 1 batch, picking Diamond Gem unticks the six knives without a seed and the page says so; a mouse drag of the last knife to the top with one row's own values open scrolls the page and drops it there; at 375 px wide with touch emulation, press and hold on a handle then move reorders, and a tap in a rating field does not start a drag; with a screen reader, the handle reads its instructions and a keyboard drag is announced; no CSP violation in the console.
13. In `admin/`: `npm ci`, `npm run api:types:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` and `npm run check:bundle` exit 0. `admin/README.md` describes the untick on a group pick and dragging in a batch.

## Test plan

| Criterion | How it is checked |
| --- | --- |
| 1–5 | `admin/src/pages/BatchPage.test.tsx`, "a special pattern for the batch" (Gold Gem has no Butterfly Knife seed in `src/test/fakeCatalog.ts`). The existing test "says which knife the group does not cover" changes: it ticks Butterfly Knife by hand first |
| 6 | `admin/src/combos/batch.test.ts` (new) |
| 7 | `admin/src/combos/drafts.test.tsx`, "comes back in a batch after the session ends" |
| 8–10 | `admin/src/pages/BatchPage.test.tsx`, "the batch order": the Move button steps become keyboard drags; the position list steps stay |
| 11 | `admin/src/pages/KnifeOrderPage.test.tsx`, unchanged |
| 12 | Manual, steps as written; results recorded in Implementation notes |
| 13 | The commands below |

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

None. Answered by the owner on 2026-11-23, as recommended:

- Position list: kept in the batch, next to the handle.
- A hand tick holds while its group stays picked; after Remove and a new pick, the new group decides again.
- No new package: the `@dnd-kit` packages of spec 017, without `@dnd-kit/modifiers`.
- The Knife order page stays out of scope; a drag handle there can be a later spec.

## Implementation notes

**Criteria and tests**

| Criterion | Covered by |
| --- | --- |
| 1 | `admin/src/pages/BatchPage.test.tsx:640`, "unticks the knife the group does not cover, and says why" |
| 2 | `admin/src/pages/BatchPage.test.tsx:658`, "sends a knife ticked again by hand with any pattern" |
| 3 | `admin/src/pages/BatchPage.test.tsx:675`, "ticks the knife again when the group is removed, and another group decides again"; `:690`, "never ticks a knife unticked by hand" |
| 4 | `admin/src/pages/BatchPage.test.tsx:699`, "unticks a knife ticked by hand again after the group is removed and picked again" |
| 5 | `admin/src/pages/BatchPage.test.tsx:710`, "leaves a combo that exists and a knife with own knife values ticked" |
| 6 | `admin/src/combos/batch.test.ts:27`, `:40`, `:50`, `:60`, `:71`, `:87` |
| 7 | `admin/src/combos/drafts.test.tsx:251`, "comes back in a batch after the session ends": the unticked knife, its text, the note and its mark (Remove ticks it again) |
| 8 | `admin/src/pages/BatchPage.test.tsx:267`, "moves a knife by dragging its handle with the keyboard, and the fill follows" |
| 9 | `admin/src/pages/BatchPage.test.tsx:287`, "leaves the order as it was when a drag is cancelled" |
| 10 | `admin/src/pages/BatchPage.test.tsx:247`, "reorders this batch only, and the fill follows the order" (no Move buttons, the position list); `:300`, "locks the order after Refill from top until Change order, and saves in the batch order" |
| 11 | `admin/src/pages/KnifeOrderPage.test.tsx`, unchanged and passing |
| 12 | Manual, below |
| 13 | The commands below; `admin/README.md`, Batch and Special patterns |

**Manual check (criterion 12), 2026-11-23.** A separate local stack on other ports, the dashboard built against it and served with `vite preview`, in Chrome:

- Gamma Doppler Phase 1 batch, Diamond Gem picked: Butterfly Knife, M9 Bayonet, Huntsman Knife, Falchion Knife, Bowie Knife and Shadow Daggers unticked, each with "Unticked: no Diamond Gem for this knife" as its checkbox's description; the Knife box listed the six; the live region said "Unticked 6 knives with no Diamond Gem: ..."; the button read "Save 4 as drafts".
- Mouse, with Karambit's own values open: Shadow Daggers dragged from last to first; the page scrolled from 1550 px towards the top while the pointer was held at the top edge, and the fill followed.
- 375 px wide with touch events: press and hold 400 ms on Karambit's handle, then move: it moved one place down. A touch in a rating field, moved 50 px, started no drag. No sideways scroll.
- Keyboard: Space, Down, Down, Down, Space at about 150 ms per key moved a knife three places, announced "Butterfly Knife moved to position 4." and kept focus on the handle; Escape cancelled with "Moving Karambit was cancelled.". The handle reads the instructions through `aria-describedby`, with role description "sortable".
- No CSP violation in the console; the page's policy keeps `style-src 'self'`. The only console error is the 401 of the session check on the login page.

**Deviation (2026-11-23), to confirm with the owner.** Design, "Sensors and handle", says the batch uses the same sensors as the finish list. In the browser, with batch rows that are much taller than combo rows, a second Down pressed within about 150 ms of the first was lost: dnd-kit's keyboard sensor scrolls smoothly after each key, and a key pressed during that scroll is measured against the old place. The batch's keyboard sensor now scrolls at once (`scrollBehavior: 'auto'`, an option of `useDragSensors`); the finish list keeps the smooth scroll. Keys pressed within a few milliseconds of picking up are still ignored while dnd-kit measures the list, which no person can type.

**Other notes**

- `RowText.untickedFor` is cleared by any tick or untick by hand, and ignored for a combo that exists (a row that became "already exists" after a refused save is not ticked again).
- The note under the group is part of `ConditionsFields` (`special.note`), so it sits in the Knife box under "Each knife gets its own ... seed."
- dnd-kit's live region keeps only its latest message; on a keyboard pick up, the "in its place" message follows "Picked up ..." at once, so the test checks the drop and cancel messages.
- Follow-up: the Knife order page could get the same handle (a later spec, as answered).

**Commands**, from `admin/`, all exit 0: `npm ci`, `npm run api:types:check`, `npm run lint`, `npm run typecheck`, `npm test` (29 files, 429 tests), `npm run build`, `npm run check:bundle` ("dist: bundle checks passed"). `npm audit --omit=dev`: 0 vulnerabilities.

## Audit

Filled in by the audit: one line per acceptance criterion (pass or fail, with evidence), the results of lint, tests, build and the secret scan, and a verdict of Pass, Pass with follow-ups, or Fail.
