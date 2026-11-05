"""Checks every snapshot must pass before it is written, imported or exported."""

from collections import Counter
from urllib.parse import urlsplit

from combo_api.catalog.slugs import SLUG_PATTERN
from combo_api.catalog.snapshot import (
    Agent,
    CatalogError,
    DisplayOrder,
    Finish,
    ItemType,
    Snapshot,
    finish_key,
)

KNOWN_PHASES = frozenset(
    {"Phase 1", "Phase 2", "Phase 3", "Phase 4", "Ruby", "Sapphire", "Black Pearl", "Emerald"}
)
PHASED_FINISHES = frozenset({"Doppler", "Gamma Doppler"})
IMAGE_HOST_SUFFIX = ".steamstatic.com"
TEAMS = frozenset({"ct", "t"})


def label(item_type: ItemType, finish: Finish | None = None) -> str:
    if finish is None:
        return f"{item_type.name} ({item_type.def_index})"
    return f"{item_type.name} | {finish.display_name} ({item_type.def_index}:{finish.paint_index})"


def duplicates(values: list[str] | list[int]) -> list[str]:
    return [str(value) for value, count in Counter(values).items() if count > 1]


def image_problem(name: str, image_url: str) -> list[str]:
    url = urlsplit(image_url)
    if url.scheme != "https" or not (url.hostname or "").endswith(IMAGE_HOST_SUFFIX):
        return [f"{name}: image URL is not HTTPS on a {IMAGE_HOST_SUFFIX} host"]
    return []


def agent_problems(agents: tuple[Agent, ...]) -> list[str]:
    found = []
    for field in ("def_index", "codename"):
        values = [getattr(a, field) for a in agents]
        for value in duplicates(values):
            names = " and ".join(a.name for a in agents if str(getattr(a, field)) == value)
            shown = value if field == "def_index" else repr(value)
            what = "definition index" if field == "def_index" else "codename"
            found.append(f"Duplicate agent {what} {shown}: {names}")
    for agent in agents:
        name = f"{agent.name} ({agent.def_index})"
        if agent.team not in TEAMS:
            found.append(f"{name}: team {agent.team!r} is not ct or t")
        found += image_problem(name, agent.image_url)
    return found


def finish_problems(item_type: ItemType, finish: Finish) -> list[str]:
    name = label(item_type, finish)
    problems = []
    if not SLUG_PATTERN.fullmatch(finish.slug):
        problems.append(f"{name}: slug {finish.slug!r} is not kebab-case")
    if finish.paint_index == 0:
        if finish.float_min is not None or finish.float_max is not None:
            problems.append(f"{name}: Vanilla has a float range")
        if finish.paint_codename is not None:
            problems.append(f"{name}: Vanilla has a paint kit codename")
    else:
        if finish.float_min is None or finish.float_max is None:
            problems.append(f"{name}: no float range")
        elif not 0 <= finish.float_min < finish.float_max <= 1:
            problems.append(f"{name}: float range {finish.float_min} to {finish.float_max}")
        if not finish.paint_codename:
            problems.append(f"{name}: no paint kit codename")
    if finish.name in PHASED_FINISHES and finish.phase not in KNOWN_PHASES:
        problems.append(f"{name}: missing or unknown phase {finish.phase!r}")
    problems += image_problem(name, finish.image_url)
    return problems


def order_problems(snapshot: Snapshot, order: DisplayOrder) -> list[str]:
    problems = []
    types = {finish_key(t): t for t in snapshot.item_types}
    for kind, slugs in order.types.items():
        for slug in slugs:
            if f"{kind}/{slug}" not in types:
                problems.append(f"Display order: no {kind} type {slug!r}")
        problems += [
            f"Display order: {kind} type {s!r} listed twice" for s in duplicates(list(slugs))
        ]
    for key, slugs in order.finishes.items():
        item_type = types.get(key)
        if item_type is None:
            problems.append(f"Display order: no type {key!r}")
            continue
        known = {f.slug for f in item_type.finishes}
        problems += [f"Display order: {key} has no finish {s!r}" for s in slugs if s not in known]
        problems += [f"Display order: {key} lists {s!r} twice" for s in duplicates(list(slugs))]
    return problems


def problems(snapshot: Snapshot, order: DisplayOrder) -> list[str]:
    found = []
    types = snapshot.item_types
    for def_index in duplicates([t.def_index for t in types]):
        names = " and ".join(t.name for t in types if str(t.def_index) == def_index)
        found.append(f"Duplicate definition index {def_index}: {names}")
    found += [f"Duplicate type codename {c!r}" for c in duplicates([t.codename for t in types])]
    for kind in {t.kind for t in types}:
        slugs = [t.slug for t in types if t.kind == kind]
        found += [f"Duplicate {kind} type slug {s!r}" for s in duplicates(slugs)]
    for item_type in types:
        if not SLUG_PATTERN.fullmatch(item_type.slug):
            found.append(f"{label(item_type)}: slug {item_type.slug!r} is not kebab-case")
        if not item_type.finishes:
            found.append(f"{label(item_type)}: no finishes")
        if item_type.retired and not all(f.retired for f in item_type.finishes):
            found.append(f"{label(item_type)}: retired type with finishes still in the game")
        finishes = item_type.finishes
        found += [
            f"{label(item_type)}: duplicate paint index {p}"
            for p in duplicates([f.paint_index for f in finishes])
        ]
        found += [
            f"{label(item_type)}: duplicate finish slug {s!r}"
            for s in duplicates([f.slug for f in finishes])
        ]
        for finish in finishes:
            found += finish_problems(item_type, finish)
    return found + agent_problems(snapshot.agents) + order_problems(snapshot, order)


def validate(snapshot: Snapshot, order: DisplayOrder) -> None:
    found = problems(snapshot, order)
    if found:
        raise CatalogError("\n".join(found))
