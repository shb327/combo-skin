# 013: Combo card details and links

**Status:** Audited
<!-- Lifecycle: Draft → Approved → Implemented → Audited -->

**Section:** website
**Branch:** 013-website-combo-card-details

## Summary

Every combo card on the website shows the same four condition rows, saying "Any" where a combo sets no float range or pattern, and links to the other item's combos page. Today a combo with no conditions and no description leaves an empty band under its title, and that is most combos: none of the owner's first 72 have conditions or descriptions. "Any" also tells a visitor something useful: any copy of the skin works.

## Goals and non-goals

**Goals**

- The same four condition rows on every card, with "Any" or "None" where no limit applies.
- A link from each card to the combos page of the other item (the knife on glove pages, the gloves on knife pages).

**Non-goals**

- A rarity line. Every knife finish in the catalog is Covert and every glove finish Extraordinary, both in the same colour, so it would read the same on every card (owner's choice).
- Prices and market links: they need a price source, and get their own spec.
- Combo screenshots (spec 012), combo counts (a follow-up of spec 011), any API change.
- Changes to the score circle, pictures, header, grid, or loading and error states.

## Context

This spec builds on spec 011 (the website shows real combos from the API), which must be merged first. Spec 011 already names spec 012 as the combo screenshots spec, so this one is 013.

- `website/src/pages/Combos.tsx` (after spec 011): `ComboCard` shows `ComboPictures`, then the other item's name as an `<h3>`, the description if there is one, and `ScoreCircle` to the right. Below, a bordered two-column grid shows only the conditions that are set, in the order Glove Pattern, Knife Pattern, Glove Float, Knife Float; with none set, the grid and its border are left out. The left column ends at the title (or description), while the score circle is 96 px tall on wide screens, which leaves the empty band.
- `website/src/components/comboText.ts`: `itemName`, `floatRange` ("0 - 0.01", or null without a range) and `patternSeeds` ("2, 179", or null when any pattern goes).
- `website/src/api/schema.d.ts`: each combo item (`Item`, spec 009) has `type_slug`, `finish_slug`, `type_name`, `display_name`, `active`, `float_from`, `float_to`, `seeds`, `float_min`, `float_max` and `rarity`. `float_min` and `float_max` are the finish's own float range, both null for Vanilla, which takes no float range and no pattern seeds (spec 009, R19).
- `website/src/App.tsx`: combos pages are `/gloves/:itemId/:finishId/combos` and `/knives/:itemId/:finishId/combos`, whose slugs are the API's `type_slug` and `finish_slug`.
- `website/src/data/catalog.json`: the bundled catalog, active types and finishes only. A URL whose finish is not in it shows "Item not found" (spec 011, R7).
- `website/src/components/ScrollToTop.tsx`: scrolls to the top on every route change.
- `website/src/pages/Combos.test.tsx`: Vitest and Testing Library tests against a fake API; the card test checks that unset conditions are not shown.
- `website/docs/screenshots/combos.png` (spec 011) shows cards without conditions, as the README's combos page picture.
- Rarity data checked for this spec: in `api/src/combo_api/catalog/snapshot.json`, all 576 knife finishes are Covert and all 94 glove finishes Extraordinary, both with colour `#eb4b4b`.

## Requirements

- R1. Every combo card shows four condition rows, in this order: Glove Pattern, Knife Pattern, Glove Float, Knife Float. This replaces the part of spec 011's R3 that shows only the conditions that are set.
- R2. A row's value is the item's seeds ("2, 179") or float range ("0 - 0.01") when the combo sets one; "Any" when it sets none; and "None" when the item's finish has no float range (Vanilla), for both its float and its pattern.
- R3. Each card shows the line "See all {other item's full name} combos →" under the title and the description, linking to `/{knives|gloves}/{type_slug}/{finish_slug}/combos` of the other item. It navigates inside the site, without reloading the page.
- R4. When the other item's finish is not in the bundled catalog (for example a retired finish, which a published combo can still have), the card shows no link line, since that page would say "Item not found".
- R5. The link's accessible name is "See all {other item's full name} combos"; the arrow is decoration.
- R6. `website/docs/screenshots/combos.png` shows the new cards, and its alt text in `website/README.md` describes them.

