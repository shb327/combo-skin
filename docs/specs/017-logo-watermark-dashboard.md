# 017: Logo watermark, dashboard fixes and image clicks

**Status:** Implemented
<!-- Lifecycle: Draft → Approved → Implemented → Audited -->

**Section:** api, admin, website
**Branch:** 017-logo-watermark-dashboard

## Summary

Screenshots get the Combo Skin logo as their watermark instead of the text mark of spec 015. The dashboard gets the fixes the owner found while entering combos: an own rating in a batch that moves other knives, a clearer way to the Screenshots page, a knife order and fill step per batch, and a finish's combo list that keeps its place, edits ratings in place and reorders combos by dragging. On the website, clicks on images inside links no longer get lost.

## Goals and non-goals

**Goals**

- Part A (api): the logo watermark, a raised watermark revision, and the Montserrat font removed from the API.
- Part B (admin): the own rating fix, Screenshots in the navigation, a per-batch knife order and step, and the finish list's scroll position, rating editing and drag to reorder.
- Part C (website): every image inside a link or button takes the first click.

**Non-goals**

- View in 3D and the game indexes on combo items (spec 016), and the rest of the website.
- The viewer and the screenshot worker; re-rendering any screenshot (`rebuild` remakes versions from the kept originals).
- Deployment; running `rebuild` (the owner runs it after the merge).
- Any API route, field or migration (Design, API change).
- Follow-ups of earlier specs other than those above.

## Context

**Watermark** (spec 015)

- `api/src/combo_api/screenshots/images.py`: `watermark()` draws `combo.skin` in Montserrat SemiBold, white at alpha 180 over a blurred black shadow, font size `max(16, round(0.022 × width))`, `round(0.02 × width)` from the right and bottom; `versions()` watermarks the 640, 1280 and 1920 versions; `WATERMARK_REVISION = 1`. `upload.py` and `commands.py` (`rebuild`) record the revision.
- `api/src/combo_api/screenshots/fonts/Montserrat-SemiBold.ttf` is used only by `images.py`. `THIRD_PARTY_NOTICES.md` has two Montserrat sections: the admin's bundled `@fontsource/montserrat` and the API's TrueType file. The website loads Montserrat from Google Fonts and bundles no font file.
- `api/tests/screenshots/test_watermark.py` checks the text mark's box, its light text over a dark shadow, and that it grows with the width. `api/README.md` (Screenshots) describes the mark.
- `website/src/assets/logo.svg` is the site's logo (522 by 182, two colours).

**Batch** (specs 010, 012)

- `admin/src/combos/fill.ts`: `fillRatings(rows, top)` with `STEP = 5` hundredths. A row typed by hand sets its own value and the rows below follow it. A row with an own rating is filled "as if never typed in": the code ignores the row's typed value, so the fill passes through it with the value from the top instead.
- `admin/src/combos/batch.ts`: `BatchText` (top rating, batch-wide values, rows by knife type slug) and `batchRows()`, rows in the candidates' order, which is the shared knife order from the API. `admin/src/pages/BatchPage.tsx`: "Every knife" with the top rating, "Refill from top" (clears every "set by hand" flag), the fixed text "Each next knife gets 0.05 less, never below 0.", and each row's rating box beside its "Own values" button. The batch's values are a draft in the in-memory drafts store (`src/combos/useDrafts.ts`), kept across pages and a session end, lost on reload or after saving.
- `admin/src/pages/KnifeOrderPage.tsx`: the shared order, with Move up, Move down and a position list per row, and a live region.

**Reproduced own rating bug.** With the fake catalog, top rating 8.49: typing 9 in Butterfly Knife's row gives M9 Bayonet 8.95. "Set own rating for Butterfly Knife" then drops M9 Bayonet to 8.39, and clearing the own rating brings it back to 8.95. Changing the own rating's value after it is set does not move other rows. A second way to see other rows move: once "Own values" is open, the own rating only applies after "Set own rating"; until then the box beside "Own values" is the row's ordinary rating, and a value typed there carries on down by spec 010's design.

**Home and navigation** (specs 010, 012, 015)

- `admin/src/pages/HomePage.tsx`: the Screenshots section's link reads "Change the default agent" and opens `/screenshots`, which also holds workers and failed screenshots. `admin/src/components/Layout.tsx`: navigation Home, By gloves, By knife; `src/App.test.tsx` "shell" checks those three.

**Finish combo list** (specs 010, 015)

