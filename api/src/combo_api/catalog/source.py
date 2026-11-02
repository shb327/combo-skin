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
    `overrides` (keyed `<def_index>:<paint_index>`) if listed, otherwise from its name.
    """
    entries = RAW_ENTRIES.validate_json(raw)
    skins: list[tuple[Kind, RawSkin]] = []
    for entry in entries:
        kind = KIND_BY_CATEGORY.get((entry.get("category") or {}).get("id", ""))
        if kind is not None:
            skins.append((kind, RawSkin.model_validate(entry)))

    old_types = {t.def_index: t.slug for t in previous.item_types} if previous else {}
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
        )

    item_types = []
    for def_index, (kind, codename, name) in sorted(headers.items()):
        by_slug: dict[str, Finish] = {}
        for finish in finishes[def_index].values():
            other = by_slug.setdefault(finish.slug, finish)
            if other is not finish:
                raise CatalogError(
                    f"{name}: {other.display_name} ({other.paint_index}) and "
                    f"{finish.display_name} ({finish.paint_index}) both have slug "
                    f"{finish.slug!r}; add an override to slug_overrides.json"
                )
        item_types.append(
            ItemType(
                kind=kind,
                def_index=def_index,
                codename=codename,
                name=name,
                slug=old_types.get(def_index) or type_slug(name),
                finishes=tuple(sorted(finishes[def_index].values(), key=lambda f: f.paint_index)),
            )
        )
    return Snapshot(
        source=Source(repository=REPOSITORY, commit=commit, file=FILE, license=LICENSE),
        item_types=tuple(item_types),
    )