## Design

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| Unset conditions (owner's choice) | All four rows on every card, "Any" when unset. Cards line up, and a mixed combo (glove seeds set, any knife pattern) reads clearly | `Any float` and `Any pattern` chips only when neither item has a limit: cards of different heights, and the mixed case is unclear. Keeping rows hidden: the empty band stays |
| Vanilla | "None" for both its rows, from `float_min === null` on the item | "Any": wrong, a Vanilla knife has no float or pattern to choose. Hiding its rows: cards differ again |
| Value text | `floatRange` and `patternSeeds` in `comboText.ts` return "Any" or "None" instead of null; `ComboCard` drops its filter | Mapping null to text in `ComboCard`: two places deciding what an unset value means |
| Rarity line (owner's choice) | None | A rarity line: the same words and colour on every card |
| Link place (owner's choice) | A line in the left column under the title and description, beside the score circle, so it fills the band | The title as the link: hard to notice, and the band stays empty. Both: two links to one page per card |
| Link element | React Router `Link`, `text-sm` in the site's muted white with a hover state; the arrow in an `aria-hidden` span | A plain `<a>`: reloads the whole site and drops the query cache |
| Link check | The other item is looked up in the bundled catalog (`getAllKnives` / `getAllGloves`) by `type_slug` and `finish_slug`; no match, no link | Linking always: a retired finish's page says "Item not found". Using `active`: the bundled catalog is what decides whether a page exists |

## API / data model

None.

## Security

- S1. The link's path is built only from a finish found in the bundled catalog; text from the API never becomes a path or HTML.
- S2. No new requests: the card uses data the combos request already returns, and the API is unchanged.

## Acceptance criteria

1. A card whose combo sets glove seeds and a knife float range, but no glove float or knife seeds, shows "Glove Pattern: 2, 179", "Knife Pattern: Any", "Glove Float: Any" and "Knife Float: 0 - 0.01", in that order. Test in `Combos.test.tsx`.
2. A card whose combo sets no conditions shows all four rows with "Any". Test.
3. A card whose knife is Vanilla shows "Knife Pattern: None" and "Knife Float: None", and "Any" for the unset glove rows. Test.
4. On a glove page, a card's link is named "See all {knife full name} combos" and points to `/knives/{type}/{finish}/combos`; clicking it shows that knife finish's page and requests its combos, with no full page load. Test.
5. On a knife page, a card's link points to `/gloves/{type}/{finish}/combos` of its gloves. Test.
6. A card whose other item is not in the bundled catalog has no link and still shows its title, score and conditions. Test.
7. The arrow is not part of the link's accessible name. Covered by the name checks in 4 and 5.
8. `website/docs/screenshots/combos.png` is replaced with a picture of the new cards, and the README still embeds it, with alt text that mentions the condition rows and the link. Manual check: open the file and the README.
9. Lint, the API types check, tests and build pass on a clean checkout. Commands below.
10. `git diff main...013-website-combo-card-details -- api/` is empty.

## Test plan

| Criterion | How it is checked |
| --- | --- |
| 1, 2, 3 | Vitest: card condition tests in `website/src/pages/Combos.test.tsx`, replacing the check that unset conditions are hidden |
| 4, 5, 7 | Vitest: link tests on a glove page and a knife page, with the fake API answering both pages; the link found by its role and exact name |
| 6 | Vitest: a combo whose knife slug is not in the bundled catalog |
| 8 | Manual: open the screenshot and the README |
| 9 | `cd website && npm ci && npm run lint && npm run api:types:check && npm test && npm run build`, each exits 0 |
| 10 | The `git diff` command prints nothing |

## Open questions

None. On 2026-11-04 the owner chose to drop the rarity line, to show all four rows with "Any", and to put the link on its own line under the title.

## Implementation notes

**2026-11-04.** Built on `main` after spec 011 was merged. No requirement changed.

| # | Covered by |
| --- | --- |
| 1 | `website/src/pages/Combos.test.tsx:120` "shows the four conditions in order, with the values a combo sets" |
| 2 | `Combos.test.tsx:136` "says "Any" for every condition a combo leaves open" |
| 3 | `Combos.test.tsx:150` "says "None" for the pattern and float of a Vanilla knife" (Bayonet \| Vanilla, as in the catalog: `float_min` and `float_max` null) |
| 4 | `Combos.test.tsx:254` "takes a glove page card to its knife finish page, inside the site". The site renders in a `MemoryRouter`, which changes page only through the router: with the link swapped for a plain `<a href>`, this test fails (checked once by hand) |
| 5 | `Combos.test.tsx:273` "takes a knife page card to its glove finish page" |
| 6 | `Combos.test.tsx:285` "leaves the link out when the site does not know the other finish" |
| 7 | `Combos.test.tsx:254` and `:273`: the link is found by its exact name, without the arrow, and `:254` checks the visible text ends in "→" |
| 8 | `website/docs/screenshots/combos.png`: Specialist Gloves \| Crimson Kimono at 1440 px wide, from a local API with the owner's combos, header and first two cards (1440×696, 156 KB). `website/README.md` alt text updated, and its feature line now mentions the rows and the link |
| 9 | Fresh clone, no `.env`: `npm ci`, `npm run lint`, `npm run api:types:check`, `npm test` (56 tests) and `npm run build` (no warnings) each exit 0; no `/src/` path in `dist/` |
| 10 | `git diff origin/main...HEAD -- api/` prints nothing |

Notes:

- The link text uses `text-sm md:text-base`, the description's sizes, not `text-sm` alone as in Design, so the two lines under the title read at one size on wide screens.
- A no-break space joins the arrow to "combos": without it, a long name (Butterfly Knife \| Doppler (Ruby)) left the arrow alone on a line.
- `combosPath` looks the other finish up in the bundled catalog for every card (up to 576 entries); fast enough for the up to 35 cards a page shows today, and simple to cache if pages grow.
- The existing card test no longer checks that unset conditions are hidden (R1 replaces that part of spec 011's R3); the new tests above check the rows instead.
- Checked in a browser against the local API: the link works both ways, the new page starts at the top, and the card fits at 375 px wide (the link wraps under the title, the score stays beside it).

## Audit

**Date:** 2026-11-04 · **Branch:** 013-website-combo-card-details · **Commit:** 1a40b10
**Verdict:** Pass with follow-ups

Tests were run with `npx vitest run src/pages/Combos.test.tsx` in `website/` and in the full suite below. For criteria 3, 4, 6 and 7, the code was broken on purpose once and the test failed each time: no Vanilla rule (`:150` fails), a plain `<a href>` instead of the router link (`:254` fails), a link for every finish (`:285` fails), and an arrow without `aria-hidden` (`:254` and `:273` fail).

| # | Criterion | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Set values, others "Any", in order | Pass | `website/src/pages/Combos.test.tsx:120`: all four rows compared in order |
| 2 | No conditions: four rows of "Any" | Pass | `Combos.test.tsx:136` |
| 3 | Vanilla knife: "None" for its rows, "Any" for the unset glove rows | Pass | `Combos.test.tsx:150`, with `float_min` and `float_max` null as in the catalog |
| 4 | Glove page link: name, path, opens the knife page inside the site and requests its combos | Pass | `Combos.test.tsx:254`: exact name, `href`, the new page's heading and cards, and the requests in order; fails with a plain `<a>` |
| 5 | Knife page link to its gloves' page | Pass | `Combos.test.tsx:273`: exact name and `href` |
| 6 | Unknown other finish: no link; title, score and conditions still shown | Pass | `Combos.test.tsx:285` |
| 7 | The arrow is not in the link's name | Pass | `Combos.test.tsx:254` and `:273` find the link by exact name; both fail when the arrow is not hidden |
| 8 | New screenshot; README embeds it with alt text naming the rows and the link | Pass | `website/docs/screenshots/combos.png` (1440×696, commit 2e6a3c5) opened: header, two cards with the link line and four "Any" rows; `website/README.md:24` |
| 9 | Lint, types check, tests and build on a clean checkout | Pass | Checks below |
| 10 | No change under `api/` | Pass | `git diff origin/main...HEAD -- api/` prints nothing |

| Check | Command | Result |
| --- | --- | --- |
| Install | `npm ci` in `website/` of a fresh clone at 1a40b10, no `.env` (only `.env.example`) | Pass, exit 0 |
| Lint | `npm run lint` | Pass, exit 0 |
| API types | `npm run api:types:check` | Pass, exit 0 |
| Tests | `npm test` | Pass, exit 0: 5 files, 56 tests |
| Build | `npm run build`, then the workflow's `grep -rlF '/src/' dist` | Pass, exit 0, no warnings; no `/src/` paths |
| Secret scan | `gitleaks git --log-opts="origin/main..013-website-combo-card-details"` and `gitleaks dir .` | Pass, no leaks |
| Public exposure | Manual review of the branch diff and log; `git check-ignore -v .claude/ CLAUDE.md`; `git ls-files` for private files | Pass: no secrets, hosts, addresses or local paths; the screenshot shows only the page; `.claude/` and `CLAUDE.md` ignored and untracked; 7 commits by the owner, one line each, no trailers |
| Design conformance | Code compared with Design and Security | Pass; the two differences (link text size, no-break space) are recorded in Implementation notes |

**Findings**

- (follow-up) `website/src/pages/Combos.tsx:184`: the no-break space is a literal character in the source, which looks like a plain space; an editor or formatter could replace it unnoticed, and no test would catch it. `{' '}` would make it visible.
- (follow-up) No test checks where the link sits (under the title and description, beside the score, as R3 says); it was checked by eye in a browser during implementation and in the screenshot.
- (follow-up) `combosPath` searches the bundled catalog for every card on every render (recorded in Implementation notes). Fine for today's page sizes.