- `admin/src/combos/ComboList.tsx`: status filter, knife finish filter (glove side) and sort (Rating, Last change) in component state, lost when the page is left. Links to `/combos/<id>` carry `state.from` with the path only. The rating is plain text.
- `admin/src/pages/EditComboPage.tsx`: Save stays on the page; Back and Delete return to `from`. Saving sends `PUT /admin/combos/{id}` with `version`, rating, description, both items' conditions and `screenshot_agent`; 409 `version_conflict` shows "Theirs" and "Yours".
- `admin/src/main.tsx` uses `BrowserRouter` (no data router, so no `ScrollRestoration`). Pages scroll the window. Combo lists are refetched when a page mounts (`staleTime: 0`). Returning from an edit page renders the list at the edit page's scroll position, usually the top.
- Ratings are `Numeric(4, 2)`: hundredths from 0 to 10.

**Website image clicks** (checked on the running site, 2026-11-08)

- `website/src/components/Hero.tsx`: "Search by gloves" and "Search by knives" are `<Link>`s holding a Swiper carousel (autoplay, `allowTouchMove: false`, loop, scaled on hover); its images have no `draggable` attribute. `website/src/components/ItemCard.tsx`: the same carousel on every card of `/gloves` and `/knives` (`SearchGloves.tsx`, `SearchKnives.tsx`), images `draggable={false}`.
- Cause, read in Swiper 12.2 and reproduced in the browser: with `allowTouchMove: false`, any pointer move between press and release, even 1 px, sets `allowClick = false`; Swiper's capture-phase click listener (`preventClicks`, on by default) then calls `preventDefault()` on the click, so the router's `Link` does not navigate. Trackpad presses often move a pixel. On the home cards and the gloves grid, a click with a 1 px move stayed on the page every time; a click without one navigated; the same moved click navigated once `preventClicks` and `preventClicksPropagation` were off. Hero images can also start a native image drag.
- Other clickable images (`FinishGrid.tsx`, the logo in `AppBar.tsx`) have `draggable={false}` and no carousel. Combo cards' images are not links.

**Files spec 016 also changes** (on its own branch): `api/README.md`, `admin/src/test/fakeCatalog.ts`, `website/src/test/setup.ts`, `website/src/components/ComboPictures.tsx`, `website/src/pages/Combos.tsx`, `website/README.md`. This spec may touch the first three; it needs no change to `ComboPictures.tsx`, `Combos.tsx`, `schemas.py`, `openapi.json` or either app's `schema.d.ts`. Whichever branch merges second rebases.

**Checks today**: `api/` uses ruff, mypy and pytest; `admin/` and `website/` use ESLint, Vitest with Testing Library and fake APIs; the admin also has `typecheck` and `check:bundle`. No app has browser tests.

## Requirements

### Part A: watermark

- R1. Every public version carries the Combo Skin logo, all white, at 60% opacity, with no shadow or outline, in the bottom-right corner, in place of the text mark.
- R2. On a 1920-wide image the logo is 220 px wide, its box 40 px from the right edge and 32 px from the bottom edge; on the 1280 and 640 versions all three scale with the width.
- R3. `WATERMARK_REVISION` is 2. Running `rebuild` remakes every version with the logo from the kept originals.
- R4. The API no longer contains the Montserrat font file or its notice; the admin's Montserrat notice stays.

### Part B: dashboard

- R5. Setting, changing or clearing a batch row's own rating changes only that row's rating. Every other row keeps the rating it had.
- R5a. A row's own rating is turned on with an "Own rating" button beside the row's rating box, not inside "Own values". From that click on, the row has one rating box, the own rating, and typing in it moves no other row. Turning it off returns the box to the row's previous rating.
- R6. Home's Screenshots section links to the Screenshots page with the label "Configure". The navigation reads Home, By gloves, By knife, Screenshots.
- R7. A batch can be reordered for that batch only, until "Refill from top" is clicked; the fill follows the batch's order. The shared knife order is not changed and stays the starting order of new batches.
- R8. After "Refill from top" the order is locked; "Change order" unlocks it, and the next "Refill from top" locks it again.
- R9. "Every knife" has a Step field, 0.05 by default: each next knife following the fill gets that much less, never below 0.
- R10. The batch's order, lock and step are kept with its other unsaved values, in the same tab, until it is saved or discarded.
- R11. Returning to a finish's combo list from a combo's edit page, by the page's links or the browser's Back, shows the list with the same filters, sort and scroll position.
- R12. Each combo's rating can be edited in the list and saved with a Save button beside it, without opening the combo.
- R13. While the list is sorted by rating, a combo can be dragged to a new place; it gets a rating between its new neighbours and nothing else changes. Dragging also works with the keyboard and on a touch screen.

