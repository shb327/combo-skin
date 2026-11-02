"""Download the source dataset at a pinned commit and normalise it into a snapshot."""

import re
import urllib.request
from typing import Any

from pydantic import BaseModel, TypeAdapter

from combo_api.catalog.slugs import finish_slug, type_slug
from combo_api.catalog.snapshot import (
    CatalogError,
    Finish,
    ItemType,
    Kind,
    Rarity,
    Snapshot,
    Source,
)

REPOSITORY = "ByMykel/CSGO-API"
FILE = "public/api/en/skins.json"
LICENSE = "MIT"
COMMIT_PATTERN = re.compile(r"[0-9a-f]{40}")
KIND_BY_CATEGORY: dict[str, Kind] = {
    "sfui_invpanel_filter_melee": "knife",
    "sfui_invpanel_filter_gloves": "glove",
}
VANILLA = "Vanilla"


class RawWeapon(BaseModel):
    id: str
    weapon_id: int
    name: str


class RawPattern(BaseModel):
    id: str
    name: str


class RawRarity(BaseModel):
    id: str
    name: str
    color: str


class RawSkin(BaseModel):
    """One knife or glove entry of the dataset's `skins.json`. Other fields are ignored."""

    name: str
    weapon: RawWeapon
    pattern: RawPattern | None = None
    paint_index: int | None = None
    phase: str | None = None
    min_float: float | None = None
    max_float: float | None = None
    rarity: RawRarity
    image: str


RAW_ENTRIES = TypeAdapter(list[dict[str, Any]])


def download(commit: str) -> bytes:
    """The dataset file at a full commit SHA. The only network access in the catalog."""
    if not COMMIT_PATTERN.fullmatch(commit):
        raise CatalogError(f"--commit must be a full 40-character commit SHA, got {commit!r}")
    url = f"https://raw.githubusercontent.com/{REPOSITORY}/{commit}/{FILE}"
    with urllib.request.urlopen(url, timeout=60) as response:
        data: bytes = response.read()
    return data


def clean(name: str) -> str:
    return name.removeprefix("★").strip()


def normalise(
    raw: bytes, commit: str, previous: Snapshot | None, overrides: dict[str, str]
) -> Snapshot:
    """Knives and gloves from the dataset as a snapshot.

    A type or finish already in `previous` keeps its slug. A new finish takes its slug from
    `overrides` (keyed `<def_index>:<paint_index>`) if listed, otherwise from its name. Types
    and finishes of `previous` missing from the dataset are kept, retired, so their slugs stay
    taken.
    """
    entries = RAW_ENTRIES.validate_json(raw)
    skins: list[tuple[Kind, RawSkin]] = []
    for entry in entries:
        kind = KIND_BY_CATEGORY.get((entry.get("category") or {}).get("id", ""))
        if kind is not None:
            skins.append((kind, RawSkin.model_validate(entry)))

    old_types = {t.def_index: t for t in previous.item_types} if previous else {}
    old_finishes = (
        {(t.def_index, f.paint_index): f.slug for t in previous.item_types for f in t.finishes}
        if previous
        else {}
    )

    # Painted entries carry the item's codename; Vanilla entries only a HUD name.
    headers: dict[int, tuple[Kind, str, str]] = {}
    for kind, skin in skins:
        if skin.paint_index is not None:
            headers[skin.weapon.weapon_id] = (kind, skin.weapon.id, clean(skin.weapon.name))

    finishes: dict[int, dict[int, Finish]] = {}
    for _, skin in skins:
        def_index = skin.weapon.weapon_id
        if def_index not in headers:
            raise CatalogError(f"{clean(skin.name)}: no painted finish names its type")
        paint_index = skin.paint_index or 0
        if paint_index in finishes.get(def_index, {}):
            raise CatalogError(f"{clean(skin.name)}: listed twice ({def_index}:{paint_index})")
        painted = skin.pattern is not None and skin.paint_index is not None
        name = clean(skin.pattern.name) if skin.pattern and painted else VANILLA
        phase = skin.phase if painted else None
        slug = (
            old_finishes.get((def_index, paint_index))
            or overrides.get(f"{def_index}:{paint_index}")
            or finish_slug(name, phase)
        )
        finishes.setdefault(def_index, {})[paint_index] = Finish(
            paint_index=paint_index,
            paint_codename=skin.pattern.id if skin.pattern and painted else None,
            name=name,
            phase=phase,
            slug=slug,
            rarity=Rarity(code=skin.rarity.id, name=skin.rarity.name, color=skin.rarity.color),
            float_min=skin.min_float if painted else None,
            float_max=skin.max_float if painted else None,
            image_url=skin.image,
            retired=False,
        )

    item_types: dict[int, ItemType] = {}
    for def_index, (kind, codename, name) in headers.items():
        old = old_types.get(def_index)
        current = finishes[def_index]
        for finish in old.finishes if old else ():
            if finish.paint_index not in current:
                current[finish.paint_index] = finish.model_copy(update={"retired": True})
        item_types[def_index] = ItemType(
            kind=kind,
            def_index=def_index,
            codename=codename,
            name=name,
            slug=old.slug if old else type_slug(name),
            finishes=tuple(sorted(current.values(), key=lambda f: f.paint_index)),
            retired=False,
        )
    for def_index, old in old_types.items():
        if def_index not in item_types:
            retired = tuple(f.model_copy(update={"retired": True}) for f in old.finishes)
            item_types[def_index] = old.model_copy(update={"retired": True, "finishes": retired})

    for item_type in item_types.values():
        check_finish_slugs(item_type)
    check_type_slugs(list(item_types.values()))
    return Snapshot(
        source=Source(repository=REPOSITORY, commit=commit, file=FILE, license=LICENSE),
        item_types=tuple(item_types[d] for d in sorted(item_types)),
    )


