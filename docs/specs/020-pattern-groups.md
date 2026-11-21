# 020: Pattern groups

**Status:** Approved
<!-- Lifecycle: Draft → Approved → Implemented → Audited -->

**Section:** api, admin, website
**Branch:** 020-pattern-groups

## Summary

Pattern groups are the community's names for special patterns of a finish: Blue Gem and Gold Gem on Case Hardened, Black Gem on Scorched, Full Fade on Fade, Fire & Ice on Marble Fade, and others. Each group holds one example seed for every knife type it exists on, with credit to the guide it comes from. When adding a combo or a batch in the dashboard, the owner clicks "Add special pattern", picks a group, and each knife gets its own example seed and the group's name. The website then shows "Blue Gem · 387" instead of a bare number. This comes before the owner enters the full library of about 2,000 combos.

## Goals and non-goals

**Goals**

- The 13 groups the owner listed (Design, The groups), as a reviewed data file in the repository, imported into the database like the catalog.
- On every combo item, a link to the group its pattern came from, next to the seeds it already has.
- "Add special pattern" in the dashboard: on the add and edit pages for each item, and once for a whole batch, which gives each knife row its own seed.
- The group's name in the API's combo items and on the website's combo cards.
- A credit for every group's source, stored with the group.
- Groups frozen once imported, and a picture of every example for the owner to review before the file is final.

**Non-goals**

