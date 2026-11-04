# 013: Combo card details

**Status:** Implemented
<!-- Lifecycle: Draft → Approved → Implemented → Audited -->

**Section:** website
**Branch:** 013-website-combo-card-details

## Summary

Every combo card on the website shows the same four condition rows, saying "Any" where a combo sets no float range or pattern. Today a combo with no conditions and no description leaves an empty band under its title, and that is most combos: none of the owner's first 72 have conditions or descriptions. "Any" also tells a visitor something useful: any copy of the skin works.

## Goals and non-goals

**Goals**

- The same four condition rows on every card, with "Any" or "None" where no limit applies.

**Non-goals**

- A rarity line. Every knife finish in the catalog is Covert and every glove finish Extraordinary, both in the same colour, so it would read the same on every card (owner's choice).
- A link from each card to the other item's combos page. It was built, then dropped by the owner on 2026-11-04 after seeing it on the page.
- Prices and market links: they need a price source, and get their own spec.
- Combo screenshots (spec 012), combo counts (a follow-up of spec 011), any API change.
- Changes to the score circle, pictures, header, grid, or loading and error states.

## Context

This spec builds on spec 011 (the website shows real combos from the API), which must be merged first. Spec 011 already names spec 012 as the combo screenshots spec, so this one is 013.

- `website/src/pages/Combos.tsx` (after spec 011): `ComboCard` shows `ComboPictures`, then the other item's name as an `<h3>`, the description if there is one, and `ScoreCircle` to the right. Below, a bordered two-column grid shows only the conditions that are set, in the order Glove Pattern, Knife Pattern, Glove Float, Knife Float; with none set, the grid and its border are left out. The left column ends at the title (or description), while the score circle is 96 px tall on wide screens, which leaves the empty band.
- `website/src/components/comboText.ts`: `itemName`, `floatRange` ("0 - 0.01", or null without a range) and `patternSeeds` ("2, 179", or null when any pattern goes).
- `website/src/api/schema.d.ts`: each combo item (`Item`, spec 009) has `type_slug`, `finish_slug`, `type_name`, `display_name`, `active`, `float_from`, `float_to`, `seeds`, `float_min`, `float_max` and `rarity`. `float_min` and `float_max` are the finish's own float range, both null for Vanilla, which takes no float range and no pattern seeds (spec 009, R19).
- `website/src/pages/Combos.test.tsx`: Vitest and Testing Library tests against a fake API; the card test checks that unset conditions are not shown.
- `website/docs/screenshots/combos.png` (spec 011) shows cards without conditions, as the README's combos page picture.
- Rarity data checked for this spec: in `api/src/combo_api/catalog/snapshot.json`, all 576 knife finishes are Covert and all 94 glove finishes Extraordinary, both with colour `#eb4b4b`.

## Requirements

- R1. Every combo card shows four condition rows, in this order: Glove Pattern, Knife Pattern, Glove Float, Knife Float. This replaces the part of spec 011's R3 that shows only the conditions that are set.
- R2. A row's value is the item's seeds ("2, 179") or float range ("0 - 0.01") when the combo sets one; "Any" when it sets none; and "None" when the item's finish has no float range (Vanilla), for both its float and its pattern.
- R3. `website/docs/screenshots/combos.png` shows the new cards, and its alt text in `website/README.md` describes them.

## Design

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| Unset conditions (owner's choice) | All four rows on every card, "Any" when unset. Cards line up, and a mixed combo (glove seeds set, any knife pattern) reads clearly | `Any float` and `Any pattern` chips only when neither item has a limit: cards of different heights, and the mixed case is unclear. Keeping rows hidden: the empty band stays |
| Vanilla | "None" for both its rows, from `float_min === null` on the item | "Any": wrong, a Vanilla knife has no float or pattern to choose. Hiding its rows: cards differ again |
| Value text | `floatRange` and `patternSeeds` in `comboText.ts` return "Any" or "None" instead of null; `ComboCard` drops its filter | Mapping null to text in `ComboCard`: two places deciding what an unset value means |
| Rarity line (owner's choice) | None | A rarity line: the same words and colour on every card |
| Link to the other item's combos (owner's choice) | None | A "See all {item} combos →" line under the title: built and seen on the page, then dropped by the owner |

## API / data model

None.

## Security

- S1. No new requests: the card uses data the combos request already returns, and the API is unchanged.

## Acceptance criteria

1. A card whose combo sets glove seeds and a knife float range, but no glove float or knife seeds, shows "Glove Pattern: 2, 179", "Knife Pattern: Any", "Glove Float: Any" and "Knife Float: 0 - 0.01", in that order. Test in `Combos.test.tsx`.
2. A card whose combo sets no conditions shows all four rows with "Any". Test.
3. A card whose knife is Vanilla shows "Knife Pattern: None" and "Knife Float: None", and "Any" for the unset glove rows. Test.
4. `website/docs/screenshots/combos.png` is replaced with a picture of the new cards, and the README still embeds it, with alt text that mentions the condition rows. Manual check: open the file and the README.
5. Lint, the API types check, tests and build pass on a clean checkout. Commands below.
6. `git diff main...013-website-combo-card-details -- api/` is empty.

## Test plan

| Criterion | How it is checked |
| --- | --- |
| 1, 2, 3 | Vitest: card condition tests in `website/src/pages/Combos.test.tsx`, replacing the check that unset conditions are hidden |
| 4 | Manual: open the screenshot and the README |
| 5 | `cd website && npm ci && npm run lint && npm run api:types:check && npm test && npm run build`, each exits 0 |
| 6 | The `git diff` command prints nothing |

## Open questions

None. On 2026-11-04 the owner chose to drop the rarity line and to show all four rows with "Any", and, after seeing it on the page, to drop the link to the other item's combos.

## Implementation notes

**2026-11-04.** Built on `main` after spec 011 was merged.

**2026-11-04, link dropped.** The first build also had a "See all {item} combos →" link under each card's title (then R3 to R5, with criteria for it). After seeing it on the page, the owner asked for it to be removed: the link, its catalog lookup and its tests are gone, and Requirements, Design and the criteria above were changed to match. The card's layout above the condition rows is as it was after spec 011.

| # | Covered by |
| --- | --- |
| 1 | `website/src/pages/Combos.test.tsx:120` "shows the four conditions in order, with the values a combo sets" |
| 2 | `Combos.test.tsx:136` "says "Any" for every condition a combo leaves open" |
| 3 | `Combos.test.tsx:150` "says "None" for the pattern and float of a Vanilla knife" (Bayonet \| Vanilla, as in the catalog: `float_min` and `float_max` null) |
| 4 | `website/docs/screenshots/combos.png`: Specialist Gloves \| Crimson Kimono at 1440 px wide, from a local API with the owner's combos, header and first two cards. `website/README.md` alt text updated, and its feature line now mentions the rows |
| 5 | `npm ci`, `npm run lint`, `npm run api:types:check`, `npm test` and `npm run build` each exit 0 |
| 6 | `git diff origin/main...HEAD -- api/` prints nothing |

Notes:

- The existing card test no longer checks that unset conditions are hidden (R1 replaces that part of spec 011's R3); the new tests above check the rows instead.

## Audit

Filled in by the audit: one line per acceptance criterion (pass or fail, with evidence), the results of lint, tests, build and the secret scan, and a verdict of Pass, Pass with follow-ups, or Fail.
