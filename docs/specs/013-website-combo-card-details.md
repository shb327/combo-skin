# 013: Combo card details and links

**Status:** Approved
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

Filled in during implementation: deviations from the design and why, follow-ups discovered, and which test covers each acceptance criterion.

## Audit

Filled in by the audit: one line per acceptance criterion (pass or fail, with evidence), the results of lint, tests, build and the secret scan, and a verdict of Pass, Pass with follow-ups, or Fail.