- The publish step and anything on Cloudflare: spec 021. This spec only keeps everything it adds static-friendly (Design, Static files).
- Combo variations (several combos for one pairing, such as regular, Blue Gem and Gold Gem Case Hardened) and prices: phase 2. Design, Variations, says how this spec leaves room for them.
- The credits page: its own spec, before the public site goes live (Design, Credits).
- Analytics; the 3D viewer.
- Tiers (tier 1, tier 2 and so on), full seed lists of a group, and computing groups from the seed (Design).
- Glove pattern groups (owner's choice, 2026-11-16). The data model keeps a kind per group, so one can be added later without a migration.
- Editing groups in the dashboard.
- Changing a group once it is imported, and retaking the screenshots of the combos that use it: its own spec, if it is ever needed (owner's rule, 2026-11-16).
- Changing existing combos' patterns from a batch: batch `update` items still carry only rating and description (spec 009).

## Context

Specs 001 to 019 are Audited and merged into `main`.

**Combos** (specs 009, 010)

- `api/src/combo_api/combos/models.py`: `combos` has `glove_seeds` and `knife_seeds`, `integer[]`, 0 to 1000, at most 100, sorted, empty meaning any pattern. A finish without a float range (Vanilla) takes no seeds.
- `api/src/combo_api/combos/schemas.py`: `Conditions` (`float_from`, `float_to`, `seeds`) is used by create (`ItemIn`), update (`ComboUpdate`) and batch create (`BatchCreate`). `Item`, returned in admin and public combos, carries the finish and the combo's conditions. Batch `update` items carry `id`, `version`, rating and description only.
- `api/src/combo_api/combos/rules.py`: catalog checks with 422 `type` codes (`finish_not_found`, `finish_has_no_pattern`, ...).
- A knife finish slug names the same finish on every knife type, and a batch is keyed by it (spec 009, Batch key). Every finish a group belongs to exists as one slug: `case-hardened`, `scorched`, `urban-masked`, `safari-mesh`, `fade` on all 20 knife types; `marble-fade` on 18 (not Classic, Kukri); `gamma-doppler-phase-1`, `-phase-3` and `-phase-4` on 10 (Bayonet, Bowie, Butterfly, Falchion, Flip, Gut, Huntsman, Karambit, M9 Bayonet, Shadow Daggers). (`api/src/combo_api/catalog/snapshot.json`).
- `api/src/combo_api/screenshots/inputs.py`: a combo's screenshot uses the lowest seed of each item, so the example seed a group gives is the one the screenshot shows.

**Catalog import** (specs 005, 006)

- `api/src/combo_api/catalog/importer.py`: loads the committed `snapshot.json` into tables; inserts, updates in place, deactivates, never deletes. `compose.services.yaml` runs it as the `catalog` service after `migrate`. `display_order.json` and `slug_overrides.json` are other committed data files.
- `api/migrations/versions/` ends at `0007_finish_float_check`.

**Dashboard** (specs 010, 017)

- `admin/src/combos/fields.tsx` (`ConditionsFields`) and `ComboFields.tsx`: each item's float range and seeds on the add and edit pages.
- `admin/src/combos/batch.ts`: batch-wide glove and knife conditions, per-row overrides (`RowText.glove`, `RowText.knife`), `resolved()` and `checkBatch()` building the request. `admin/src/pages/BatchPage.tsx` renders it. Unsaved values live in the in-memory drafts store.
- `admin/src/combos/problems.ts` and `messages.ts`: 422 `loc` and `type` mapped to fields and fixed messages.

**Website** (specs 011, 013)

- `website/src/components/comboText.ts`: `patternSeeds()` gives "2, 179", "Any" or "None"; `website/src/pages/Combos.tsx` shows Glove Pattern and Knife Pattern rows on every card.

**What the owner wants** (2026-11-16)

- One example seed per item is enough. The owner's description says, for example, that the screenshot shows Karambit 619, a Blue Gem, and that visitors can explore Blue Gem guides for more. Descriptions have no links.
- "Add special pattern" lists what exists for the finish; one click picks it.
- The 13 groups in Design, The groups. No tiers.

There is no pattern group table, file, route or screen today.

## Requirements

**Groups**

- R1. A group has a slug, a name, a kind (knife or glove), one finish slug, one example seed for each item type it exists on, and a list of sources, each with a title, an author, a link and the date it was checked. A group with no sources is the owner's own pick.
- R2. The groups live in a committed data file, `api/src/combo_api/patterns/groups.json`, in the order the dashboard lists them. An import command loads it into the database. It inserts new groups, adds seeds for item types a group did not cover yet, and updates sources. It never deletes anything, and it is safe to run again.
- R3. The import refuses a file with an unknown kind, a duplicate slug, a finish slug no active item type of that kind has, an item type without that finish, a seed outside 0 to 1000, a group without seeds, or a source without an `https` link. Groups are frozen once imported (owner's rule): it also refuses a file that changes the slug, name, kind, finish or any example seed of a group already in the database, or leaves such a group out. It writes nothing when refused.
- R4. The Compose stack runs the import after the catalog import, as the catalog is loaded today.

**Combos**

- R5. Each item of a combo has an optional pattern group, next to its seeds. Setting one needs at least one seed, a group of the item's kind and finish, and a seed in the group for the item's type.
- R6. The seeds stay the combo's own. A group gives its example seed when picked, and the owner can change the seeds afterwards without losing the group. Example seeds never change once imported (R3), so a combo's seed, its screenshot and its group stay in step.
- R7. Create, update and batch create accept the pattern group per item. Batch update items are unchanged.

**API**

- R8. An admin route lists the groups with their seeds per item type and their sources.
- R9. Admin and public combo items return the item's group as `{slug, name}`, or null. Public responses carry no seeds list of a group and no sources.

**Dashboard**

- R10. On the add and edit pages, an item whose finish and type have groups shows "Add special pattern". It lists each group's name with that type's example seed ("Blue Gem · 387"). Picking one sets the item's seeds to that seed and its group to that group. The group then shows by its name with Remove, which clears the group and keeps the seeds.
- R11. In a batch, the batch-wide knife values show "Add special pattern" with the groups of the batch's knife finish. Picking one gives every new row whose knife type the group covers that group and its own example seed, shown on the row ("Blue Gem · 601"). A new row the group does not cover says "No Blue Gem for this knife" and takes any pattern. A row's own knife values can override the seeds and the group, and clearing the override returns the row to the batch-wide choice.
- R12. Clearing every seed of an item that has a group blocks saving, with the message "A special pattern needs a seed."
- R13. The combo list's conditions summary names the group: `Knife Blue Gem · 387`.
- R14. The picked groups are kept with the form's other unsaved values, as spec 010 keeps them.

**Website**

- R15. A combo card's pattern row shows the group's name before the seeds: "Knife Pattern: Blue Gem · 387". Without a group it is unchanged ("2, 179", "Any", "None").

**Docs and checks**

- R16. `api/openapi.json`, `admin/src/api/schema.d.ts` and `website/src/api/schema.d.ts` are regenerated. `api/README.md` documents groups, the data file, the import and how to update a group; `admin/README.md` describes "Add special pattern".

**Review**

- R17. Before the implementation is approved, every example (each group with each knife type it covers) has its own picture: that knife type with that seed, drawn in the 3D viewer, saved as `<group>-<knife type>-<seed>.png` to a folder on the owner's desktop. The owner confirms each one or gives another seed, which gets a new picture. The pictures are not committed.

## Design

### The groups

The owner's list, with the finish each belongs to, what the community calls it, and the sources checked on 2026-11-16. Authors are named as the guides show them, for credit. Where no established source exists, the owner picks the example seeds, and the group has no sources (Design, Filling the file).

| Group (slug) | Finish slug | Knife types | Sources | Example seed per knife |
| --- | --- | --- | --- | --- |
| Black Gem (`black-gem`) | `scorched` | 20 | "Master guide to Scorched Knifes (Black Gems)" by CuzImExige ([guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3142649856), Feb 2025); "Stiletto Scorched: Black Gems Patterns" by pliza ([guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3224675389), which credits dEAGLE-CS's research) | The master guide's best black pattern per knife |
| Gold Gem (`gold-gem`) | `case-hardened` | 18 (not Kukri, Shadow Daggers) | "The Complete Gold Gem Patterns Guide" by korenevskiy ([guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3313951742), Jun 2026) | The guide's first seed per knife |
| Blue Gem (`blue-gem`) | `case-hardened` | 20 | "The Complete Blue Gem Guide" by korenevskiy and Krieke 啤酒哥 ([index](https://steamcommunity.com/sharedfiles/filedetails/?id=3090086681), Aug 2026), one guide per knife | Each knife's "#1" seed (Karambit 387) |
| Full Mesh (`full-mesh`) | `safari-mesh` | 20 | "Top 3 Patterns for Every Knife in CS2" by clu0od ([guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3538425089), Aug 2025), three Safari Mesh picks per knife | The guide's first pick per knife (M9 Bayonet 199) |
| Full Fade (`full-fade`) | `fade` | 20 | "csgo-fade-percentage-calculator" by chescos ([repository](https://github.com/chescos/csgo-fade-percentage-calculator), MIT); korenevskiy's Fade guides | The calculator's top-ranked seed per knife |
| Mango Fade (`mango-fade`) | `fade` | 1 (Butterfly) | "Butterfly Knife Fade" by korenevskiy ([guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3217528899), Mar 2026), which calls it Full Yellow Fade | The guide's example, 541 |
| Cyanbit (`cyanbit`) | `gamma-doppler-phase-3` | 1 (Karambit) | clu0od's guide above, which calls Cyanbits specific to the Karambit | The guide's first |
| Full Cyan (`full-cyan`) | `gamma-doppler-phase-4` | 4 (Karambit, Bayonet, Flip, Gut) | korenevskiy's Gamma Doppler Phase 4 guides, "Max Cyan" (for example [Karambit](https://steamcommunity.com/sharedfiles/filedetails/?id=3237679658)) | Each guide's first Max Cyan seed |
| Full Lime (`full-lime`) | `gamma-doppler-phase-4` | 4 (Karambit, Bayonet, Flip, Gut) | The same guides, "Max Lime" | Each guide's first Max Lime seed |
| Fire & Ice (`fire-and-ice`) | `marble-fade` | 4 (Bayonet, Flip, Gut, Karambit) | "The Complete Fire & Ice Guide" by Pixel ([guide](https://steamcommunity.com/sharedfiles/filedetails/?id=675516392), Apr 2025); korenevskiy's ([guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3137170442), Mar 2026) | Each knife's 1st Max (Karambit 412) |
| Piss & Ice (`piss-and-ice`) | `marble-fade` | 4 (Karambit, Bayonet, Flip, Gut, as Fire & Ice) | Described by guides (yellow and blue, little red); no seed list found, so no sources | The owner's |
| Diamond Gem (`diamond-gem`) | `gamma-doppler-phase-1` | 4 (Karambit, Bayonet, Flip, Gut) | Karambit guide by MVPHAS and korenevskiy ([guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3257082211)); Flip guide by Glorp ([guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3215994745), from Slaid's video) | Each guide's first tier 1 seed |
| White Gem (`white-gem`) | `urban-masked` | 6 (Classic, Flip, Karambit, M9 Bayonet, Skeleton, Stiletto) | "Ultimate CS2 guide to Urban Masked (White Gems)" by hanma prime ([guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3441697188), Oct 2026) | The guide's seed per knife (Stiletto 402) |

The marketplace blogs found during the research mostly repeat these guides' lists. They are not used as sources.

### Decisions

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| What a group holds (owner's choice) | One example seed per item type, the group's name and its credits | Full seed lists per group: the owner needs one example, and republishing a person's compiled list would need the author's permission. Tiers (one group per tier): with one example per knife, "Blue Gem" says it |
| Linked or copied seeds (owner's choice) | The seed is copied into the combo when picked; the group is linked by id, so the card shows the group's current name. Changing a group's example seed changes no saved combo | Linked seeds (the combo follows the group): a screenshot already taken shows the old seed, so the card would disagree with its picture. Copying the name too: a renamed group would show two names on the site |
| Where group data lives (owner's choice) | A committed JSON file, reviewed in pull requests, imported into tables by `python -m combo_api.patterns import`, like the catalog | Groups entered in the dashboard: no review, no history, and the data would exist only in one database until spec 021 copies it. Both: two places to change one group |
| Frozen groups (owner's rule) | Once a group is in the database, its slug, name, kind, finish and example seeds never change and it is never removed; the import refuses a file that would. New groups, seeds for knife types a group did not cover yet, and source details (title, author, link, date checked) can be added in a pull request. Until this branch is merged, the file may still change, since the owner's database first imports it after the merge. Changing a frozen value would need its own spec that also retakes the screenshot of every combo using it | Editable groups with retirement: a changed example would no longer match the screenshots already taken |
| Tables | `pattern_groups` and `pattern_group_seeds`, created by migration `0008`. Finish and item types by slug, not foreign keys, as `knife_order` does, because the migration runs before the catalog import; the import checks them against the catalog | A foreign key to one finish: a group spans every knife type of a finish |
| Combo columns | `glove_pattern_group_id` and `knife_pattern_group_id`, nullable, foreign keys to `pattern_groups.id`, `ON DELETE RESTRICT` | A text slug: no integrity check |
| Rules on write | A group needs at least one seed on the item, the item's kind and finish slug, and a seed in the group for the item's type. The combo's seeds need not include the example, so the owner can screenshot another seed of the group. New 422 `type` codes: `pattern_group_not_found`, `pattern_group_not_for_item`, `pattern_group_needs_seed` | Requiring the example seed: the owner's own example (Karambit 619, a Blue Gem) would be refused |
| Fades | Full Fade's example per knife is the calculator's top-ranked seed, read once when filling the file. Mango Fade's is the guide's example, 541 (owner's choice; the calculator's lowest seed, 412, rejected). Nothing is computed at run time, and no code or table of the calculator is copied | Computing groups from the seed: needs only one example per knife, so a run-time calculator would be a dependency for 20 numbers |
| Filling the file (owner's choice) | During implementation, from the sources in The groups, reading public guide pages one at a time. The owner gives the seeds for the groups marked "the owner's" | Automated collection from viewer or marketplace sites: against the project's research rules |
| Review pictures (owner's choice) | One picture per example (R17), about 150 in all, named `<group>-<knife type>-<seed>.png` so they sort by group, in a folder on the owner's desktop, outside the repository. Each shows only that knife with that seed, at a low float, so the pattern is what differs. Drawn by running the 3D viewer locally, unchanged, and capturing each knife alone in a browser, one at a time | Reviewing seeds as numbers: the owner wants to see each one. Pictures of whole combos: the gloves would distract from the pattern. Throwaway draft combos for the screenshot worker: test combos in the owner's data |
| Dashboard, one combo | "Add special pattern" beside the item's seeds, shown only when groups exist for the item's finish and type; a list of "Name · seed"; the chosen group as a labelled chip with Remove. A native button and list, keyboard operable, as the existing search combobox | Choosing the group in the description: unstructured, the card could not show it |
| Dashboard, batch | One choice in the batch-wide knife values, resolved per row to that knife type's seed. Rows not covered say so and take any pattern. Row overrides (spec 010) carry their own seeds and group | Picking per row only: 18 clicks for one batch |
| Admin route | `GET /admin/pattern-groups`: every group, 13 rows with at most 20 seeds each, in file order. The dashboard filters by kind, finish and type | A route per finish: a request per form for a list this small |
| Public shape | Each combo item gains `pattern_group: {slug, name}` or null | Group sources in every public item: repeated on every card; they belong on the credits page |
| Website text (owner's choice) | "Blue Gem · 387" in the pattern row; the group name first | Name only: the screenshot's seed would be hidden. Seeds then name ("387 · Blue Gem"): the name is what a visitor scans for |
| Credits (owner's choice) | Stored with each group in the file and the database, returned by the admin route. The public credits page is its own spec, done before spec 021 makes the site public, covering these sources with the catalog data, fonts and the other credits in `THIRD_PARTY_NOTICES.md` | Credits on each card: long, and repeated |
| Permission | None asked: the site shows one example seed per knife and a community name, not anyone's list. Every source is credited. The owner may still send the authors the draft message from the research | Asking before any use: the owner's rule is to ask before republishing a full list, which this design does not do |
| Static files (spec 021) | The groups are a repository file; the public combo routes return the name inside each item; nothing is computed per request | A public group route the static build must also call: not needed by any page yet |
| Variations (phase 2) | The group is per item, so variations of one pairing (regular, Blue Gem, Gold Gem) will differ by the knife item's group. Variations drop the pairing's unique constraint and add a label; the group can become the label's default | Storing the group on the combo rather than the item: gloves and knife can each have one |
| Layout | `api/src/combo_api/patterns/` (`groups.json`, `models.py`, `importer.py`, `__main__.py`, `routes.py`); tests in `api/tests/patterns/`. `admin/src/combos/patterns.ts` (resolving a group per row) and a `SpecialPattern` component | Inside `catalog/`: the catalog is game data; groups are the community's names |
| Size (owner's choice) | One spec for API, dashboard and website: each part is small, and they are reviewed together | Two specs (API and data, then dashboard and website): the dashboard part cannot be checked without the API part |

## API / data model

**Data file** `api/src/combo_api/patterns/groups.json`:

```json
{
  "groups": [
    {
      "slug": "blue-gem",
      "name": "Blue Gem",
      "kind": "knife",
      "finish": "case-hardened",
      "seeds": {"karambit": 387, "m9-bayonet": 601},
      "sources": [
        {"title": "The Complete Blue Gem Guide", "author": "korenevskiy, Krieke 啤酒哥",
         "url": "https://steamcommunity.com/sharedfiles/filedetails/?id=3090086681",
         "checked": "2026-11-16"}
      ]
    }
  ]
}
```

Slugs are kebab-case, at most 40 characters, unique. Names are at most 40 characters. `sources` may be empty (the owner's own picks). Each source's `title` and `author` are at most 200 characters, and `checked` is a date.

**Tables** (migration `0008_pattern_groups`):

`pattern_groups`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | integer identity | Primary key, internal |
| `slug` | text | Unique |
| `name` | text | At most 40 characters |
| `kind` | text | `knife` or `glove` |
| `finish_slug` | text | |
| `position` | integer | File order |
| `sources` | jsonb | The file's list |
| `updated_at` | timestamptz | Set when the import adds seeds or changes sources |

`pattern_group_seeds`: `group_id` (foreign key, `ON DELETE CASCADE`), `type_slug` (text), `seed` (integer, 0 to 1000); primary key `(group_id, type_slug)`.

`combos` gains `glove_pattern_group_id` and `knife_pattern_group_id`, nullable, foreign keys to `pattern_groups.id`, `ON DELETE RESTRICT`.

**Shapes:**

```json
// Conditions (create, update, batch create): one new optional field
{"float_from": null, "float_to": null, "seeds": [387], "pattern_group": "blue-gem"}

// Item (admin and public): one new field
{"...": "...", "seeds": [387], "pattern_group": {"slug": "blue-gem", "name": "Blue Gem"}}

// PatternGroup (admin)
{
  "slug": "blue-gem", "name": "Blue Gem", "kind": "knife", "finish_slug": "case-hardened",
  "seeds": {"karambit": 387, "m9-bayonet": 601},
  "sources": [{"title": "...", "author": "...", "url": "https://...", "checked": "2026-11-16"}]
}
```

Omitted `pattern_group` means null.

**Routes:**

| Route | Operation ID | Response |
| --- | --- | --- |
| `GET /admin/pattern-groups` | `list_pattern_groups` | `200 [PatternGroup]`, in file order; tag `admin`, `require_admin`, `Cache-Control: no-store` |

Create, update and batch create change only through `Conditions`; every combo response through `Item`.

**Errors** (422, FastAPI's list, `loc` at the item's `pattern_group` or `seeds`):

| `type` | When |
| --- | --- |
| `pattern_group_not_found` | No group has that slug |
| `pattern_group_not_for_item` | Another kind or finish, or no seed for the item's type |
| `pattern_group_needs_seed` | A group with an empty seed list |

**Command:** `uv run python -m combo_api.patterns import [--check]`. `--check` validates the file against the catalog and writes nothing. Output: counts of inserted, updated and unchanged groups; a refusal names the group and the frozen field.

## Security

- S1. `GET /admin/pattern-groups` requires an authenticated admin through `require_admin`; the existing route guard test covers it.
- S2. Public responses add only the group's slug and name to each item: no sources, no group seed lists, no internal ids.
- S3. The import reads only the committed file and the database; it makes no network request.
- S4. Group names and source fields are rendered as text, never as HTML, in the dashboard and on the website.
- S5. Every input is bounded: slug and name lengths, seed range, source field lengths, `https` links only.
- S6. No new setting, secret, dependency or CORS change.

## Acceptance criteria

Commands run in `api/`, `admin/` or `website/` as stated.

**Data and import**

1. `uv run alembic upgrade head`, `downgrade base` and `upgrade head` succeed; `uv run alembic check` reports no new operations; the migration tests expect revision `0008` and the tables `pattern_groups` and `pattern_group_seeds`.
2. `groups.json` holds the 13 groups of Design, The groups, all of kind `knife`, with those slugs, names and finish slugs, in that order. `uv run python -m combo_api.patterns import --check` exits 0 against the committed catalog.
3. Every group with sources lists, for each, a title, an author, an `https` link and the date checked; the groups marked "the owner's" in Design have the owner's seeds.
4. Manual: the folder of R17 holds one picture for every seed in `groups.json`, each named after its group, knife type and seed and showing that knife; the owner has confirmed every one, recorded in Implementation notes with the date.
5. Tests: the import inserts the groups and their seeds; running it again changes nothing; a new group, a seed for a knife type a group did not cover, and a changed source are imported, and `updated_at` changes.
6. Tests: the import refuses, writing nothing, a file with an unknown kind, a duplicate slug, a finish slug no active type of that kind has, a type without that finish, a seed of 1001, a group without seeds, and an `http` source link; and, after a first import, a file that changes a group's name, finish or one example seed, or leaves a group out, each refused with the group named.
7. The Compose `patterns` step runs after `catalog` and exits 0; the stack's `GET /admin/pattern-groups` with an admin session returns every group of the file.

**Combos**

8. Tests: creating a combo with a Karambit Case Hardened knife, seeds `[387]` and `pattern_group` `blue-gem` returns the item with `pattern_group` `{"slug": "blue-gem", "name": "Blue Gem"}`; seeds `[619]` with the same group is accepted too.
9. Tests: create returns 422 with the codes of API / data model, and stores nothing, for: an unknown group; a knife group on the gloves; Blue Gem on a Fade knife; Gold Gem on a Kukri; a group with empty seeds.
10. Tests: updating a combo's seeds keeps its group; updating it with `pattern_group` null clears the group and keeps the seeds.
11. Tests: a batch creating Case Hardened combos for Karambit and M9 Bayonet with `blue-gem` and each knife's seed saves both with the group; one item with a group not for its knife refuses the batch with that item's index in `loc`.
12. Tests: `GET /admin/pattern-groups` returns every group in file order, with seeds and sources; without a session it returns 401.
13. Tests: the public combo routes return `pattern_group` on each item and no `sources` key anywhere in the raw body.

**Dashboard**

14. Tests: on the add page with a Karambit Case Hardened knife, "Add special pattern" lists Blue Gem · 387 and Gold Gem with Karambit's seed; with a Karambit Vanilla it is not shown. Picking Blue Gem sets the seeds to 387 and shows the Blue Gem chip; Save sends `pattern_group: "blue-gem"` and `seeds: [387]`. Remove keeps 387 and sends no group.
15. Tests: editing the seeds after picking keeps the group; clearing all seeds shows "A special pattern needs a seed." and Save sends nothing.
16. Tests: a batch on Specialist Gloves Crimson Kimono with `case-hardened`, Blue Gem picked batch-wide: each new row shows its own seed ("Blue Gem · 601" on M9 Bayonet), and Save sends each row's own seed and the group. With Gold Gem, the Kukri row says "No Gold Gem for this knife" and is sent with no seeds and no group. A row's own knife override with seeds `[1]` and no group is sent as such; clearing it returns the row to Gold Gem.
17. Tests: the edit page shows a combo's stored group and keeps it on Save.
18. Tests: the combo list summary shows `Knife Blue Gem · 387`.
19. Tests: a session end with a picked group in an add form and in a batch restores the pick after logging in again.
20. Tests: a 422 with each new `type` code maps to the item's field with a fixed message; a group name `<img src=x>` renders as text.

**Website**

21. Tests: a card whose knife has Blue Gem and seeds `[387]` shows "Knife Pattern: Blue Gem · 387"; one without a group still shows "2, 179", "Any" or "None" as in spec 013.

**Docs and checks**

22. `api/openapi.json` contains `list_pattern_groups` and the new fields; `uv run python -m combo_api.openapi --check`, `npm run api:types:check` in `admin/` and in `website/` exit 0.
23. `api/README.md` documents groups, `groups.json`, the import, `--check` and how to update a group; `admin/README.md` describes "Add special pattern".
24. In `api/`: format check, lint, mypy, pytest (no skipped tests), the OpenAPI and export checks exit 0; `docker build` exits 0. In `admin/` and `website/`: `npm ci`, lint, typecheck, tests and build exit 0, plus `npm run check:bundle` in `admin/`.
25. After the branch is pushed, the `api`, `admin` and `website` workflow runs for its latest commit succeed.
26. `gitleaks dir . --no-banner --redact` and `gitleaks git --log-opts="main..020-pattern-groups" --no-banner --redact` report no findings; the only new URLs are the sources of Design, The groups, public documentation and the repository's own.

## Test plan

| Criterion | How it is checked |
| --- | --- |
| 1 | pytest: migration tests; `uv run alembic check` |
| 2, 3 | pytest: a data file test; the `--check` command |
| 4 | Manual: list the folder against `groups.json`; the owner's confirmation |
| 5, 6 | pytest: `tests/patterns/` import tests through `db_session` |
| 7 | A separate Compose project from `api/.env.example`, as spec 009 criterion 34; read `compose.services.yaml` |
| 8 to 13 | pytest: `tests/patterns/` and `tests/combos/` route tests |
| 14 to 20 | Vitest with the fake API, which gains the groups route and the new fields |
| 21 | Vitest: `website/src/pages/Combos.test.tsx` |
| 22 to 24 | The commands below |
| 25 | The workflow run pages (after the owner pushes) |
| 26 | The gitleaks commands; `git diff main...020-pattern-groups \| grep -oE 'https?://[^ )>"]+' \| sort -u` |

In `api/`, with the Compose database up:

```bash
uv sync --locked
uv run ruff format --check .
uv run ruff check .
uv run mypy
uv run pytest
uv run python -m combo_api.openapi --check
uv run python -m combo_api.catalog export-website --check
uv run python -m combo_api.patterns import --check
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
npm run lint
npm run api:types:check
npm test
npm run build
```

## Open questions

None. Answered by the owner on 2026-11-16, and recorded in Design as the owner's choice: the seed is copied into the combo and the group's name is linked; groups are frozen once imported, and changing one later would be its own spec that retakes the affected screenshots; a picture of every example for review, drawn by running the 3D viewer locally, unchanged, and capturing each knife alone in a browser, one at a time (rejected: throwaway draft combos for the screenshot worker, which would mix test combos into the owner's data); the committed `groups.json`, edited in pull requests and imported; "Blue Gem · 387" on the website; the credits page as its own spec before spec 021 makes the site public; one review; the owner gives the example seeds where no guide covers a knife; Mango Fade's example is 541; and no glove groups. On 2026-11-21, during implementation, the owner removed Centered Web (Implementation notes).

## Implementation notes

### Owner's changes

- **2026-11-21: Centered Web removed.** Only four knives have a Crimson Web guide (Karambit and M9 Bayonet by RemIx and korenevskiy, Flip by Hermano, Shadow Daggers by Giuseppe; the spec's table named RemIx for all four), and their tier 1 lists are not ranked. The owner chose to leave the group out. Goals, What the owner wants, The groups, the Admin route row and criterion 2 were updated to match.
- **2026-11-21: Full Mesh from clu0od's guide.** The owner read clu0od's Safari Mesh picks and chose them for the group, so its seeds are the guide's first pick for each of the 20 knives instead of the owner's own.
- **2026-11-21: Piss & Ice on four knives.** Like Fire & Ice, the pattern exists only on the Karambit, Bayonet, Flip and Gut. The owner picked the seeds (Karambit 769, Bayonet 609, Flip 92, Gut 722); the group has no sources.
- **2026-11-21: Gamma Doppler gems on four knives.** The owner limited Diamond Gem, Full Cyan and Full Lime to the Karambit, Bayonet, Flip and Gut, the knives with small blades, as with Fire & Ice and Piss & Ice (Cyanbit is the Karambit's alone). Each keeps the guide seed for those knives and credits only their guides: korenevskiy's Bayonet, Flip, Gut and Karambit guides for Phase 4, and for Diamond Gem the Karambit guide, Glorp's Flip guide and korenevskiy's Bayonet and Gut Phase 1 guides.

## Audit

Filled in by the audit: one line per acceptance criterion (pass or fail, with evidence), the results of lint, tests, build and the secret scan, and a verdict of Pass, Pass with follow-ups, or Fail.
