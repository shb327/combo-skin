# 027: Blaze Pattern on Case Hardened

**Status:** Draft
<!-- Lifecycle: Draft → Approved → Implemented → Audited -->

**Section:** api
**Branch:** 027-blaze-pattern

## Summary

Case Hardened knives have two pattern groups today, Gold Gem and Blue Gem (spec 020). This adds a third, Blaze Pattern, with the owner's example seed for each of the 20 knives, so the dashboard's "Add special pattern" offers it and the website shows "Blaze Pattern · 396". Blaze was left out of spec 020's first list; the owner now has a seed for every knife.

## Goals and non-goals

**Goals**

- A new group, Blaze Pattern, on Case Hardened, covering all 20 knife types with the owner's seeds.
- It is listed with the other Case Hardened groups, after Blue Gem.

**Non-goals**

- Any change to an imported group (frozen, spec 020).
- Glove groups, tiers, or more than one seed per knife.
- Sources or a Credits entry: the seeds are the owner's, not from a guide.
- Code changes in the API, dashboard or website: they read any group from the file and the database.

## Context

- `api/src/combo_api/patterns/groups.json`: 13 groups in dashboard order. Case Hardened has `gold-gem` (2nd) and `blue-gem` (3rd), each with 20 knives.
- `api/src/combo_api/patterns/importer.py`: inserts new groups, adds seeds for uncovered types, updates sources and positions (the file's order), and refuses any change to an imported group's slug, name, kind, finish or seeds. A group may be added anywhere in the file (`api/README.md`, Pattern groups).
- `api/tests/patterns/test_data.py`: `EXPECTED` pins every group's slug, name and finish in file order; `test_the_owners_own_picks` pins the owner's seeds.
- `export-website` writes `website/src/data/pattern-guides.json` from the groups' sources; a group without sources adds nothing (spec 023, R10).
- The dashboard (`admin/src/combos/patterns.ts`) offers the groups of the item's finish and type; the website prints the group's name before the seeds (`website/src/components/comboText.ts`).
- Spec 020, Design, The groups, is the list of groups; its Implementation notes record later additions under Owner's changes.

## Requirements

- R1. `groups.json` has a group with slug `blaze-pattern`, name "Blaze Pattern", kind `knife`, finish `case-hardened`, placed right after `blue-gem`, with no sources and these seeds: Bayonet 111, Bowie 396, Butterfly 396, Classic 946, Falchion 800, Flip 9, Gut 734, Huntsman 98, Karambit 822, Kukri 800, M9 Bayonet 354, Navaja 396, Nomad 140, Paracord 946, Shadow Daggers 50, Skeleton 140, Stiletto 643, Survival 946, Talon 559, Ursus 800.
- R2. No other group changes: every slug, name, kind, finish, seed and source stays as it is.
- R3. Importing the file into a database that holds main's 13 groups inserts Blaze Pattern and refuses nothing; running it again changes nothing.
- R4. `pattern-guides.json` is unchanged.
- R5. Spec 020's list of groups and its Owner's changes record the new group.

## Design

| Decision | Chosen | Alternatives rejected, and why |
| --- | --- | --- |
| Name (owner's choice) | "Blaze Pattern", as the owner asked, slug `blaze-pattern`. The name is frozen once imported | "Blaze", like "Blue Gem" without a suffix: not what the owner asked for |
| Place in the file | Right after Blue Gem, so the three Case Hardened groups sit together. The ten groups after it move down one; positions are not frozen, so the import updates them | At the end: the same order in the dashboard, which filters by finish, but the file would split Case Hardened |
| Seeds (owner's choice) | The owner's 20 seeds as given, one per knife. Some repeat across knives (396, 800, 946, 140), as Mango Fade's 412 does | Seeds from a guide: none is used for Blaze |
| Sources | None, like Piss & Ice: the seeds are the owner's, so the Credits page is unchanged | A guide credit: there is no guide behind these seeds |
| Review pictures | None drawn: the owner gave the seeds and asked for the pull request only. The owner checks them in game before the import, as the import freezes them | Viewer pictures as spec 020's R17: the owner did not ask for them this time |
| Where it is recorded | This spec, plus a row in spec 020's The groups and a dated line in its Owner's changes, so spec 020 stays the full list | Only spec 020, as earlier seed additions: a new group is new work, so it gets its own spec |

## API / data model

One new entry in `api/src/combo_api/patterns/groups.json`, after `blue-gem`:

```json
{
  "slug": "blaze-pattern",
  "name": "Blaze Pattern",
  "kind": "knife",
  "finish": "case-hardened",
  "seeds": {"bayonet": 111, "bowie": 396, "...": "20 in all, R1"},
  "sources": []
}
```

No migration, route or schema change. `GET /admin/pattern-groups` returns 14 groups; public combo items show `{"slug": "blaze-pattern", "name": "Blaze Pattern"}`.

## Security

- S1. Data only: no new route, dependency or permission. Public routes keep showing only a group's slug and name.

## Acceptance criteria

1. Test (`test_data.py`): the file's groups, in order, are main's 13 with `blaze-pattern` ("Blaze Pattern", `case-hardened`) directly after `blue-gem`; its seeds equal R1's 20 and its sources are empty.
2. Test: the committed file is valid against the committed catalog, and every other group's seeds and sources equal main's (R2).
3. Test (`test_import.py`): a database with the 13 groups imported first takes the committed file with 1 inserted, 10 updated, 3 unchanged, and a second run inserts and updates nothing.
4. `uv run python -m combo_api.patterns import --check` against a separate local stack that had main's groups imported prints 1 inserted, 10 updated, 3 unchanged, and the import then succeeds.
5. In `api/`: `ruff format --check .`, `ruff check .`, `mypy`, `pytest`, `python -m combo_api.openapi --check`, `python -m combo_api.catalog export-website --check` and `python -m combo_api.patterns export-website --check` exit 0.
6. Spec 020's The groups has a Blaze Pattern row and Owner's changes a 2026-11-27 line naming this spec.

## Test plan

| Criterion | How it is checked |
| --- | --- |
| 1–2 | `api/tests/patterns/test_data.py` |
| 3 | `api/tests/patterns/test_import.py` |
| 4 | Manual, on a separate Compose project: import main's file, then `import --check` and `import` on this branch |
| 5 | The commands below |
| 6 | Reading spec 020 |

Commands, from `api/`, with the Compose `db` and `storage` services running:

```bash
uv run ruff format --check .
uv run ruff check .
uv run mypy
uv run pytest
uv run python -m combo_api.openapi --check
uv run python -m combo_api.catalog export-website --check
uv run python -m combo_api.patterns export-website --check
```

## Open questions

None. The owner gave the name and every seed on 2026-11-27.

## Implementation notes

_Filled in during implementation._

## Audit

_Filled in by the audit._
