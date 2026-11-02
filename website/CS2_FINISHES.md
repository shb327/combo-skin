# CS2 Knife Finishes System

This document explains how knife finishes work in Counter-Strike 2 and why different knives have different finish counts.

## Finish Tiers by Knife Release Date

Knives in CS2 were released at different times through various case collections. The longer a knife has been in the game, the more finish options it has.

### Tier 1: Original Knives (35 finishes)
These are the oldest knives that have been in the game since early CS:GO and have appeared in the most case collections:
- Bayonet
- Bowie Knife
- Butterfly Knife
- Falchion Knife
- Flip Knife
- Gut Knife
- Huntsman Knife
- Karambit
- M9 Bayonet
- Shadow Daggers

### Tier 2: Newer Knives (25 finishes)
These knives were added in later operations and cases:
- Navaja Knife
- Nomad Knife
- Paracord Knife
- Skeleton Knife
- Stiletto Knife
- Survival Knife
- Talon Knife
- Ursus Knife

### Tier 3: Newest Knives (13 finishes)
The most recently added knives with the fewest available finishes:
- Classic Knife
- Kukri Knife

## Catalog Totals

The site's catalog (`src/data/catalog.json`) is generated from the game's item data, so these counts follow the game:

- **Gloves**: 8 types, 94 finishes (Driver, Specialist and Sport Gloves 20, 19 and 19; Hand Wraps and Moto Gloves 12 each; Bloodhound, Hydra and Broken Fang Gloves 4 each)
- **Knives**: 20 types, 576 finishes, Vanilla included (10×35 + 8×25 + 2×13)
- **Total**: 670 finishes

## Finish Lists by Tier

### Tier 3: Base Finishes (13)
Available on ALL knives including newest (Kukri, Classic):
1. Vanilla
2. Blue Steel
3. Boreal Forest
4. Case Hardened
5. Crimson Web
6. Fade
7. Forest DDPAT
8. Night Stripe
9. Safari Mesh
10. Scorched
11. Slaughter
12. Stained
13. Urban Masked

### Tier 2: Additional Finishes (+12 = 25 total)
Available on newer knives (Talon, Ursus, Stiletto, etc.) - includes all base finishes plus:
14. Damascus Steel
15. Doppler Black Pearl
16. Doppler Phase 1
17. Doppler Phase 2
18. Doppler Phase 3
19. Doppler Phase 4
20. Doppler Ruby
21. Doppler Sapphire
22. Marble Fade
23. Rust Coat
24. Tiger Tooth
25. Ultraviolet

### Tier 1: Full Finishes (+10 = 35 total)
Available only on original knives (Bayonet, Karambit, M9, etc.) - includes Tier 2 finishes plus:
26. Autotronic
27. Black Laminate
28. Bright Water
29. Freehand
30. Gamma Doppler Emerald
31. Gamma Doppler Phase 1
32. Gamma Doppler Phase 2
33. Gamma Doppler Phase 3
34. Gamma Doppler Phase 4
35. Lore

**Important:** Tier 1 knives use "Night" instead of "Night Stripe"

## Notes

- **Doppler finishes** exist ONLY as phases (Phase 1-4) and gems (Ruby, Sapphire, Black Pearl) - there is no generic "Doppler"
- **Gamma Doppler** exists ONLY as phases (Phase 1-4) and Emerald - there is no generic "Gamma Doppler"
- Gamma Doppler is exclusive to original/Tier 1 knives (released in Gamma Case)
- "Night" vs "Night Stripe" are different finishes - Tier 1 knives have Night, Tier 2/3 have Night Stripe
- Older knives have appeared in more case collections, hence more available finishes

## Sources
- [CS.MONEY Wiki](https://wiki.cs.money/)
- [DMarket CS2 Wiki](https://dmarket.com/cs2-wiki/)
- [CSGOSKINS.GG](https://csgoskins.gg/)