### Part C: website

- R14. Every image inside a link or button on the website navigates or acts on the first click, also when the pointer moves a few pixels during the click.

## Design

### Part A: watermark

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| Logo file | `api/src/combo_api/screenshots/logo-white.png`, 1044 by 364, RGBA: `website/src/assets/logo.svg` with both colours set to `#FFFFFF`, rendered at twice its size, as the owner approved. Committed next to `images.py`; the Docker image already copies `src/` | Rendering the SVG in the API: needs an SVG renderer for one fixed picture. A bitmap per size: three files to keep in step |
| Drawing | The logo's alpha channel is resized to the mark's size with Lanczos and multiplied by 0.6; a white layer with that alpha is composited over the version. Only the alpha is resized, so no dark fringe comes from transparent pixels' colour | Resizing the RGBA image and lowering its opacity: transparent pixels' colour can bleed into the edges. A shadow, as spec 015 had: the owner chose no shadow |
| Size and place | Width `round(220 × W / 1920)`, height in the logo's proportion, rounded; right margin `round(40 × W / 1920)`, bottom margin `round(32 × W / 1920)`, measured to the logo image's box (its transparent edge included). 1920: 220 by 77 at x 1660, y 971; 1280: 147 by 51 at x 1106, y 648; 640: 73 by 25 at x 554, y 324 | Margins as a share of the height: the versions have the same aspect ratio, so the result is the same with one rule fewer |
| Revision | `WATERMARK_REVISION = 2`; versions made after the merge carry the logo; the owner runs `rebuild` for the rest | Remaking versions on request: spec 015 rejected it |
| Font | `screenshots/fonts/` and the API's Montserrat section of `THIRD_PARTY_NOTICES.md` are removed. The admin's section stays (it bundles `@fontsource/montserrat`); the website bundles no font | Keeping the file: dead weight with a licence notice to keep |

A preview of the logo on a real render, at 220 px, 60% opacity, 40 px from the right and 32 px from the bottom, was approved by the owner on 2026-11-08. It is not committed.