def described(name: str, game_id: int, retired: bool) -> str:
    return f"{name} ({game_id}{', retired' if retired else ''})"


def check_finish_slugs(item_type: ItemType) -> None:
    by_slug: dict[str, Finish] = {}
    for finish in item_type.finishes:
        other = by_slug.setdefault(finish.slug, finish)
        if other is not finish:
            first = described(other.display_name, other.paint_index, other.retired)
            second = described(finish.display_name, finish.paint_index, finish.retired)
            raise CatalogError(
                f"{item_type.name}: {first} and {second} both have slug {finish.slug!r}; "
                "add an override to slug_overrides.json"
            )


def check_type_slugs(item_types: list[ItemType]) -> None:
    by_slug: dict[tuple[Kind, str], ItemType] = {}
    for item_type in item_types:
        other = by_slug.setdefault((item_type.kind, item_type.slug), item_type)
        if other is not item_type:
            first = described(other.name, other.def_index, other.retired)
            second = described(item_type.name, item_type.def_index, item_type.retired)
            raise CatalogError(f"{first} and {second} both have slug {item_type.slug!r}")


def retirement_changes(
    previous: Snapshot | None, snapshot: Snapshot
) -> tuple[list[str], list[str]]:
    """Names of types and finishes retired since `previous`, and of those back in the game."""
    if previous is None:
        return [], []
    before: dict[tuple[int, int | None], bool] = {}
    for item_type in previous.item_types:
        before[(item_type.def_index, None)] = item_type.retired
        for finish in item_type.finishes:
            before[(item_type.def_index, finish.paint_index)] = finish.retired
    retired: list[str] = []
    back: list[str] = []
    for item_type in snapshot.item_types:
        entries: list[tuple[int | None, str, bool]] = [(None, item_type.name, item_type.retired)]
        entries += [
            (f.paint_index, f"{item_type.name} | {f.display_name}", f.retired)
            for f in item_type.finishes
        ]
        for paint_index, name, is_retired in entries:
            was_retired = before.get((item_type.def_index, paint_index))
            if is_retired and was_retired is False:
                retired.append(name)
            elif not is_retired and was_retired is True:
                back.append(name)
    return retired, back
