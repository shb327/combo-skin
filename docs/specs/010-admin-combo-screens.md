# 010: Admin combo screens

**Status:** Audited
<!-- Lifecycle: Draft → Approved → Implemented → Audited -->

**Section:** admin
**Branch:** 010-admin-combo-screens

## Summary

Replace the By gloves and By knife placeholders of the admin dashboard with the screens that enter and manage combos through the API of spec 009: pick a glove or knife finish, see its combos, add one combo, enter a batch of knives for one pair of gloves, edit, publish, unpublish and delete combos, and reorder the knife types. Unsaved work survives the end of a session. After this spec the owner can log in locally and enter the first 200 combos.

## Goals and non-goals

**Goals**

- By gloves: search and pick a glove finish, see its combos, add one knife, and enter a batch (owner's design, Requirements R8 to R21).
- By knife: search and pick a knife finish, see its combos, and add gloves one at a time.
- Edit one combo with spec 009's version check; publish or unpublish one combo, a selection, a just-saved batch, or every draft; delete a draft or unpublished combo.
- A knife order page that any admin can reorder and save.
- Unsaved changes in any form come back after the session ends and the same admin logs in again, without browser storage.
- Shared pieces with unit tests: finish search, rating, float range and seed inputs, the batch rating fill, and mapping API errors to fields.

**Non-goals**

- Combo previews, images of combos, screenshots and R2.
- The website showing combos, pattern groups, combo variations (several combos per pairing), prices.
- Two-factor login, roles, account management, deployment.
- Any change to `api/`. What the API could do better is listed under Follow-ups.
- Keeping unsaved changes across a reload or a closed tab (Design, Unsaved changes).

## Context

Specs 001 to 009 are Audited and merged into `main`.

- **Admin app** (spec 008). `admin/src/App.tsx` routes `/login` and, behind `RequireSession` and `Layout`, `/` (`HomePage`), `/gloves` (`ByGlovesPage`), `/knives` (`ByKnifePage`) and a not-found page. `ByGlovesPage.tsx` and `ByKnifePage.tsx` render `Placeholder.tsx`, which says the screens come in a later version. `src/components/Layout.tsx` holds the header and the navigation (`SECTIONS`: Home, By gloves, By knife); `src/components/useTitle.ts` sets `<page> · Combo Skin admin`.
- **Client.** `src/api/client.ts` is the only module that may use the network (lint guard rails in `admin/eslint.config.js`). `createApi` returns `request`, `openapi-fetch`'s typed `request` with the origin check, the CSRF header on writes, one retry after `csrf_failed`, and `not_authenticated` ending the session through `onSessionChange`. Types come from the generated `src/api/schema.d.ts`, which already holds every route of spec 009.
- **Errors.** `src/api/errors.ts`: `ApiError` has `kind`, `status`, `code` and `retryAfter`; `httpError` reads `code` only from a string `detail`. A 422 body is a list of `{loc, msg, type, input, ctx}` (FastAPI), so today its item paths and `type` codes are lost and the app shows the generic message. `input` echoes what was sent and `msg` is server text; neither may be rendered (spec 008 S9 and its "server text is never rendered" rule).
- **Session.** `src/auth/session.tsx` keeps the session in React state above the routes. When a request gets 401 `not_authenticated`, when `expires_at` passes, or when a tab hidden for a minute comes back to an ended session, the state becomes anonymous and `RequireSession` navigates to `/login?next=<path>`; every page under `Layout` unmounts, so form state kept in a page is lost today. The page is not reloaded: the JavaScript heap survives the trip to the login page and back.
- **Data fetching.** No query library: spec 008 Design left the choice to this spec and listed keeping an unsaved combo form across a session end as a follow-up.
- **Guard rails.** Lint forbids `localStorage`, `sessionStorage`, `indexedDB` and `document.cookie` everywhere, network globals outside the client, `dangerouslySetInnerHTML` and `console.log`; `src/lint.test.ts` proves each rule. The only lint exceptions are three commented lines in `src/flow.test.tsx`, which read storage to prove it stays empty.
- **CSP.** `vite.config.ts` builds `img-src 'self'`; spec 008 S4 says nothing is loaded from a third-party host. Catalog `image_url` values point to the game's public image host, so showing them would need a CSP change. `scripts/check-bundle.mjs` fails a build that references another host.
- **Tests.** Vitest, Testing Library and `src/test/fakeApi.ts`, a hand-written `fetch` that answers the three login routes, queues replies with `next()` and records every request. 117 tests pass.
- **Combos API** (spec 009, used as written):
  - `GET /admin/combos` with `glove_type`, `glove_finish`, `knife_type`, `knife_finish`, `status`, `sort` (`rating` or `updated`), `limit` (1 to 500) and `offset`, returning `{total, items: [AdminCombo]}`.
  - `POST /admin/combos` (`{glove: ItemIn, knife: ItemIn, rating, description}`), `GET`, `PUT` (with `version`) and `DELETE ?version=` on `/admin/combos/{id}`.
  - `POST /admin/combos/publish` (`ids`, 1 to 500, or `all_drafts: true`, which publishes only drafts) and `/unpublish` (`ids`), each all or nothing, returning `{changed}`. Status changes do not change `version`.
  - `GET /admin/batches/finishes` (`[{slug, display_name, knife_types}]`), `GET /admin/batches/candidates?glove_type&glove_finish&knife_finish` (rows in knife order, each with `existing` or null), `POST /admin/batches` (`create` items with conditions, `update` items with `id`, `version`, rating and description only; 1 to 50 items; all or nothing), returning `{created, updated}`.
  - `GET` and `PUT /admin/knife-order` (`{slugs}` naming every active knife type once).
  - `Item` carries the finish's own range as `float_min` and `float_max` (null for Vanilla) next to the combo's `float_from`, `float_to` and `seeds`.
  - Errors: 404 `combo_not_found`; 409 `combo_exists`, `version_conflict`, `combo_published`; 422 lists with `type` codes `finish_not_found`, `finish_retired`, `float_outside_finish`, `finish_has_no_float`, `finish_has_no_pattern`, `duplicate_seed`, `duplicate_knife_type`, `combo_not_found`, `combo_not_in_batch`, `knife_order_mismatch`, and pydantic's own (`decimal_max_places`, `too_long`, `string_too_long`, `value_error` and others).
- **Catalog API** (specs 005, 006). `GET /gloves` and `GET /knives` list active types (8 glove types, 20 knife types); `GET /gloves/{type}` and `/knives/{type}` return one type with its active finishes. There is no single request for every finish of a kind: listing all of them takes 9 requests for gloves (94 finishes) and 21 for knives (576 finishes). `GET /{kind}/{type}/{finish}` also returns a retired finish, with `active: false`.

## Requirements

**Finding a finish**

- R1. By gloves (`/gloves`) and By knife (`/knives`) open with a search field that finds a finish by any words of its type name and finish name, in any order and any letter case ("kimono spec" finds Specialist Gloves | Crimson Kimono). Results show `<type name> | <finish display name>` with the finish's picture (R38), in catalog display order, and can be chosen with the keyboard alone.
- R2. Choosing a finish opens its page at `/gloves/<type>/<finish>` or `/knives/<type>/<finish>`, so a reload, the browser's back button and a copied link return to it.

**A finish's combos**

- R3. A finish page shows the finish name, its float range from the catalog, and its combos: the other item (type and finish), the rating with two decimals, a short summary of both items' conditions, the status (draft, published, unpublished), and when and by whom it last changed.
- R4. The list can be filtered by status, with the number of combos in each status shown, and on a glove finish page by knife finish name; it can be sorted by rating (default, highest first) or by last change.
- R5. Each combo in the list can be opened for editing, published or unpublished, and, when it is a draft or unpublished, deleted. Several combos can be selected and published or unpublished in one request.
- R6. A retired finish's page says so and offers no way to add combos; its existing combos can still be managed. An unknown finish in the address shows a not-found message with a link back to the search.

**Adding one combo**

- R7. From a glove finish page, "Add knife" opens a form with a knife finish search, the rating, float range and pattern seeds for each item, and a description. From a knife finish page, "Add gloves" opens the same form with a glove finish search. Saving creates one draft and returns to the finish page, where it is listed.

**Batch** (By gloves only, owner's design)

- R8. "Start a batch" on a glove finish page asks for a knife finish name (Ruby, Blue Steel, ...), searchable, from the names the API lists.
- R9. Every knife type with that finish is then listed in the saved knife order, each with its float range, ticked.
- R10. A knife type that already has a combo with these gloves shows "already exists" with its status and rating, unticked, and offers to update its rating and description instead.
- R11. The owner can untick and tick any row. Rows never change place.
- R12. The owner gives the top rating. Each next included row is filled in 0.05 below the included row above it, never below 0. Any row's rating can be changed by hand; rows below a changed row that were not changed by hand follow it. A row keeps its place even when rated above the row before it.
- R13. A batch-wide float range and pattern seeds for the gloves, a batch-wide float range and pattern seeds for the knives, and a batch-wide description apply to every new row. Any new row can override each of them, and clearing an override returns that row to the batch-wide value. A row being updated (R10) keeps its conditions, and keeps its description unless one is typed: its own description (which may be empty, to clear it) or a batch-wide one that is not blank (owner's change after the audit, 2026-11-03).
- R14. Before saving, every value is checked as in R22 to R25 against each row's own finish; a batch-wide knife range outside one row's finish range marks that row, which can then override it.
- R15. Save sends the batch in one request. It creates every ticked new row as a draft and updates every row chosen in R10, all or nothing. Afterwards the page shows what was saved (each knife with its rating, created or updated) and offers to publish the new combos in one request, or to go back to the finish page.

**Editing and managing**

- R16. A combo's edit page (`/combos/<id>`) shows the pairing (not editable), status, version, who created and last changed it and when, and edits the rating, both items' conditions and the description. Saving sends the version it was read at.
- R17. When someone else changed the combo first, the page says so, naming who changed it and when, shows their value and the owner's value for each field that differs, and lets the owner either take theirs or keep their own values and save again over the new version. A combo removed by someone else shows a message saying so.
- R18. The edit page can publish, unpublish and (for a draft or unpublished combo) delete the combo.
- R19. Deleting asks for confirmation naming the pairing. A published combo cannot be deleted; the page says to unpublish it first.
- R20. Home shows how many drafts exist across all finishes and offers "Publish all drafts", which asks for confirmation with that number and publishes only drafts (spec 009: an unpublished combo is not put back).

**Knife order**

- R21. A Knife order page, reached from a section of Home below Drafts that looks like the Drafts section (owner's change, 2026-11-03), lists the knife types in the saved order. Any admin can move a type up or down, or to a position, with mouse or keyboard alone, and save the whole order; changes can be discarded before saving.

**Values**

- R22. A rating is a number from 0 to 10 with at most 2 decimals, typed with a dot or a comma, shown with two decimals. The Up and Down arrow keys in a rating field step by 0.05.
- R23. A float range is From and To, both or neither, each with at most 4 decimals, From below To, inside the finish's own range (bounds included). A finish without a float range (Vanilla) takes no float range and no seeds.
- R24. Pattern seeds are whole numbers from 0 to 1000, typed separated by commas or spaces, at most 100 per item. When the field loses focus they are shown sorted with duplicates removed. An empty field means any pattern.
- R25. A description is plain text of at most 1000 characters after trimming, with line breaks allowed and other control characters refused; a counter shows the length. Empty means none.
- R26. Every value is checked as it is typed and again before saving. A form with an invalid value sends nothing and says, next to each field, what is wrong.

**Errors**

- R27. A refusal from the API is shown inside the form: a 422 next to the field its path points to, including the row of a batch; a 409 or 404 as a message for the whole form with what to do next. The form keeps every value.
- R28. Messages are fixed texts chosen by status, code and `type`. Text, input or context from an error body is never shown.

**No lost work**

- R29. When the session ends while a form (add, batch, edit, knife order) has unsaved changes, and the same admin logs in again in the same tab, the app returns to that form with every value restored and a notice that unsaved changes were restored, with a way to discard them.
- R30. Leaving a form for another page and coming back keeps its unsaved values the same way. Saving a form, or discarding its changes, forgets them.
- R31. Logging in as another admin forgets the previous admin's unsaved changes. Logging out with unsaved changes asks for confirmation first. Reloading or closing the tab with unsaved changes triggers the browser's leave-page warning.
- R32. Nothing is written to `localStorage`, `sessionStorage`, IndexedDB or cookies.

**Shell and checks**

- R33. The navigation has Home, By gloves and By knife (Knife order left out of it on the owner's request, 2026-11-03). Every new page sets its document title and works without horizontal scrolling from 375 px wide.
- R34. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` and `npm run check:bundle` pass in `admin/`; `admin/README.md` describes the new screens and how unsaved changes are kept.

**Browsing** (owner's change after the audit, 2026-11-03)

- R35. By gloves and By knife also show, below the search, every type of that kind (Specialist Gloves, Karambit, ...) in catalog display order, each with its number of finishes, a picture, and a link to the type's page, as the website does.
- R36. A type's page (`/gloves/<type>`, `/knives/<type>`) lists that type's finishes in catalog display order, each with its picture, its float range, and how many combos and drafts it has, and links to the finish's page.
- R37. A finish page links back to its type's page.

**Pictures** (owner's change, 2026-11-03)

- R38. Pictures help the owner find their way: a knife type shows its Vanilla finish; a glove type, which has no Vanilla, shows one fixed finish of its own (Sport Gloves: Pandora's Box); a finish shows its own picture. They appear on Home's By gloves and By knife (Sport Gloves | Pandora's Box and Karambit's Vanilla), on the type grids, the type pages, in search results, on the finish page, beside each combo in a list (the other item), on each batch row (the knife), and on the edit page (both items), and beside the item chosen on the add page. Pictures come from the catalog's `image_url`, on the game's public image host, until the screenshot storage spec replaces them.

## Design

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| Server state (owner's choice) | TanStack Query v5 (`@tanstack/react-query`), the one new runtime dependency. One `QueryClient` per app, created in `main.tsx` and in tests. Query functions call only `api.request`, so the client stays the only network module. Settings: no automatic retries (a refusal shows with a "Try again" button), no refetch on window focus or interval, catalog queries never stale within a page load, admin combo queries refetched when a page mounts. After every write the affected queries are invalidated: combo lists, the draft count, candidates, the combo itself. On logout the cache is cleared | The small hooks of spec 008: lists, candidates, counts and a dozen writes would each need hand-written loading, error, cache and invalidation code, and two pages showing the same combo would disagree after a write. SWR: weaker support for writes and invalidation. Refetching on focus or an interval: each request counts as activity and would keep an idle session alive (spec 008 rejected polling for the same reason) |
| Unsaved changes (owner's choice) | In memory only. A drafts store (a React context above the routes, inside `SessionProvider`) holds each form's unsaved values under a key (`add-knife:<glove type>/<glove finish>`, `add-gloves:<knife type>/<knife finish>`, `batch:<glove type>/<glove finish>/<knife finish>`, `edit:<id>`, `knife-order`), tagged with the admin's username. Forms read their starting values from it and write to it on every change. When the session ends, the login page and `next` (spec 008) bring the admin back, and the form finds its values. Cleared for a form on save or discard; cleared entirely on logout (after confirmation) and when a different admin logs in. A `beforeunload` warning covers reloads and closed tabs | `sessionStorage` with limits (a size cap, cleared on logout, per tab): survives a reload, but breaks spec 008 S2 and its lint rule, leaves combo data on a shared computer after the session ends, and needs an exception in the guard rails. Accepted cost: a reload or closed tab loses unsaved work, which the browser's warning makes deliberate. Keeping state inside each page: lost when `RequireSession` unmounts the pages. Blocking in-app navigation with a prompt: unnecessary when the values are kept anyway |
| Finish search (owner's choice) | One search field across type and finish. All finishes of a kind are loaded once per page load from the catalog routes (9 requests for gloves, 21 for knives, in parallel, cached) and searched in the browser: each typed word must start a word of `<type name> <display name>`, case and accents ignored. At most 50 results are shown, then "type more to narrow". The ARIA combobox pattern: `role="combobox"` input, `role="listbox"` results, `aria-activedescendant`, Up, Down, Enter, Escape. The same component picks the knife or gloves when adding one combo | Type first, then finish: two choices for every combo, where most searches name the finish ("crimson kimono", "ruby"). A server search: needs an API change (Follow-ups). |
| Finish images (owner's change, 2026-11-03; first chosen: none) | The catalog's own pictures (`image_url`), loaded from the game's public image host, `https://community.akamai.steamstatic.com`, the only host besides the app that the CSP's `img-src` allows; the same constant (`src/api/images.ts`) builds the policy, and the bundle check expects it and accepts the host as text in the built files, where scripts build picture URLs at run time (an `<img>` or CSS `url()` to it in the built HTML or CSS is still refused, and `connect-src` blocks any other use of it). A picture is shown only when its URL is on that host, with `referrerPolicy="no-referrer"`, lazily, and with an empty `alt` beside its visible name; a missing or failed picture leaves an empty box of the same size. Knife types use their Vanilla finish; glove types use a fixed finish each (Sport: Pandora's Box, Specialist: Crimson Kimono, Driver: King Snake, Hand Wraps: Cobalt Skulls, Moto: Spearmint, Hydra: Emerald, Bloodhound: Charred, Broken Fang: Jade), or their first finish if that one is missing. Replaced by the screenshot storage spec's own images later | No pictures (the first choice): the owner found the screens hard to scan by name alone. Pictures bundled with the app: about 670 files to copy and keep in step with the catalog, for a stopgap until the screenshot storage spec. Sending a referrer: the image host would learn the admin's address on every list |
| Knife order input (owner's choice) | Per row: Move up and Move down buttons and a position select (1 to n). After a move, focus stays on the moved row's button that was used, and a live region says "Karambit moved to position 2". No dependency | A drag and drop library (for example dnd-kit): a second runtime dependency for 20 rows, and keyboard support needs its own setup. Native HTML drag and drop: no keyboard or touch support |
| Rating input (owner's choice) | `<input type="text" inputmode="decimal">`, not `type="number"`. Accepts `8.88`, `8,88`, `9.5`, `10`; shown as `9.50` after the field loses focus. Up and Down arrows step by 0.05 from the current value, clamped to 0 and 10. Parsed into an integer number of hundredths; all arithmetic, including the batch fill, is on integers, and the request sends `hundredths / 100` as a JSON number | `type="number"`: browsers differ on commas, the mouse wheel changes values by accident, and `step=0.05` makes 8.88 invalid. A slider: imprecise for 8.88. A select of 0.05 steps: refuses 8.88 |
| Float and seed inputs (owner's choice) | From and To text fields with `inputmode="decimal"`, placeholders showing the finish's range (`0.06 – 0.80`), parsed into integer ten-thousandths and compared with the finish's range parsed the same way from its shortest decimal form (as spec 009 does on the server). Seeds in one text field, commas or spaces between; sorted and de-duplicated when the field loses focus, with a note "1 duplicate removed" | Number inputs: the same problems as ratings. Refusing duplicates: the API refuses them, but removing them loses nothing |
| Validation messages (owner's choice) | Fixed texts next to the field, linked with `aria-describedby` and `aria-invalid`: "Enter a rating.", "Enter a number such as 8.88.", "Rating must be from 0 to 10.", "Use at most 2 decimals.", "Use at most 4 decimals.", "Enter both From and To, or neither.", "From must be below To.", "Outside this finish's range, 0.06 to 0.80." (with the real range), "Vanilla has no float or pattern.", "Seeds are whole numbers from 0 to 1000.", "At most 100 seeds.", "At most 1000 characters.", "Remove tabs and other control characters." A failed save moves focus to a summary at the top that links to each field in error | Messages only on submit: the owner finds out late. A browser's built-in validation bubbles: not translatable, not testable, and not shown for API errors |
| Batch rating fill | Each row keeps its rating and a "set by hand" flag. The top rating field sets the first included row. Every included row not set by hand gets the rating of the nearest included row above it minus 0.05, floored at 0. Typing in a row sets it by hand; rows below that follow it recompute. Unticking a row closes the gap. "Refill from top" clears every "set by hand" flag. Rows being updated (R10) are included rows | Filling once and never again: changing the top rating after a few edits would mean retyping every row. Re-sorting rows by rating: the owner's design keeps knife order |
| Batch conditions | Batch-wide values: glove range and seeds, knife range and seeds, description. A new row uses each batch-wide value unless it has its own override, shown as "own value" with a Clear button. A Vanilla row takes no knife conditions and shows why. A row with a knife range outside its finish is marked and blocks Save until fixed or overridden | Copying batch-wide values into each row when typed: a later change to the batch-wide value would not reach rows already filled |
| Existing combos in a batch | Unticked by default, shown with status and current rating. Ticking one adds it to `update`, with the rating from the fill, and shows the current values beside ("now 9.10", and its current description). Its description stays as it is unless one is typed: the row's own description, which may be empty to clear it, or a non-blank batch-wide one; the row shows the description it will be saved with (owner's change after the audit, 2026-11-03). Conditions are not editable there (spec 009 `update` items carry rating and description only); the row links to the combo's edit page | Prefilling an updated row with its current rating, set by hand: re-rating in the batch's context is the point of including it |
| After a batch save | A result panel replaces the form: created rows (knife, rating) and updated rows; "Publish these N new combos" (one request with the created ids); "Back to <gloves>". The batch's draft is cleared | Going straight back to the finish page: the owner asked to see what was saved. Publishing updated rows too: their status was chosen earlier and is left as it is |
| "A whole batch" later | Batches are not stored (spec 009). On a glove finish page, filtering by knife finish name and "select all shown" gives the same set, which can then be published or unpublished in one request | A batch id in the API: an API change for a filter the list already covers |
| Combo lists | One request per page: `GET /admin/combos` with the finish's filters, `limit=500`, and further pages by `offset` while `total` is larger. Status chips (All, Draft, Published, Unpublished) with counts, the knife finish name filter and the sort are applied in the browser. Rows are cards that wrap on narrow screens. A checkbox per row and "select all shown" drive "Publish selected" and "Unpublish selected"; buttons are disabled when nothing selected can change | Server-side filters per chip: a request per click and separate counts. A table with horizontal scroll: fails at 375 px |
| Status display | A text badge per status, never colour alone: Draft (neutral), Published (accent), Unpublished (muted) | Colour only: unreadable for some colour vision and for screen readers |
| Conditions summary | `Gloves 0.06–0.15 · seeds 2, 179 (+3)` and `Knife any`, numbers as stored, at most three seeds then a count | Full lists in the row: a hundred seeds would fill the page |
| API errors in forms (owner's choice) | `ApiError` gains `problems`: for a 422 list body, the `loc` and `type` of each entry, nothing else. A function maps `loc` to a form field: `["body", "rating"]`, `["body", "knife", "float_from"]`, and in a batch `["body", "create", i, ...]` and `["body", "update", i, ...]` through the index of the row as sent. Known `type` codes get fixed messages ("Outside this finish's range.", "This finish is no longer in the game.", "Vanilla has no float or pattern.", "This knife type appears twice.", "This combo is not part of this batch."); other codes "The API refused this value."; a path that matches no field goes to the summary. 409 and 404 show a message for the whole form: `combo_exists` "These items already have a combo." with a link to it; `version_conflict` the conflict view (next row) or, in a batch, "Combos changed since you opened this batch." with the candidates reloaded; `combo_published` "Unpublish it first."; `combo_not_found` "This combo no longer exists." | One message for the whole form: the owner could not tell which of 18 rows is wrong. Showing `msg`: server text, which spec 008 never renders, and English pydantic wording |
| Version conflict on edit (owner's choice) | After 409 `version_conflict` the page reads the combo again and shows, for each field that differs, "Theirs" and "Yours", with who changed it and when. "Use theirs" replaces the form with the stored combo. "Keep mine" keeps the owner's values with the new version; the next Save sends that version. A delete refused for a stale version asks the owner to check the combo and delete again | Overwriting without showing: loses the other admin's change silently. Merging field by field: more UI for a rare case with a few admins |
| Batch conflicts | After 409 `combo_exists` or `version_conflict` the candidates are fetched again and the owner's values are kept per knife type. A row whose knife type now has a combo becomes "already exists", unticked, with the owner's rating and description kept for a possible update | Discarding the batch: loses the work the owner just did |
| A save without an answer | When a save gets no response, the message says the API could not be reached and the changes may or may not be saved; the values are kept and the list is reloaded. Saving again is safe: a duplicate create is refused with `combo_exists`, a stale update with `version_conflict` | Retrying automatically: hides a real failure |
| Publish all drafts | On Home: the draft count from `GET /admin/combos?status=draft&limit=1` (`total`), and a button that opens a confirmation dialog with that number. Confirm sends `{"all_drafts": true}` and shows `changed` | On each finish page: the action is global, so it belongs on a global page. Without confirmation: one click publishes every draft on the website |
| Dialogs | A native `<dialog>` opened with `showModal()`, focus on Cancel, Escape cancels | A dialog library: a dependency for two confirmations |
| Routes | `/gloves`, `/gloves/:type/:finish`, `/gloves/:type/:finish/add`, `/gloves/:type/:finish/batch`, `/gloves/:type/:finish/batch/:knifeFinish`, `/knives`, `/knives/:type/:finish`, `/knives/:type/:finish/add`, `/combos/:id`, `/knife-order` | Dialogs over the finish page for add and batch: no address to return to after a session ends, and lost on reload |
| Browsing (owner's choice after the audit) | Like the website's type and finish grids: cards with a picture (Finish images), the name, the float range, and counts; no rarity colour, since every glove shares one rarity and every knife another, both shown in the same red (owner's change, 2026-11-03). The type grid comes from the catalog already loaded for the search; a type page asks for its combos once (`GET /admin/combos` with `glove_type` or `knife_type`, paged as the finish page) and counts them per finish in the browser. Types in catalog display order, as the website shows them, not the knife order of batches | Text only (the first choice): see Finish images. A list without counts: the owner could not see which finishes still have no combos. A request per finish for counts: up to 30 requests per type page |
| Page titles | `By gloves`, `<type>` on a type page, `<type> \| <finish>` on a finish page, `Add knife`, `Add gloves`, `Batch`, `Edit combo`, `Knife order`, each followed by ` · Combo Skin admin` | The finish name alone: the add and list pages of one finish would look the same in two tabs |
| Navigation (owner's change, 2026-11-03) | Home, By gloves, By knife. Knife order is a section of Home below Drafts, shown the same way (a heading, one line, a plain link), because it is rarely used; its page links back to Home. Spec 008 criterion 21 and its test change to these links | A fourth navigation link (the first version): gave a rarely used page as much weight as the two directions. Under By gloves only: it is shared by every admin and both directions |
| Number formats | Ratings with two decimals (`9.50`); float values as stored with trailing zeros removed (`0.06`, `0.8`); dates as the browser's locale date and time | Ratings as typed (`9.5`): a column of ratings would not line up |
| Retired finishes | Pages for a retired finish (reached by link or address) show "No longer in the game" and hide Add and Start a batch. Searches list active finishes only, as the catalog routes return | Allowing the forms and relying on the API's `finish_retired`: an avoidable refusal |
| Tests | The fake API gains a small in-memory catalog (2 glove types including Specialist Gloves with Crimson Kimono, 3 knife types including Karambit, a few finishes each, Vanilla, Doppler (Ruby) on all 3 knives, one retired finish) and an in-memory combo store that implements the routes of spec 009 the screens use, with its version, status and all-or-nothing rules; `next()` still overrides any route with a queued reply. Its bodies are typed from the generated schema. Pure functions (parsing, fill, search, error paths) have their own unit tests. One test file per page | MSW: still one more dependency for what the fake already does. Testing against the real API in CI: admins are created only at a terminal (spec 008 Follow-ups); the manual criterion covers the real API |
| Size (owner's choice) | One spec for By gloves, By knife, editing and publishing, and the knife order page | Two specs, By gloves with batches, editing and publishing first, then By knife, the knife order page and polish: By knife and the knife order reuse every piece built for By gloves, so a second review would mostly re-read the same components |
| Files | `src/combos/` for the shared pieces (`values.ts` parsing and formatting, `fill.ts`, `search.ts`, `problems.ts` error paths, `drafts.tsx` the drafts store, `queries.ts` query keys and hooks, components for the finish search, conditions fields, rating field, combo list and confirmation dialog); `src/pages/` for the pages (`GloveFinishesPage`, `GloveFinishPage`, `KnifeFinishesPage`, `KnifeFinishPage`, `AddComboPage`, `BatchPage`, `EditComboPage`, `KnifeOrderPage`). `Placeholder.tsx` is removed | One folder per page with its own queries: the same combo would be cached under different keys |

**Follow-ups** (outside this spec):

- `api/`: one request for every finish of a kind, with type names, for the searches (today 9 or 21 requests per page load).
- `api/`: a count per status for a finish, if lists grow past a few hundred combos.
- `api/`: a batch with only `update` items on a retired glove finish is refused (spec 009 audit); the dashboard never sends one, since a retired finish's page offers no batch.
- `api/`: the error codes as an enumeration in `api/openapi.json` (spec 008 and 009 follow-up), so the admin's error mapping is typed.
- Keeping unsaved changes across a reload, if in-memory proves too little (Design, Unsaved changes).
- Pictures from the screenshot storage spec, replacing the game's image host (Design, Finish images).

## API / data model

No API change. The dashboard uses the catalog routes and the routes of spec 009 through the generated types.

**Routes of the dashboard** (all behind login, as spec 008):

| Path | Page |
| --- | --- |
| `/` | Home: the two directions with pictures, draft count and Publish all drafts, then a link to Knife order |
| `/gloves` | Glove finish search and the glove types |
| `/gloves/:type` | Glove type: its finishes with combo counts |
| `/gloves/:type/:finish` | Glove finish: its combos, Add knife, Start a batch |
| `/gloves/:type/:finish/add` | Add one knife |
| `/gloves/:type/:finish/batch` | Batch: pick a knife finish name |
| `/gloves/:type/:finish/batch/:knifeFinish` | Batch rows, save and result |
| `/knives` | Knife finish search and the knife types |
| `/knives/:type` | Knife type: its finishes with combo counts |
| `/knives/:type/:finish` | Knife finish: its combos, Add gloves |
| `/knives/:type/:finish/add` | Add one pair of gloves |
| `/combos/:id` | Edit one combo |
| `/knife-order` | Knife order |

**Requests each screen sends:**

| Screen | Reads | Writes |
| --- | --- | --- |
| Searches and type grids | `GET /gloves` and `GET /gloves/{type}` for each type, or the same under `/knives`; once per page load | |
| Type page | The catalog, as above; `GET /admin/combos` with `glove_type` (or `knife_type`), `limit=500`, `offset` | |
| Finish page | `GET /{kind}/{type}/{finish}` (name, range, `active`); `GET /admin/combos` with `glove_type` and `glove_finish` (or `knife_type` and `knife_finish`), `limit=500`, `offset` | `POST /admin/combos/publish` and `/unpublish` with `ids`; `DELETE /admin/combos/{id}?version=` |
| Add | The finish, as above; the other kind's search | `POST /admin/combos` |
| Batch | `GET /admin/batches/finishes`; `GET /admin/batches/candidates` | `POST /admin/batches`; then `POST /admin/combos/publish` with the created ids |
| Edit | `GET /admin/combos/{id}` | `PUT /admin/combos/{id}`; publish, unpublish, delete |
| Home | `GET /admin/combos?status=draft&limit=1`; `GET /gloves/sport/pandoras-box` and `GET /knives/karambit/vanilla` for the two pictures | `POST /admin/combos/publish` with `all_drafts: true` |
| Knife order | `GET /admin/knife-order` | `PUT /admin/knife-order` |

**Batch request built from the rows:** `glove` is the page's finish; `knife_finish` the chosen name; `create` holds the ticked new rows in list order, each `{knife_type, rating, description, glove: Conditions, knife: Conditions}` with batch-wide values or overrides resolved; `update` holds the ticked existing rows in list order, each `{id, version, rating, description}` with `version` from the candidates. The index of each row in `create` or `update` is kept to map a 422 `loc` back to the row.

**`ApiError.problems`:** `[{loc: (string | number)[], type: string}]` for a 422 list body, empty otherwise. `msg`, `input` and `ctx` are dropped when the body is read.

**Drafts store entry:** `{key, username, values, restored: boolean}` in memory, where `values` is the form's own state (for a batch: the chosen rows, ticks, ratings, "set by hand" flags, batch-wide values and overrides, keyed by knife type slug).

**Dependencies** (`admin/package.json`): `@fontsource/montserrat`, `@tanstack/react-query` (5.x), `openapi-fetch`, `react`, `react-dom`, `react-router`.

## Security

- S1. Every combo and knife order request goes through `src/api/client.ts`: to the API origin, with credentials, and with the CSRF token on writes. The lint guard rails and their tests are unchanged and pass.
- S2. Nothing is written to `localStorage`, `sessionStorage`, IndexedDB or cookies; unsaved changes live in memory only. No new lint exception is added.
- S3. Unsaved changes of one admin are never shown to another admin who logs in in the same tab, and are discarded on logout.
- S4. Descriptions, finish names and every other value from the API are rendered as text, never as HTML. Text, input and context from error bodies are never rendered.
- S5. The robots tag and the bundle check of spec 008 pass. The Content Security Policy of spec 008 is unchanged except `img-src`, which allows `'self'` and the game's public image host only (owner's change, 2026-11-03, replacing spec 008 S4 for images): nothing else is loaded from a third-party host, and pictures are requested without a referrer.
- S9. A picture is rendered only from an `https` URL on that host; any other `image_url` shows no picture.
- S6. Actions that change what the public sees or remove data ("Publish all drafts", delete) ask for confirmation; publishing a selection or a saved batch shows the number of combos on its button.
- S7. No new environment variable or secret. The only new network destination is the game's public image host, for pictures only (S5, owner's change 2026-11-03). `admin/.env.example` is unchanged.
- S8. Dependencies are installed from `package-lock.json` with `npm ci`; the only new runtime dependency is `@tanstack/react-query`.

## Acceptance criteria

Commands run in `admin/` unless stated. "The fake" is the test fake API with its in-memory catalog and combo store (Design, Tests). Unit tests name the function they test.

**Project**

1. On a fresh clone with no `admin/.env`, `npm ci`, `npm run api:types:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` and `npm run check:bundle` each exit 0; `npm run build` prints no chunk-size warning.
2. `node -p "Object.keys(require('./package.json').dependencies).sort().join(' ')"` prints exactly `@fontsource/montserrat @tanstack/react-query openapi-fetch react react-dom react-router`.
3. `git diff main...010-admin-combo-screens -- admin/eslint.config.js admin/vite.config.ts admin/scripts/check-bundle.mjs` removes no rule or check and changes the CSP only by adding the image host to `img-src`; `grep -rn "eslint-disable" src` lists only the three lines of spec 008 in `src/flow.test.tsx`; `src/lint.test.ts` passes.

**Values** (unit tests)

4. Rating parsing: `8.88`, `8,88`, ` 9.5 `, `10` and `0` parse to 888, 888, 950, 1000 and 0 hundredths and format as `8.88`, `8.88`, `9.50`, `10.00`, `0.00`; empty, `abc`, `1e1`, `8.885`, `-0.01` and `10.01` are refused with the messages of Design. Arrow steps from `8.88` give `8.93` and `8.83`; from `9.98` up gives `10.00`; from `0.03` down gives `0.00`.
5. Float range: with the finish range 0.06 to 0.8, `0.06`–`0.8` and `0.1`–`0.15` are accepted, `0.05`–`0.5`, `0.1`–`0.81`, `0.2`–`0.1`, `0.2`–`0.2`, `0.12345`–`0.2` and From without To are refused with their messages; with the range 0 to 0.08, `0`–`0.08` is accepted and `0`–`0.09` refused; Vanilla refuses any range or seed.
6. Seeds: `179, 387 2` gives `[2, 179, 387]`; `5 5 6` gives `[5, 6]` and the note "1 duplicate removed"; `1001`, `-1`, `1.5` and `x` are refused; 101 different seeds are refused; empty gives `[]`.
7. Description: `"  text  "` becomes `text`; spaces only become null; 1000 characters pass and 1001 are refused; a line break passes and a tab is refused.
8. Batch fill: top 9.50 over four included rows gives 9.50, 9.45, 9.40, 9.35; top 0.10 over four rows gives 0.10, 0.05, 0.00, 0.00; with row 2 set by hand to 9.80, row 3 gets 9.75; unticking row 2 then gives row 3 the rating 0.05 below row 1; changing the top rating changes only rows not set by hand; "Refill from top" refills all; twenty rows from 9.50 end at exactly 8.55; rows never change order.
9. Search: "kimono spec" and "SPEC kim" find Specialist Gloves | Crimson Kimono; "ruby" finds Doppler (Ruby) on every knife type that has it and nothing else; results follow catalog display order; more than 50 matches show 50 and the "type more" note.
10. Error paths: a 422 body with `loc` `["body", "create", 1, "knife", "float_from"]` and `type` `float_outside_finish` maps to the second sent `create` row's knife From field with "Outside this finish's range."; `["body", "update", 0, "rating"]` maps to the first `update` row's rating; an unknown `type` gives "The API refused this value."; a path that matches no field goes to the summary. A body whose `msg`, `input` and `ctx` hold `<b>x</b>` produces no text containing `<b>x</b>`, and `ApiError.problems` holds only `loc` and `type`.

**Finding a finish and its combos**

11. Tests with the fake: `/gloves` sends `GET /gloves` and one `GET /gloves/{type}` per glove type; typing "kimono" and pressing Down and Enter, without the mouse, opens `/gloves/specialist/crimson-kimono`; going back and searching again sends no further catalog request. The input has `role="combobox"` and the results `role="listbox"`. `/knives` does the same with knife types.
12. Tests: a glove finish page sends one `GET /admin/combos` with `glove_type`, `glove_finish` and `limit=500`, and shows each combo's knife, rating with two decimals, conditions summary, status as text, and last change with the username; with a queued first answer whose `total` is 501, it sends a second request with `offset=500` and shows the combos of both answers. Status chips show the right counts and filter; the knife finish filter and both sorts show the expected order. A knife finish page shows the gloves of each combo the same way.
13. Tests: a retired finish's page shows "No longer in the game" and no Add or Start a batch; an unknown finish shows the not-found message with a link to the search.

**Adding one combo**

14. Tests: on a glove finish page, Add knife, picking a knife finish, entering rating `8,88`, a knife range, glove seeds `2 1` and a description, then Save, sends one `POST /admin/combos` whose body has both items' slugs, `rating` 8.88 as a JSON number, the range, glove seeds `[1, 2]` and the description; the page returns to the finish page with the new draft listed and a saved message. With an invalid value Save sends nothing and the field shows its message. A 409 `combo_exists` shows "These items already have a combo." with a link to `/combos/<id>` of the existing combo. Add gloves on a knife finish page works the same with a glove finish search.

**Batch**

15. Tests: Start a batch lists the batch finish names from `GET /admin/batches/finishes`, searchable; picking one sends `GET /admin/batches/candidates` with the glove finish and the name and shows the rows in the order returned, new rows ticked, the existing row unticked with "Already exists", its status and rating, and an option to update it.
16. Tests: entering the top rating 9.50 fills the ticked rows as in criterion 8; editing a row, unticking a row, and changing the top rating behave as in criterion 8 on screen; rows keep their order after a row is rated above the one before it.
17. Tests: a batch-wide knife range, glove seeds and description reach every new row; one row's own knife range replaces the batch-wide one for that row only, and Clear returns it to the batch-wide value; a row whose finish range does not contain the batch-wide range is marked and Save sends nothing until it is overridden; a Vanilla row takes no knife conditions.
18. Tests: Save sends one `POST /admin/batches` whose `create` holds exactly the ticked new rows in list order with resolved values, and whose `update` holds exactly the ticked existing row with its `id`, the `version` from the candidates, its filled rating and the batch description (its current description when the batch description is blank, and none when its own description is set empty); nothing is sent with no row ticked. On 200 the result lists each created and updated knife with its rating; "Publish these N new combos" sends one `POST /admin/combos/publish` with exactly the created ids and shows the number changed.
19. Tests: a 422 with a `loc` in `create` row 2 shows the message on the row of the knife sent as row 2, and every value stays; a 409 `combo_exists` shows "Combos changed since you opened this batch.", sends `GET /admin/batches/candidates` again, keeps the owner's values per knife type, and shows a row that now has a combo as "Already exists", unticked.

**Editing and managing**

20. Tests: `/combos/<id>` sends `GET /admin/combos/<id>`, shows the pairing without inputs for it, status, version, creator, last change, and the values; Save sends `PUT` with the version read and the edited rating, description and both conditions, then shows the new version.
21. Tests: a `PUT` answered 409 `version_conflict` leads to one `GET` of the combo and a message naming the admin and time of the other change, with "Theirs" and "Yours" for each differing field; "Use theirs" fills the form with the stored values; "Keep mine" keeps the owner's values and the next Save sends the new version. A 404 on `GET` or `PUT` shows "This combo no longer exists."
22. Tests: from the list and from the edit page, Publish on a draft or unpublished combo sends `POST /admin/combos/publish` with `{"ids": [id]}` and Unpublish on a published one sends `/unpublish`; the status shown changes after the answer. Selecting three rows and "Publish selected" sends one request with those three ids. "Select all shown" with the knife finish filter on selects only the shown rows.
23. Tests: Delete is offered only for draft and unpublished combos; it opens a dialog naming the pairing; Cancel sends nothing; Confirm sends `DELETE /admin/combos/<id>?version=<n>` and the combo leaves the list. A 409 `combo_published`, a 409 `version_conflict` and a 404 each show their message and the combo stays listed until the list is reloaded.
24. Tests: Home shows the draft count from `GET /admin/combos?status=draft&limit=1`; Publish all drafts opens a dialog with that number; Cancel sends nothing; Confirm sends exactly `{"all_drafts": true}` and shows the number changed; an unpublished combo in the fake stays unpublished.

**Knife order**

25. Tests: `/knife-order` shows the knife types from `GET /admin/knife-order` in order; the first row has no Move up and the last no Move down; Move down on row 1, using only the keyboard, makes it row 2, keeps focus on that row's Move down button and announces the move in a live region; the position select moves a row to the chosen place; Save is disabled until the order changes, then sends `PUT /admin/knife-order` with every slug in the new order; Discard restores the saved order; a 422 `knife_order_mismatch` shows a message asking to reload.

**No lost work**

26. Tests, for each of the add, batch, edit and knife order forms: after values are changed, a request that gets 401 `not_authenticated` shows the login page; logging in again as the same admin returns to the form's path with every value restored (for a batch: ticks, ratings, "set by hand" flags, batch-wide values and overrides) and a "Restored unsaved changes" notice whose Discard returns the form to the stored values. The same holds when the session ends because `expires_at` passed (fake timers).
27. Tests: changing values in the add form, going to Home and back restores them; a successful save, then opening the add form again, shows empty values.
28. Tests: after the session ends with unsaved changes, logging in as a different username shows empty forms. Logout with unsaved changes opens a dialog; Cancel sends no `POST /admin/logout`; Confirm logs out, and logging in again as the same admin shows empty forms.
29. Tests: with unsaved changes, a `beforeunload` event dispatched on `window` has `defaultPrevented` true; without, false.

**Security**

30. The full-flow test of spec 008 (`src/flow.test.tsx`) is extended with: a search, a batch save, a publish, an edit with a version conflict, a session end with an unsaved batch and its restore; at every step `localStorage`, `sessionStorage` and `document.cookie` are empty, and every recorded write carries the session's `X-CSRF-Token` and goes to the API origin.
31. Tests: a combo whose description and finish display name are `<img src=x onerror=alert(1)>` shows that text literally, and the page has no `img` element with `src="x"`.
32. `npm run check:bundle` exits 0 after a build; `contentSecurityPolicy` in `vite.config.ts` returns the string of spec 008 with `img-src 'self' https://community.akamai.steamstatic.com`, and the bundle check fails a build whose policy differs.

**Manual, against the local stack**

33. Following `admin/README.md` literally on a fresh clone, with the Compose stack from `api/.env.example` and an admin made with spec 007's tool: search "crimson kimono", open Specialist Gloves | Crimson Kimono, start a batch with Doppler (Ruby): 18 rows in the seeded knife order (Butterfly first). Untick three, set the top rating to 9.50, give Karambit its own knife range 0 to 0.01, save: 15 drafts are listed. "Publish these 15 new combos" publishes them, and `GET /gloves/specialist/crimson-kimono/combos` on the local API returns 15 combos with ratings 9.50 down by 0.05 in the order saved. Add one knife and one pair of gloves from the other direction. Edit one combo in two tabs and save both: the second shows the conflict. Move Karambit to position 1 on the knife order page and save: a new batch lists it first.
34. Manual: with `SESSION_IDLE_MINUTES=5` in `api/.env` and the API restarted, fill half a batch, wait over five minutes, act: the login page shows; logging in returns to the batch with every value restored. Reloading the page with unsaved changes shows the browser's leave-page warning.
35. Manual, with `npm run build && npm run preview`: the browser console shows no CSP violation while doing criterion 33's steps; the network panel shows requests only to `localhost:5174`, `localhost:8000` and, for pictures, the game's image host, with no `Referer` header; local and session storage and IndexedDB stay empty.
36. Manual: at 375 px and 1440 px wide, every page of the routes table has no horizontal scroll bar, and a batch of 18 rows can be filled and saved at 375 px.

**Shell, CI and docs**

37. Tests: the navigation has Home, By gloves and By knife in that order, and no Knife order link, the current one with `aria-current="page"`; the document titles are those of Design on each page. The placeholder text of spec 008 no longer appears.
38. After the branch is pushed, the `admin` workflow run for its latest commit succeeds on GitHub.
39. `admin/README.md` describes the screens (By gloves with batches, By knife, editing and publishing, knife order), that unsaved changes are kept in memory across a session end but not across a reload, and the project structure with `src/combos/`; its first paragraph no longer says the combo screens come later.
40. `git diff --stat main...010-admin-combo-screens -- api website compose.yaml .github` prints nothing.
41. The only URLs in the changed files point to `github.com/shb327/combo-skin`, public documentation, `localhost`, `example.com` placeholders, the npm registry in the lockfile, or the game's image host; `gitleaks dir . --no-banner --redact` on a clean clone and `gitleaks git --log-opts="main..010-admin-combo-screens" --no-banner --redact` report no findings.
42. Tests: `/gloves` shows, below the search, a link for each glove type of the fake catalog, in catalog order, each with its number of active finishes and pointing to `/gloves/<type>`; `/knives` does the same for knife types; neither sends a catalog request beyond those of criterion 11. Each type card has one picture: a knife type its Vanilla finish's `image_url`, Specialist Gloves its Crimson Kimono's.
43. Tests: `/gloves/specialist` shows the type's name and a link to each of its active finishes in catalog order, each pointing to its finish page and showing its float range and its number of combos and drafts, counted from one `GET /admin/combos` with `glove_type=specialist` and `limit=500` (further pages as in criterion 12); a finish without combos says so. `/knives/karambit` does the same, with "No float range" for Vanilla. An unknown type shows a not-found message with a link back to the search. Its document title is the type's name.
44. Tests: a glove finish page and a knife finish page each link to their type's page.
45. Tests: pictures with the item's `image_url`, `referrerpolicy="no-referrer"` and `loading="lazy"` are shown on type page cards, search options, the finish page, combo list rows (the other item), batch rows (the knife) and the edit page (both items).
46. Tests: an `image_url` on another host, on `http`, or a relative one, renders no `img`; a picture that fails to load is removed.
47. Tests: Home shows the By gloves card with the Sport Gloves Pandora's Box picture and the By knife card with Karambit's Vanilla, then Drafts, then a Knife order section after Drafts with a link to `/knife-order`; the knife order page links to Home.

## Test plan

| Criterion | How it is checked |
| --- | --- |
| 1 | Fresh clone into a temporary directory, then the commands in criterion 1; read the build output |
| 2 | The command in criterion 2 |
| 3 | The `git diff` and `grep` in criterion 3; Vitest: `src/lint.test.ts` |
| 4 to 10 | Vitest: unit tests of `src/combos/values.ts`, `fill.ts`, `search.ts` and `problems.ts`, and of `httpError` in `src/api/errors.ts` |
| 11 to 29 | Vitest with Testing Library, `user-event`, fake timers and the fake: one test file per page, plus the drafts store tests |
| 30 | Vitest: `src/flow.test.tsx` |
| 31 | Vitest: list and edit page tests |
| 32 | `npm run build && npm run check:bundle`; Vitest: a test comparing `contentSecurityPolicy` with the string of spec 008 |
| 33 to 36 | Manual, with the local stack as described, recorded in Implementation notes |
| 37 | Vitest: shell tests in `src/App.test.tsx` |
| 38 | The workflow run page for the branch's latest commit (checked after the owner pushes) |
| 39 | Read `admin/README.md` |
| 42 to 47 | Vitest: browse, type page, picture and Home tests; `scripts/csp.test.ts`, `scripts/check-bundle.test.ts` |
| 40, 41 | The commands in the criteria; `git diff main...010-admin-combo-screens \| grep -oE 'https?://[^ )>"]+' \| sort -u` |

Section commands, run in `admin/`:

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

None. On 2026-11-03 the owner chose every recommendation of the first draft, recorded in Design as the owner's choice: TanStack Query v5 for server state; unsaved changes kept in memory only, with the browser's leave-page warning on reload; one search across type and finish, with no finish images; Move up, Move down and a position select for the knife order; text inputs with dot or comma, steps of 0.05 and the messages in Design; field-level 422 messages, the "Theirs and yours" conflict view and batches kept after a 409; and one spec rather than two.

## Implementation notes

Built on `010-admin-combo-screens`, from `main` at the merge of spec 009. `@tanstack/react-query` is locked at 5.105.3.

### Deviations

None that change a requirement. Smaller choices, all within Design:

- **Files.** Design's Files names the pieces; the code splits them further. The drafts store is `src/combos/DraftsProvider.tsx` (the component) and `src/combos/useDrafts.ts` (context and hook), because the fast refresh lint rule wants component files to export only components; `src/combos/useFinishPage.tsx` holds the finish lookup shared by four pages for the same reason. Also in `src/combos/`: `batch.ts` (batch rows, overrides, checks and the request), `form.ts` (one combo's form checks and field keys), `messages.ts` (fixed messages for refusals), `paths.ts`, `styles.ts`, `ComboFields.tsx`, `ComboList.tsx`, `FinishSearch.tsx`, `fields.tsx` (rating, conditions and description inputs) and `ui.tsx` (status badge, confirmation dialog, error summary, restored notice). `src/api/useApi.ts` gives pages the client. One `FinishesPage` and one `FinishPage` take a `kind` instead of separate glove and knife pages. `src/test/fakeCatalog.ts` holds the fake's catalog and combo store, and `scripts/csp.test.ts` checks the policy (it runs in Node, because importing `vite.config.ts` fails under jsdom).
- **Query client.** Created by `createQueryClient()` in `main.tsx` and in the test render helper, and passed to `App` as a prop.
- **Pages keyed by path.** Routes with a form are wrapped so that each path mounts its page afresh; a page reads whether its values were restored when it mounts.
- **Combobox.** No option is highlighted until Down is pressed; Enter takes the highlighted option or, with none, the first. With Down highlighting the second option first, "kimono, Down, Enter" would skip the only obvious choice.
- **Top rating.** Required only while some included row follows the fill. A row left without a rating because the top rating is missing is reported once, at the top, rather than on every row.
- **Messages not listed in Design.** A float that is not a number says "Enter a number such as 0.15."; the 422 codes `finish_not_found`, `duplicate_seed` and `decimal_max_places` say "This finish was not found.", "A seed is listed twice." and "Too many decimals.".
- **Retired finishes.** The add and batch pages of a retired finish also show "No longer in the game." and no form, as its finish page does.
- **After a delete on the edit page** the app returns to the page the edit was opened from, or to the glove finish page, with "Deleted the combo.".
- **Knife order buttons** show "Up" and "Down" and are named "Move <knife> up" and "Move <knife> down" for assistive technology.
- **Spec 008 tests.** The `csrf_failed` test now compares only login and session requests, because Home loads the draft count; the shell test checks four links and the new pages instead of the placeholders.
- **Tests.** jsdom has no modal dialogs; `src/test/setup.ts` opens and closes them as a browser would.

Found in the manual check (criterion 33) and fixed: the fifteen "Own values" buttons of a batch all had the same accessible name; each is now "Own values for <knife>" (`src/pages/BatchPage.test.tsx`).

### Changes after the first audit (2026-11-03)

The first audit, on commit 3467bec, failed: an independent read of the code and tests found three defects, each against Design or a user's data, and several tests weaker than their criteria. All are fixed with tests; none changes a requirement.

- **A delete refused for a stale version could never succeed from the same page.** Design says the owner checks the combo and deletes again, but neither the list nor the edit page read the combo again, so the second delete sent the same version. Both now reload it after 409 `version_conflict` (`src/pages/FinishPage.test.tsx::managing combos from the list::reloads the list after a delete refused…`, `src/pages/EditComboPage.test.tsx::reads the combo again after a delete refused…`).
- **A batch update showed only the existing rating.** Design says an existing row shows its current values; the description was missing, so a blank batch-wide description could replace an existing one unseen. The row now shows its current description and, when ticked, the one it will be saved with (`src/pages/BatchPage.test.tsx::the batch rows::lists every knife type…`, `::saving a batch::creates the ticked rows…`).
- **Publish or Unpublish selected included combos hidden by a filter.** A selection made before a filter change stayed in the request. The buttons now act only on the selected combos that are shown, and count only those (`src/pages/FinishPage.test.tsx::managing combos from the list::publishes only the selected combos that are shown`).
- **Smaller.** The add form showed "Vanilla has no float or pattern." for the item not chosen yet; until it is chosen, its fields take values checked as floats from 0 to 1, without a range hint (`src/pages/AddComboPage.test.tsx::takes float and pattern values before a knife is picked…`). The knife order page could move focus back to the last-used Move button after any change, such as using a position list (`src/pages/KnifeOrderPage.test.tsx::leaves focus on a position list used after a button`). "Published 1 combos." now reads "Published 1 combo.".
- **Tests made stricter** (criteria 6, 8, 9, 11, 12, 14, 17, 19, 20, 22, 23, 26, 30): the "1 duplicate removed" note and the "Type more" note are checked on screen; Refill from top is checked on two rows; the searches are driven by the keyboard alone, for knives too, and returning sends no catalog request; paging uses a full first page of 500 and checks offset 500; a combo is added from the finish page's Add knife link with exactly one request; a knife range override is cleared back to the batch-wide value; a refusal is mapped through the rows as sent with a row unticked; the edit page shows the last change; Publish selected sends exactly the selected ids; Delete is offered on an unpublished combo, and Cancel and a refusal are checked on the edit page; a restored batch shows the batch-wide range and the override's value; the CSRF header of each write is one the fake issued, and the last one the current session's.

Recorded, unchanged:

- When a save gets no answer, the batch reloads its candidates; the add and edit pages have no list to reload and keep the values, as Design asks.
- The drafts store records one owner for all its entries rather than a username per entry; the behaviour Design asks for (another admin sees none) is the same.
- A form counts as unsaved once it is changed, even if changed back (the knife order excepted), so the logout confirmation and the leave-page warning can appear with nothing to lose.
- A finish's own details (`GET /{kind}/{type}/{finish}`) are kept for the page load, like the catalog searches; finishes change only with a catalog import.

### Owner's change after the audit (2026-11-03)

R13 said a combo updated in a batch takes the batch-wide description, so a blank one cleared an existing description. The owner chose to keep the existing description unless one is typed. R13, Design (Existing combos in a batch) and criterion 18 were updated to match. `rowDescription` in `src/combos/batch.ts` is the rule, used both for the request and for the "after saving" text on the row (`src/pages/BatchPage.test.tsx::saving a batch::creates the ticked rows…`, `::keeps an updated combo description unless one is typed`, `::clears an updated combo description with an empty own description`). Lint, type check, 243 tests, build and the bundle check pass after it.

### Owner's change: browsing by type (2026-11-03)

After the audit the owner asked for a browse like the website's, besides the search, text only. R35 to R37, a Design row (Browsing), the routes and requests tables and criteria 42 to 44 were added. `src/pages/TypePage.tsx` is the type page; `FinishesPage` shows the type grid under the search, from the catalog it already loads; `catalogTypes` in `src/combos/queries.ts` groups catalog entries by type; finish pages link to their type. The knife search now gives a knife example ("karambit ruby") instead of the gloves one. Checked in the browser against a throwaway Compose stack with a placeholder admin and sample combos, both deleted afterwards: the real catalog's 20 knife and 8 glove types, a type page with its counts, and no horizontal scroll at 375 px on the new pages.

An independent audit of both owner's changes found, and these were fixed with tests: a type page kept saying "Counting combos…" when its combos could not be loaded (now "Combo count unavailable", with the error and Try again); a finish of a retired type linked to a type page that does not exist (the type is now named without a link); an active type without active finishes was left out of the grid, though R35 says every type (the catalog's type list is now kept with its finishes; such a type's page says it has no finishes); an unknown type still asked for its combos (now only a known type does); and "Set own description" on an existing combo started from the batch-wide description, clearing the current one at once (it now starts from the current description) (`src/pages/TypePage.test.tsx`, `src/pages/BatchPage.test.tsx::saving a batch`). Tests were added for the knife type links and request, the rarity colour, an unknown knife type, an existing description that is null, and a batch description of spaces. `admin/README.md` describes the type grid and type pages.

### Owner's change: pictures (2026-11-03)

The owner found the screens hard to scan without pictures and asked for the game's own, as the website uses, until the screenshot storage spec. R35 and R38, the Finish images and Browsing rows of Design, Security S5 and S9, and criteria 3, 32, 35, 42, 45 and 46 were updated; this replaces the first choice of no images and, for images only, spec 008 S4. `src/api/images.ts` holds the host (`IMAGE_ORIGIN`) and `pictureUrl`, which keeps only `https` URLs on it; `vite.config.ts` adds the host to `img-src`, and `scripts/check-bundle.mjs` names the same host (`scripts/csp.test.ts` checks both agree) and still refuses an `<img>` to any host in the built HTML. `src/combos/Picture.tsx` renders a picture lazily, without a referrer, with an empty `alt` beside its visible name, and leaves an empty box when there is none or it fails; `src/combos/pictures.ts` picks each type's picture. The fake catalog's pictures are on the image host (never fetched in tests).

Checked in the browser with a production build under its CSP, against a throwaway Compose stack with a placeholder admin and sample combos, both deleted afterwards: the 8 glove types and 20 knife types show their pictures, a type page shows all 35 of its finishes', and the finish page, combo rows and batch rows show theirs; no CSP violation; resources only from the app, the API and the image host; no horizontal scroll at 375 px.

### Owner's change: Home and the navigation (2026-11-03)

The owner asked for pictures beside By gloves and By knife on Home, and for the knife order to have less weight: out of the navigation, and a section of Home below Drafts that looks like Drafts. R21, R33, R38, the Navigation row of Design, the routes and requests tables, criterion 37 and a new criterion 47 were updated. Home asks for the two pictures' finishes (`GET /gloves/sport/pandoras-box`, `GET /knives/karambit/vanilla`); the knife order page links back to Home. Covered by `src/pages/HomePage.test.tsx::home`, `src/pages/KnifeOrderPage.test.tsx::links back to Home` and `src/App.test.tsx::shell`; checked in the browser on a throwaway stack with a placeholder admin, deleted afterwards, at desktop width and at 375 px.

### Owner's change: no rarity dots (2026-11-03)

The rarity colour dot beside each finish, on type pages and in search results, was removed at the owner's request: every glove finish is Extraordinary and every knife finish Covert, both the same red, so the dots told nothing apart once pictures were shown. R1, R36 and the Browsing row were updated; `src/pages/TypePage.test.tsx::a type page::lists the knife finishes…` and `src/combos/pictures.test.tsx::show in search options` check that no dot is drawn.

### Follow-ups

- The searches load the catalog with 9 requests for gloves and 21 for knives on each page load (Design, Follow-ups: one API request for every finish of a kind).
- On the edit page, "Keep mine" after a conflict on a form with no unsaved changes keeps the stored values of the new version, since there were none of the owner's own.
- Home asks for the draft count each time it is shown.
- Added URLs outside the repository and `localhost` are the npm registry and package metadata in `admin/package-lock.json`, and `example.com` placeholders in the test fake.

### Criterion coverage

Test ids are relative to `admin/`.

| Criterion | Covered by |
| --- | --- |
| 1 | In the worktree: `npm run api:types:check`, `lint`, `typecheck`, `test` (241 passed), `build` (no chunk-size warning) and `check:bundle` exit 0; on a fresh clone in the audit |
| 2 | The `node -p` command prints `@fontsource/montserrat @tanstack/react-query openapi-fetch react react-dom react-router` |
| 3 | `git diff --stat origin/main...HEAD -- admin/eslint.config.js admin/vite.config.ts admin/scripts/check-bundle.mjs` prints nothing; `grep -rn eslint-disable src` lists the three lines of `src/flow.test.tsx`; `src/lint.test.ts` |
| 4 | `src/combos/values.test.ts::parseRating` |
| 5 | `src/combos/values.test.ts::checkConditions` |
| 6 | `src/combos/values.test.ts::parseSeeds`; the note on screen in `src/pages/AddComboPage.test.tsx::creates one draft…` |
| 7 | `src/combos/values.test.ts::checkDescription` |
| 8 | `src/combos/fill.test.ts::fillRatings` |
| 9 | `src/combos/search.test.ts::search`; `src/pages/FinishesPage.test.tsx::shows at most 50 results, and asks for more words` |
| 10 | `src/combos/problems.test.ts` (`httpError`, `batchPlace`, `formField`, `problemMessage`) |
| 11 | `src/pages/FinishesPage.test.tsx::finding a finish` |
| 12 | `src/pages/FinishPage.test.tsx::a glove finish page` (first three tests), `::a knife finish page` |
| 13 | `src/pages/FinishPage.test.tsx::retired and unknown finishes` |
| 14 | `src/pages/AddComboPage.test.tsx` |
| 15 | `src/pages/BatchPage.test.tsx::choosing the knife finish`, `::the batch rows::lists every knife type in knife order…` |
| 16 | `src/pages/BatchPage.test.tsx::the batch rows::fills ratings 0.05 apart…` |
| 17 | `src/pages/BatchPage.test.tsx::the batch rows::applies batch-wide values…`, `::clears an override…` |
| 18 | `src/pages/BatchPage.test.tsx::saving a batch::creates the ticked rows…`, `::sends nothing with no row ticked` |
| 19 | `src/pages/BatchPage.test.tsx::saving a batch::shows a refusal on the row…`, `::reloads the rows when combos changed…` |
| 20 | `src/pages/EditComboPage.test.tsx::shows the pairing, status and history…` |
| 21 | `src/pages/EditComboPage.test.tsx::shows a conflict…`, `::takes their values`, `::says when the combo no longer exists`, `::says so when a save finds it removed` |
| 22 | `src/pages/FinishPage.test.tsx::managing combos from the list::publishes and unpublishes one combo`, `::publishes a selection…`, `::publishes only the selected combos that are shown`; `src/pages/EditComboPage.test.tsx::publishes, unpublishes…` |
| 23 | `src/pages/FinishPage.test.tsx::managing combos from the list::deletes a draft…`, `::keeps the combo listed when delete is refused`, `::reloads the list after a delete refused…`; `src/pages/EditComboPage.test.tsx::deletes after confirmation…`, `::offers delete on an unpublished combo…`, `::reads the combo again after a delete refused…` |
| 24 | `src/pages/HomePage.test.tsx` |
| 25 | `src/pages/KnifeOrderPage.test.tsx` |
| 26 | `src/combos/drafts.test.tsx::the $name form` (add, batch, edit, knife order), `::unsaved changes::come back after the session expires` |
| 27 | `src/combos/drafts.test.tsx::unsaved changes::stay when leaving the form…` |
| 28 | `src/combos/drafts.test.tsx::unsaved changes::are not shown to another admin`, `::make logout ask first…` |
| 29 | `src/combos/drafts.test.tsx::unsaved changes::make the browser warn before a reload` |
| 30 | `src/flow.test.tsx::entering combos` |
| 31 | `src/pages/FinishPage.test.tsx::renders names and descriptions as text`; `src/pages/EditComboPage.test.tsx::renders the description as text` |
| 32 | `scripts/csp.test.ts`, `scripts/check-bundle.test.ts` (a policy without the image host fails); `npm run build && npm run check:bundle` exits 0 |
| 33 | A throwaway Compose project from the worktree with `api/.env.example` (host ports moved so as not to touch the running stack) and a placeholder admin made with spec 007's tool, both deleted afterwards; the dev server pointed at it. "crimson kimono" found Specialist Gloves \| Crimson Kimono; the Doppler (Ruby) batch listed 18 knife types in the seeded order, Butterfly first; with Ursus, Paracord and Survival unticked, the top rating 9.50 and Karambit's own knife range 0 to 0.01, Save created 15 drafts; "Publish these 15 new combos" published them, and `GET /gloves/specialist/crimson-kimono/combos` returned 15 combos rated 9.50 down to 8.80 by 0.05, Karambit with its range. Ursus Doppler (Ruby) added from By gloves (rating typed `8,7`) and Sport Gloves \| Vice added from By knife. The same combo saved in two tabs: the second showed the conflict with 9.60 theirs and 9.30 yours. Karambit moved to position 1 with the keyboard, focus kept on its Move down button; a new batch listed it first |
| 34 | Same stack with `SESSION_IDLE_MINUTES=5`: half a batch filled (top rating 8.80, Talon unticked), more than five minutes without a request, then login showed with the session-ended notice and `next` set to the batch; logging in returned to it with "Restored unsaved changes.", the top rating and Talon unticked. A `beforeunload` event on the page with unsaved changes is cancelled |
| 35 | `vite build` against the check API and `vite preview` on port 5174: every page of the routes table visited, a search typed; no Content Security Policy violation reported or logged; resources only from `localhost:5174` and the API origin; session storage and IndexedDB empty, and the app added nothing to local storage or cookies (the browser already held another local app's entries for `localhost`, left untouched) |
| 36 | At 375 px every page of the routes table has `scrollWidth` equal to the width, and a batch of 17 rows was filled and saved at that width; at desktop width the same pages were used for criterion 33 |
| 37 | `src/App.test.tsx::shell::has the header, the navigation and the combo screens` (three links), `::titles %s` (every page of the routes table) |
| 38 | Pending: the `admin` workflow run after the branch is pushed |
| 39 | `admin/README.md`: first paragraph, Screens (with unsaved changes), Tests, Project structure |
| 40 | `git diff --stat origin/main...HEAD -- api website compose.yaml .github` prints nothing |
| 41 | `gitleaks dir .` and `gitleaks git --log-opts="origin/main..HEAD"`: no leaks; added URLs as in Follow-ups |
| 42 | `src/pages/TypePage.test.tsx::browsing types` |
| 43 | `src/pages/TypePage.test.tsx::a type page`; `src/App.test.tsx::shell::titles %s` |
| 44 | `src/pages/TypePage.test.tsx::finish pages` |
| 45 | `src/combos/pictures.test.tsx` (type grids, type page, search options, finish page and combo rows, batch rows and edit page) |
| 46 | `src/api/images.test.ts`; `src/combos/pictures.test.tsx::never come from another host, and a failed one is removed` |
| 47 | `src/pages/HomePage.test.tsx::home`; `src/pages/KnifeOrderPage.test.tsx::links back to Home` |

## Audit

**Date:** 2026-11-03 · **Branch:** 010-admin-combo-screens · **Commit:** 538534e (code: 4632560; the last commit changes only this spec)
**Verdict:** Pass with follow-ups

A first audit, on commit 3467bec, failed: an independent read of the code and tests against each criterion found that a delete refused for a stale version could not succeed from the same page, that a batch hid an existing combo's description it was about to replace, and that Publish selected could include combos hidden by a filter, plus smaller defects and tests weaker than their criteria. All were fixed with tests (Implementation notes, "Changes after the first audit"). A second independent read of the diff since 3467bec reverted each fix in a scratch clone and saw its test fail, then pass with the fix. This table is for commit 538534e.

All commands ran on a fresh clone of the branch with no `admin/.env`. The manual criteria (33 to 36) were checked during implementation against a throwaway Compose stack and a placeholder admin, both deleted afterwards; the code they exercise changed since only as listed under "Changes after the first audit", each covered by a test. Test ids are relative to `admin/`.

| # | Criterion | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Fresh clone: seven commands exit 0, no chunk warning | Pass | `npm ci`, `api:types:check`, `lint`, `typecheck`, `test` (241 passed), `build` (no chunk-size warning), `check:bundle` all exit 0 |
| 2 | Exactly six runtime dependencies | Pass | The `node -p` command prints `@fontsource/montserrat @tanstack/react-query openapi-fetch react react-dom react-router` |
| 3 | Guard rails, CSP and bundle check untouched; three lint exceptions | Pass | `git diff --stat origin/main...HEAD` over the three files prints nothing; three `eslint-disable` lines, all in `src/flow.test.tsx`; `src/lint.test.ts` passes |
| 4 | Rating parsing, formatting and steps | Pass | `src/combos/values.test.ts::parseRating` |
| 5 | Float range checks | Pass | `src/combos/values.test.ts::checkConditions` |
| 6 | Seeds, duplicates and note | Pass | `src/combos/values.test.ts::parseSeeds`; the note in `src/pages/AddComboPage.test.tsx::creates one draft…` |
| 7 | Description | Pass | `src/combos/values.test.ts::checkDescription` |
| 8 | Batch fill | Pass | `src/combos/fill.test.ts`; Refill from top on two rows in `src/pages/BatchPage.test.tsx::the batch rows::fills ratings…` |
| 9 | Search, order, 50 results | Pass | `src/combos/search.test.ts`; `src/pages/FinishesPage.test.tsx::shows at most 50 results…` |
| 10 | 422 paths and fixed messages; server text dropped | Pass | `src/combos/problems.test.ts` |
| 11 | Searches by keyboard, catalog loaded once | Pass | `src/pages/FinishesPage.test.tsx::finding a finish` |
| 12 | Finish page list, filters, sorts, paging | Pass | `src/pages/FinishPage.test.tsx::a glove finish page` (offsets 0 and 500, 501 listed), `::a knife finish page` |
| 13 | Retired and unknown finishes | Pass | `src/pages/FinishPage.test.tsx::retired and unknown finishes` |
| 14 | Add one combo; errors; 409 link | Pass | `src/pages/AddComboPage.test.tsx` |
| 15 | Batch finish names and rows | Pass | `src/pages/BatchPage.test.tsx::choosing the knife finish`, `::the batch rows::lists every knife type…` |
| 16 | Fill on screen | Pass | `src/pages/BatchPage.test.tsx::the batch rows::fills ratings…` |
| 17 | Batch-wide values, overrides, row checks, Vanilla | Pass | `src/pages/BatchPage.test.tsx::the batch rows::applies batch-wide values…`, `::clears an override…` |
| 18 | Batch request, result, publish these | Pass | `src/pages/BatchPage.test.tsx::saving a batch::creates the ticked rows…`, `::sends nothing with no row ticked` |
| 19 | Batch 422 on the sent row; 409 reload | Pass | `src/pages/BatchPage.test.tsx::saving a batch::shows a refusal…` (a row unticked), `::reloads the rows…` |
| 20 | Edit page and save with version | Pass | `src/pages/EditComboPage.test.tsx::shows the pairing…` |
| 21 | Conflict view; 404 | Pass | `src/pages/EditComboPage.test.tsx` (conflict, theirs, 404 on read and save) |
| 22 | Publish and unpublish, selection | Pass | `src/pages/FinishPage.test.tsx::managing combos from the list` (one combo, exact selected ids, shown selections only); `src/pages/EditComboPage.test.tsx::publishes, unpublishes…` |
| 23 | Delete rules and refusals | Pass | `src/pages/FinishPage.test.tsx::managing combos from the list` (delete, refusals, reload after a stale version); `src/pages/EditComboPage.test.tsx` (delete, unpublished, refusal, reload after a stale version) |
| 24 | Publish all drafts | Pass | `src/pages/HomePage.test.tsx` |
| 25 | Knife order | Pass | `src/pages/KnifeOrderPage.test.tsx` |
| 26 | Restore after a session end, four forms, and after expiry | Pass | `src/combos/drafts.test.tsx::the $name form`, `::unsaved changes::come back after the session expires` |
| 27 | Leave and return; gone after save | Pass | `src/combos/drafts.test.tsx::unsaved changes::stay when leaving the form…` |
| 28 | Another admin; logout confirmation | Pass | `src/combos/drafts.test.tsx::unsaved changes::are not shown to another admin`, `::make logout ask first…` |
| 29 | Leave-page warning | Pass | `src/combos/drafts.test.tsx::unsaved changes::make the browser warn before a reload` |
| 30 | Full combo flow: no storage; writes to the API with the token | Pass | `src/flow.test.tsx::entering combos` (tokens compared with those issued) |
| 31 | Text, never HTML | Pass | `src/pages/FinishPage.test.tsx::renders names and descriptions as text`; `src/pages/EditComboPage.test.tsx::renders the description as text` |
| 32 | Bundle check; CSP unchanged | Pass | `scripts/csp.test.ts`; `npm run check:bundle` exits 0 |
| 33 | README walkthrough against the real API | Pass | Implementation notes, criterion 33: 15 drafts saved and published, public route returns them rated 9.50 to 8.80, adds from both directions, the two-tab conflict, the knife order followed by a new batch |
| 34 | Idle end keeps the batch; reload warning | Pass | Implementation notes, criterion 34 |
| 35 | Built app: no CSP violations, two origins, nothing stored | Pass | Implementation notes, criterion 35 |
| 36 | 375 and 1440 px | Pass | Implementation notes, criterion 36 |
| 37 | Navigation and titles | Pass | `src/App.test.tsx::shell::has the header, the navigation and the combo screens`, `::titles %s` |
| 38 | `admin` workflow succeeds | Pending | Runs when the owner pushes the branch |
| 39 | Admin README | Pass | `admin/README.md`: first paragraph, Screens, Tests, Project structure |
| 40 | No change outside `admin/` and the spec | Pass | `git diff --stat origin/main...HEAD -- api website compose.yaml .github` prints nothing |
| 41 | Allowed URLs; gitleaks clean | Pass | Added URLs: the repository, `localhost`, `example.com` placeholders, and npm registry metadata in the lockfile; `gitleaks dir` on the clone and `gitleaks git --log-opts="origin/main..HEAD"`: no leaks |

| Check | Command | Result |
| --- | --- | --- |
| Install | `npm ci` (Node 24, npm 11) | Pass |
| Lint | `npm run lint` | Pass |
| Type check | `npm run typecheck` | Pass |
| Tests | `npm test`: 241 passed | Pass |
| Build | `npm run build`, `npm run check:bundle` | Pass |
| Secret scan | `gitleaks dir`, `gitleaks git --log-opts="origin/main..HEAD"` | Pass |
| Public exposure | Manual review of the diff and log: placeholders only, `localhost` and `example.com` addresses, no private hosts or paths, nothing private tracked (`.claude/` and `CLAUDE.md` ignored); every commit authored by the owner with a one-line message and no trailers | Pass |
| Design conformance | Two independent reads and manual review against Requirements, Design, API / data model and Security | Pass; differences are recorded in Implementation notes |

**Findings**

- (follow-up) Criterion 38 waits for the push: the `admin` workflow has not run on this branch yet.
- (follow-up) After a delete refused for a stale version, the edit page enables its buttons before the combo has been read again (`admin/src/pages/EditComboPage.tsx`, `remove`); a Delete clicked in that moment sends the old version and gets another 409, harmlessly.
- (follow-up) A form counts as unsaved once changed, even when changed back, so the logout confirmation and the leave-page warning can appear with nothing to lose.
- (follow-up) The owner's two changes after this audit were audited on their own; see "Audit of the owner's changes" below.
- (resolved after the audit) A batch replaced an updated combo's description with a blank batch-wide one. The owner changed R13 to keep it unless one is typed; see Implementation notes, "Owner's change after the audit". The change is covered by tests and was not re-audited as a whole.
- (follow-up) The searches load the catalog in 9 or 21 requests per page load (API follow-up in Design).
- (follow-up) The manual criteria were not repeated after the first audit's fixes; each fix is covered by a test.

### Audit of the owner's changes

**Date:** 2026-11-03 · **Commit:** f68a151 · **Verdict:** Pass with follow-ups

Both changes made after the audit above (existing descriptions kept in a batch; browsing by type) were read by an independent reviewer against R13, R35 to R37, their Design rows and criteria 18 and 42 to 44, with probes in a scratch clone. The defects found were fixed with tests (Implementation notes, "Owner's change: browsing by type"). On a fresh clone of commit f68a151: `npm ci`, `api:types:check`, `lint`, `typecheck`, `test` (260 passed), `build` (no chunk-size warning) and `check:bundle` exit 0; `gitleaks git --log-opts="origin/main..HEAD"` and `gitleaks dir` report no leaks; no change outside `admin/` and the spec; no image, other host, storage or server text added.

| # | Criterion | Result | Evidence |
| --- | --- | --- | --- |
| 18 | Batch request, with the description rule | Pass | `src/pages/BatchPage.test.tsx::saving a batch` (kept, typed, cleared, null, spaces, own description from the current one) |
| 42 | Type grids under the searches | Pass | `src/pages/TypePage.test.tsx::browsing types` |
| 43 | Type pages with counts; unknown types | Pass | `src/pages/TypePage.test.tsx::a type page`; `src/App.test.tsx::shell::titles %s` |
| 44 | Finish pages link to their type | Pass | `src/pages/TypePage.test.tsx::finish pages` |

**Findings**

- (follow-up) The new pages were checked in the browser before the reviewer's fixes, against a throwaway stack; the fixes are covered by tests, not rechecked by hand.
- (follow-up) Criterion 38 still waits for the `admin` workflow on the pushed branch.

### Audit of the pictures change

**Date:** 2026-11-03 · **Commit:** 9637421 (code; the spec line was filled in after) · **Verdict:** Pass with follow-ups

The owner's pictures change (`git diff ec86a9b..HEAD`) was read by an independent reviewer against R38, the Finish images row, S5, S7, S9 and criteria 3, 32, 35, 41, 42, 45 and 46, with probes of `pictureUrl` (other ports, an explicit `:443`, user info, look-alike hosts, a trailing dot, upper case, leading spaces, `http`, relative URLs: all refused) and of the real catalog snapshot (every picture on the image host, every knife type with a Vanilla, every fixed glove finish present). It found no defect against a requirement; it found tests weaker than criteria 42, 45 and 46, a picture and its name that could wrap apart on the edit and add pages, and spec lines that still described the first choice (S7, criterion 41, the add page's picture, the bundle check's text rule, two Design rows). All were fixed or corrected, with tests where they apply. On a clean clone: `npm ci`, `lint`, `typecheck`, `test` (284 passed), `build` (no chunk-size warning) and `check:bundle` exit 0; `gitleaks` reports no leaks. The browser check in Implementation notes ("Owner's change: pictures") covers criterion 35 for pictures.

| # | Criterion | Result | Evidence |
| --- | --- | --- | --- |
| 3 | Guard rails kept; CSP changed only by the image host | Pass | `scripts/csp.test.ts`; `git diff` of `eslint.config.js` is empty |
| 32 | Policy with the image host; bundle check expects it | Pass | `scripts/csp.test.ts`, `scripts/check-bundle.test.ts` |
| 42 | Type grids with pictures | Pass | `src/pages/TypePage.test.tsx::browsing types`; `src/combos/pictures.test.tsx` (Vanilla even when not first, fixed glove finishes, first-finish fallback) |
| 45 | Pictures where R38 lists them, lazy, without a referrer, empty `alt` | Pass | `src/combos/pictures.test.tsx` |
| 46 | Pictures only from the image host; failed ones leave an empty box | Pass | `src/api/images.test.ts`; `src/combos/pictures.test.tsx::never come from another host…` |

**Findings**

- (follow-up) The bundle check accepts the image host as text anywhere in the built files, so a script using it for something other than a picture would pass the check; the CSP's `connect-src` still blocks such a request at run time.
- (follow-up) Lazy loading inside the scrolling search list cannot be tested in jsdom; it was seen working in the browser.
- (follow-up) Replace the pictures when the screenshot storage spec lands.

### Check of the Home and navigation change

**Date:** 2026-11-03 · **Verdict:** Pass

A small change to Home and the navigation (Implementation notes, "Owner's change: Home and the navigation"), checked against R21, R33, R38 and criteria 37 and 47 without a separate reviewer: `npm run lint`, `typecheck`, `test` (286 passed), `build` and `check:bundle` exit 0 on a fresh clone; the browser check is in Implementation notes.