### Part B: dashboard

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| Own rating in the fill | `fillRatings` treats a row with an own rating exactly as it would without one, typed value included, and only shows the own rating in that row: "the value the row would otherwise have had" of spec 010's design. Clearing it shows the row's previous value again | Treating the row as never typed (today): setting or clearing the own rating moves the rows below. Clearing the typed value when the own rating is set: Clear could not bring it back |
| Own rating control (owner's answer, 2026-11-08) | The owner typed the knife's rating into the box beside "Own values" after opening it, expecting an own rating, and the knives below moved. Each ticked row gets an "Own rating" toggle button beside its rating box (`aria-pressed`, name "Own rating for <knife>"). Pressing it copies the shown rating into the own rating; the row's box becomes the own rating ("Rating, <knife> only"), keeps focus, and is marked "Own rating, not passed on". Pressing it again returns the box to the row's previous rating. "Own values" no longer holds a rating, and its count leaves the rating out. Spec 010's R12 and criterion 17 change to this control | Keeping "Set own rating" inside "Own values" with a second rating box: the owner found it unclear which box is which. A hint under the ordinary box: still two boxes. Every typed rating staying in its row: spec 010 keeps typed ratings carrying on down, which is how a larger step is made part way down |
| Screenshots link and navigation | Home's link reads "Configure"; a fourth navigation entry "Screenshots" after By knife; Home keeps its Screenshots section with the counts. Spec 010's criterion 37 and `App.test.tsx` "shell" change to four links | "Settings": the page is about screenshots only. Removing the Home section: it shows the counts per state |
| Batch order controls | Before "Refill from top", each row has Move up, Move down and a position list, the controls of the Knife order page, moved into a shared component used by both pages, with the same live region text. The fill follows the order at once, as it follows ticks today | Dragging rows: the batch rows hold many fields and own values; buttons work the same with mouse, keyboard and touch |
| Batch order lock | A new batch, and a batch until its first "Refill from top", shows the order controls. "Refill from top" hides them and shows "Change order"; "Change order" shows them again until the next "Refill from top". Save works in either state and sends rows in the batch's order | Locking after the first rating is typed: the owner asked for "Refill from top" |
| Batch order storage | In the batch's draft (`BatchText.order`, slugs; `orderLocked`; `step`), so it is kept like the other unsaved values. Knife types missing from the stored order (a catalog change) are added in the shared order's place, at the end | Saving it in the browser's storage or the API: a batch order is used once, for one batch |
| Step field | A text field "Step", 0.05 by default, parsed like a rating, from 0.01 to 1.00. Up and Down step it by 0.01. An invalid step shows its message at the field; rows following the fill then show no rating, and Save is blocked while an included row follows the fill, as for a missing top rating. The note becomes "Each next knife gets the step less, never below 0." | A fixed 0.05: the owner asked for a field. Allowing 0: equal ratings sort by id, not by knife order |
| List view state | Sort, status filter and knife finish filter live in the URL's query (`?sort=updated&status=draft&knife=doppler-ruby`; defaults left out). Links to the edit page carry the path with its query in `state.from`. The window's scroll position is kept in memory per list URL when a combo link is followed, and restored once the list has rendered its combos | Component state (today): lost on every visit. Keeping filters in memory only: the URL is how Back and the edit page's link return, and survives a reload |
| Inline rating (owner's answer, 2026-11-08) | Each combo's rating is a rating field (spec 010's input, arrows by 0.05) with a Save button (name "Save rating for <combo>"), enabled once the value differs from the stored one. Save, or Enter in the field, sends `PUT /admin/combos/{id}` built from the list's copy of the combo (version, description, conditions and agent unchanged). Leaving the field saves nothing: a changed field keeps its value and is marked "Not saved". Escape restores the stored value. While saving the button reads "Saving"; then "Saved" shows for a few seconds. An invalid value shows the field's message and sends nothing. A 409 `version_conflict` refetches the list and shows, under the field, who changed the combo and when with their rating, and "Use theirs" and "Keep mine" ("Keep mine" keeps the typed value, and the next Save sends it with the new version). Other errors show the edit page's messages under the field. Unsaved values are kept across sort and filter changes and dropped when the page is left | Saving on Enter or when the field loses focus: the owner chose a Save button. Saving on every keystroke: half-typed values would be saved |
| Order after an edit | An edited combo stays in its place while the page is open; the list shows "Order changed. Sort again", which re-sorts. Leaving the page, or changing the sort or a filter, also re-sorts. Tab goes from one combo's rating to its Save button and then to the next combo's rating, in the shown order | Re-sorting at once: the row would jump away from the pointer and from the next rating to edit |
| Drag | Only with the Rating sort; a drag handle per combo, hidden with the Last change sort. Filters may be on; the new rating is placed between the combos shown. Rating in hundredths: between neighbours `a > b`, `floor((a + b) / 2)` when `a − b ≥ 2` (8.79 and 8.62 give 8.70). Dropped first: the first combo's rating + 0.05, at most 10.00; dropped last: the last combo's rating − 0.05, at least 0.00. When no rating fits (neighbours 8.62 and 8.61 or equal, or the first is 10.00, or the last 0.00), the combo goes back to its place and the list says "No rating fits between 8.62 and 8.61. Change a rating first." Dropped in its own place: nothing is sent. A drop saves at once, with no Save click, using the inline rating's request and conflict handling; the combo shows in its new place while saving and goes back on an error | Moving neighbours to make room: changes other combos. Three decimals: an API, database and public change for a rare case. Midpoint at the ends (between the first and 10.00): large jumps |
| Drag library | `@dnd-kit/core` 6.3.1 and `@dnd-kit/sortable` 10.0.0 (MIT): pointer, touch (press and hold on the handle) and keyboard (Space to pick up, Up and Down, Space to drop, Escape to cancel) with screen reader announcements. They set styles through the DOM, which the admin CSP (`style-src 'self'`) allows; `check:bundle` must still pass. The rating calculation is a pure function with its own tests | Native HTML drag and drop: no touch or keyboard support. Own pointer code: auto-scroll, touch and keyboard to write and test by hand. Move up and Move down buttons as on the knife order: one saved rating per step |
| API change | None. Inline ratings and drops use the existing `PUT /admin/combos/{id}` with `version`, which refuses a stale copy rather than overwriting another admin's change | A rating-only route: one fewer field set to send, but the full `PUT` with a version is already safe |

### Part C: website

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| Carousel clicks | Both carousels (`Hero.tsx`, `ItemCard.tsx`) set `preventClicks: false` and `preventClicksPropagation: false`, through one shared constant. They never swipe (`allowTouchMove: false`), so Swiper's click blocking has nothing to protect | `simulateTouch: false`: fixes mouse and trackpad, but a finger that moves slightly still loses the tap. `pointer-events: none` on the carousel: also works, but hides the cause. Replacing Swiper: a larger change for the same result |
| Image dragging | Every image inside a link or button has `draggable={false}` (the hero's images are the ones missing it) | Leaving native drag on: a press that moves a few pixels can start dragging the image instead of clicking |
| Test | A Vitest test renders Home, `/gloves` and `/knives`, and on an image of each card sends pointer down, a pointer move of 1 px, pointer up and click, then expects the new path; it fails before the fix. A second test fails when an image inside a link or button on those pages, a finish page or a combo page lacks `draggable="false"` | A browser test runner for one check: the website has none, and the jsdom test reproduces Swiper's handling |

### Size

One spec, one branch and one review, built in the order A, C, B. Parts A and C are small; Part B is most of the work.

## API / data model

None. No route, field, setting or migration changes. Only the watermark's pixels and `WATERMARK_REVISION` change in the API.

The admin's batch draft (`BatchText`, in memory) gains `order` (knife type slugs), `orderLocked` (boolean) and `step` (text, default `"0.05"`).

## Security

- S1. Inline rating edits and drops use only `PUT /admin/combos/{id}` through `src/api/client.ts`, with the session, the CSRF token and the combo's `version`; a stale version is refused (409), never overwritten.
- S2. No new route; the route guard tests stay unchanged and pass.
- S3. The admin CSP is unchanged; `check:bundle` passes with the new dependencies, which make no network requests.
- S4. The watermark reads only the committed logo file; it takes no input from requests.
- S5. Workflows keep read-only permissions, SHA-pinned actions and no secrets.

## Acceptance criteria

API checks run in `api/` with pytest; admin checks in `admin/` and website checks in `website/` with Vitest and the fake APIs.

**Part A: watermark**

1. On a uniform grey (128) image of 1920 by 1080, every pixel changed by `watermark()` lies inside the box 1660 to 1880 by 971 to 1048, and none closer than 40 px to the right or 32 px to the bottom; at 1280 by 720, inside 1106 to 1253 by 648 to 699; at 640 by 360, inside 554 to 627 by 324 to 349.
2. In that 1920 test, no pixel is darker than the grey, and each pixel's increase equals `0.6 × a × (255 − 128) / 255` within 2, where `a` is the committed logo's alpha resized to 220 by 77 with Lanczos.
3. A test opens `logo-white.png`: 1044 by 364, RGBA, every pixel with alpha above 0 is (255, 255, 255).
4. `WATERMARK_REVISION` is 2, and `rebuild`'s existing tests pass. No `.ttf` file is under `api/`; `THIRD_PARTY_NOTICES.md` has one Montserrat section, the admin's; `api/README.md` describes the logo mark and how the logo file was made.
5. Manual: a 1920 by 1080 stand-in PNG sent through a worker claim (as in spec 015 criterion 25) gives a 1920 version whose mark matches the approved preview's size, place and opacity, and 1280 and 640 versions with the scaled mark.

**Part B: dashboard**

6. `fill.test.ts`: for rows mixing filled, typed, unticked and invalid rows, adding an own rating to any one row, changing it and clearing it leave every other row's rating unchanged; spec 010's fill cases still pass.
7. `BatchPage.test.tsx`: top rating 8.49; Butterfly Knife typed 9, M9 Bayonet shows 8.95; pressing "Own rating for Butterfly Knife" leaves M9 Bayonet at 8.95, the button has `aria-pressed="true"`, and Butterfly Knife's row has one rating box, "Rating, Butterfly Knife only", showing 9.00 and focused; typing 7 there shows 7.00 and leaves M9 Bayonet at 8.95; pressing the button again shows 9.00 and M9 Bayonet 8.95. This test fails on `main`. "Own values for Butterfly Knife" holds no rating box and its count leaves the rating out. Spec 010's criterion 17 test, changed to the new button, still passes: an own rating of 7.00 on the first row with top 8.49 leaves the next rows at 8.44 and 8.39, Refill from top keeps it, and turning it off returns the row to 8.49.
8. Home's Screenshots section has a link "Configure" to `/screenshots`, and no "Change the default agent"; the navigation's links are Home, By gloves, By knife, Screenshots in that order, Screenshots with `aria-current="page"` on `/screenshots`.
9. Batch: rows show Move up, Move down and a position list; moving M9 Bayonet to position 1 lists M9 Bayonet, Karambit, Butterfly Knife, the live region says so, and with top 9.50 they read 9.50, 9.45, 9.40. No knife order request is sent. A batch for another knife finish lists the shared order.
10. After "Refill from top" the order controls are gone and "Change order" shows; "Change order" brings them back; the next "Refill from top" hides them. Save sends `create` in the batch's order.
11. The Step field shows 0.05; 0.10 with top 9.50 gives 9.50, 9.40, 9.30; 0, 1.01 and `abc` each show a message, and Save sends nothing while a ticked row follows the fill.
12. Leaving a batch with a changed order, step and lock and coming back in the same tab restores them; spec 010's criterion 26 test for the batch form also restores them after a session end.
13. Finish list: with `?sort=updated&status=draft` the list is sorted by last change and shows drafts; changing either updates the URL; the edit page's Back link returns to the path with its query.
14. Finish list: with the window scrolled to a set position, following a combo's Edit link and then its Back link (and, in a second case, the browser's Back) scrolls the window back to that position after the list renders (`window.scrollTo` checked).
15. Inline rating: a combo's Save button is disabled until its rating changes; typing 8.7 and clicking "Save rating for <combo>" sends one `PUT` with the combo's version, rating 8.7 and its other values unchanged; Enter in the field does the same; typing 8.6 and moving focus to another combo sends nothing and shows "Not saved"; Escape restores the stored value; `11` shows the rating message and Save sends nothing. An unsaved value is still shown after changing the status filter and back. The edited combo keeps its place and "Order changed. Sort again" re-sorts.
16. Inline rating conflict: a `PUT` answered 409 `version_conflict` shows the admin and time of the other change with their rating; "Use theirs" shows it in the field; "Keep mine" keeps the typed value, and the next Save sends it with the new version.
17. `ratingBetween` unit tests: 8.79 and 8.62 give 8.70; 8.62 and 8.61, and 8.62 and 8.62, give none; first place above 9.95 gives 10.00, above 10.00 none; last place below 0.03 gives 0.00, below 0.00 none.
18. Drag, through the keyboard on the handle (Space, Down, Space): moving a combo between 8.79 and 8.62 sends one `PUT` with rating 8.70 and shows it there; a move where no rating fits sends nothing and shows the message; with the Last change sort no handle is shown.
19. Manual, against a local stack with a finish of 45 combos: scroll halfway, edit a combo, come back with Back and with the browser's Back, and the list is where it was; edit and save two ratings in a row with Tab and Enter; in a batch, press "Own rating" on a row and type a rating, and no other row moves; drag a combo with the mouse and with the keyboard, and (with the browser's touch emulation at 375 px) by touch; `npm run preview` shows no CSP violation.

**Part C: website**

20. The click test of Design passes for every card on Home, `/gloves` and `/knives`, and fails on `main`.
21. The `draggable` test of Design passes.
22. Manual, on a Mac with a trackpad: twenty presses each on "Search by gloves", "Search by knives" and five grid cards all navigate.

**Checks**

23. In `api/`: `uv run ruff format --check .`, `uv run ruff check .`, `uv run mypy`, `uv run pytest` (no skipped tests), `uv run python -m combo_api.openapi --check` (unchanged snapshot) exit 0; `docker build -t combo-skin-api api` exits 0, its size recorded. In `admin/` and `website/`: `npm ci`, `npm run api:types:check`, `npm run lint`, `npm test`, `npm run build` exit 0, plus the admin's `typecheck` and `check:bundle`. `admin/README.md` describes the batch order and step, the list's inline rating and dragging, and the navigation.
24. After the branch is pushed, the `api`, `admin` and `website` workflow runs for its latest commit succeed. `gitleaks dir . --no-banner --redact` and `gitleaks git` over the branch report no findings.

## Test plan

| Criterion | How it is checked |
| --- | --- |
| 1 to 4 | pytest: `tests/screenshots/test_watermark.py` (rewritten), `test_commands.py`; reading the notices and README |
| 5 | Manual, against a separate local Compose project, as in spec 015's Implementation notes |
| 6, 7 | Vitest: `src/combos/fill.test.ts`, `src/pages/BatchPage.test.tsx` |
| 8 | Vitest: `src/pages/HomePage.test.tsx`, `src/App.test.tsx` "shell" |
| 9 to 12 | Vitest: `src/pages/BatchPage.test.tsx`, `src/combos/drafts.test.tsx`, `src/pages/KnifeOrderPage.test.tsx` (shared controls) |
| 13 to 18 | Vitest: `src/pages/FinishPage.test.tsx`, a new `src/combos/order.test.ts` for `ratingBetween` |
| 19, 22 | Manual, as written, recorded in Implementation notes |
| 20, 21 | Vitest in `website/`: a new `src/pages/ImageClicks.test.tsx` |
| 23, 24 | The commands below; workflow run pages after the owner pushes |

Section commands. In `api/`, with the Compose database and storage up:

```bash
uv sync --locked
uv run ruff format --check .
uv run ruff check .
uv run mypy
uv run pytest
uv run python -m combo_api.openapi --check
```

In `admin/`:

```bash
npm ci
npm run api:types:check
npm run lint
npm run typecheck
npm test
npm run build
npm run check:bundle
```

In `website/`:

```bash
npm ci
npm run api:types:check
npm run lint
npm test
npm run build
```

## Open questions

None. The owner answered the first draft's questions on 2026-11-08:

1. Dragging: as designed (Rating sort only, the floor of the midpoint, ±0.05 at the ends, refused with a message when no rating fits, `@dnd-kit`).
2. Inline rating: saved with a Save button per row.
3. Own rating: the owner typed into the box beside "Own values" and found the two boxes unclear; once the own rating is turned on, no other row should move. Hence the "Own rating" button beside the rating box (R5a).
4. Batch order: kept with the batch's unsaved values in memory.
5. No API change.
6. One spec and one review.

## Implementation notes

Built in the order A, C, B. The branch was rebased on `main` after spec 016 merged (2026-11-08), with no conflicts.

**Criterion to check**

| Criterion | Covered by |
| --- | --- |
| 1 | `api/tests/screenshots/test_watermark.py:21` `test_logo_sits_in_its_box_in_the_bottom_right_corner` (1920, 1280, 640) |
| 2 | `api/tests/screenshots/test_watermark.py:40` `test_logo_is_white_at_sixty_percent_opacity` |
| 3 | `api/tests/screenshots/test_watermark.py:61` `test_logo_file_is_white_rgba` |
| 4 | `api/tests/screenshots/test_watermark.py:70` `test_watermark_revision_is_raised_and_the_font_is_gone`; `rebuild` in `test_commands.py:73`; `THIRD_PARTY_NOTICES.md` and `api/README.md` read |
| 5 | Manual, below |
| 6 | `admin/src/combos/fill.test.ts:46` and `:52` (every row, three own values, with and without a top rating) |
| 7 | `admin/src/pages/BatchPage.test.tsx:141` "moves no other knife when a typed knife gets its own rating", `:167` "keeps no rating among a knife own values"; spec 010's criterion 17, changed to the new button, at `:92` and `:126` |
| 8 | `admin/src/pages/HomePage.test.tsx:57`; `admin/src/App.test.tsx:321` (four links) and `:53` (`aria-current` on `/screenshots`) |
| 9 | `admin/src/pages/BatchPage.test.tsx:242`; shared controls still pass `admin/src/pages/KnifeOrderPage.test.tsx:13` |
| 10 | `admin/src/pages/BatchPage.test.tsx:268` |
| 11 | `admin/src/pages/BatchPage.test.tsx:312`, `:337` (0, 1.01, `abc`, 0.055), `:350` |
| 12 | `admin/src/pages/BatchPage.test.tsx:293` (leaving and coming back); `admin/src/combos/drafts.test.tsx:47` (session end) |
| 13 | `admin/src/pages/FinishPage.test.tsx:249` |
| 14 | `admin/src/pages/FinishPage.test.tsx:277` (Back link and the browser's Back) |
| 15 | `admin/src/pages/FinishPage.test.tsx:301`, `:340` |
| 16 | `admin/src/pages/FinishPage.test.tsx:369` |
| 17 | `admin/src/combos/order.test.ts` |
| 18 | `admin/src/pages/FinishPage.test.tsx:425`, `:441`, `:463` |
| 19 | Manual, below |
| 20 | `website/src/pages/ImageClicks.test.tsx:30` (Home) and `:42` (every card of `/gloves` and `/knives`); both failed before the fix |
| 21 | `website/src/pages/ImageClicks.test.tsx:68` (Home, both grids, a type page of each, a combo page) |
| 22 | Owner's trackpad check outstanding; a synthetic check, below |
| 23 | Commands below |
| 24 | After the owner pushes |

**Manual checks** (2026-11-08, against a separate local Compose project on its own ports, with a throwaway admin made by a script, since the admin tool reads passwords only from a terminal; the project was removed afterwards)

- Criterion 5: a 1920 by 1080 stand-in PNG sent through a worker claim was answered 201. Measured against the stand-in in the bottom-right corner, the changed box of the 1920 version was x 1661 to 1880, y 974 to 1044 (expected 1660 to 1880, 971 to 1048; the logo's faint edge is under the threshold), of the 1280 version 1107 to 1253 by 650 to 697, of the 640 version 554 to 627 by 325 to 348. Solid parts of the logo lift each pixel 0.60 of the way to white (0.61 at 640). The crop matched the approved preview.
- Criterion 19, in the built dashboard (`vite preview`) at 1024 wide: with 59 drafts listed, scrolled to the middle (6413 px), Edit then Back, and Edit then the browser's Back, both came back to `?status=draft` at 6413 px. Two ratings typed and saved with Enter in a row; both stayed in place with "Order changed." until Sort again. Mouse drag: a drop where no rating fits (9.70 and 9.69) was refused with the message; a drop between 9.69 and 9.65 saved 9.67. Keyboard drag (Space, Down, Down, Space) saved 9.65 between 9.69 and 9.62. At 375 wide with touch events (press 400 ms, then move), a drop saved 9.68 between 9.69 and 9.67, with no sideways scroll. In a batch, "Own rating" on a knife typed 9 kept the box focused at 9.00 and the knives below at 8.95 and 8.90, also after typing 7.25. No CSP violation in the console; the page's policy keeps `style-src 'self'`.
- Criterion 22: in the built website, presses with a 1 px move sent as pointer events navigated 20 of 20 times on each hero card and on five glove cards. Not a trackpad: the owner's check stays open.

**Deviation for the owner to decide (2026-11-08).** Design, Order after an edit, says Tab goes from a combo's rating to its Save button and then to the next combo's rating. Each row also has its drag handle, checkbox, name link, Edit, Publish or Unpublish and Delete, so Tab passes those (six stops) before the next rating. The rating and Save are the row's last controls, so nothing else comes between them. Reaching the next rating directly would need either the other controls out of the Tab order (not accessible) or Enter moving focus to the next combo's rating after a save.

**Details settled while building**

- Dragging is off while an edited combo waits for "Sort again": the list is then not in rating order, so neighbours would not bound a rating. The handles stay, marked unavailable.
- A drop saves at once; on a conflict the dropped rating is put in the field, so "Keep mine" and Save send it.
- With dnd-kit's keyboard support, each Down moves the combo one place; Space drops it over the combo it is on. Picking a combo up clears the list's last message.
- The drag live region (dnd-kit's, `role="status"`) is a second status region on finish pages, so older tests find messages by text. The rating is now a field, so they read its value instead of the row's text. The 501-combo test finds its count by text: a role query over 501 rows takes minutes in jsdom (rendering itself takes about 0.1 s at 200 rows).
- `@dnd-kit/utilities` 3.2.2 (MIT) is a direct dependency for its transform helper; `npm audit --omit=dev` finds nothing.
- The hero images also got `select-none`, as the grid cards have.
- The API image was built under its own tag, not `combo-skin-api`, so the local stack's image was not replaced: 278 MB (279 MB before).

**Results**

- `api/`: ruff format (119 files formatted), ruff check, mypy (111 files) pass; pytest 455 passed, none skipped; the OpenAPI snapshot is unchanged.
- `admin/`: `npm ci`, `api:types:check`, lint, typecheck pass; 365 tests in 27 files pass; build and `check:bundle` pass.
- `website/`: `npm ci`, `api:types:check`, lint pass; 209 tests in 11 files pass; build passes.
- `gitleaks dir .` and `gitleaks git` over the branch: no leaks.

**Follow-ups**

- Criterion 22 on a Mac trackpad, and criterion 24 after the push.
- The owner runs `rebuild` after the merge, so existing screenshots get the logo.

## Audit

Filled in by the audit: one line per acceptance criterion (pass or fail, with evidence), the results of lint, tests, build and the secret scan, and a verdict of Pass, Pass with follow-ups, or Fail.
