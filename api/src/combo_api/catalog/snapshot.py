"""The committed catalog snapshot, its display order, and how both are read and written."""

import json
from collections.abc import Callable, Iterable
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict

PACKAGE_DIR = Path(__file__).resolve().parent
SNAPSHOT = PACKAGE_DIR / "snapshot.json"
DISPLAY_ORDER = PACKAGE_DIR / "display_order.json"
SLUG_OVERRIDES = PACKAGE_DIR / "slug_overrides.json"

type Kind = Literal["knife", "glove"]
KINDS: tuple[Kind, ...] = ("knife", "glove")


class CatalogError(Exception):
    """The snapshot, its display order or the database cannot be reconciled."""


class Model(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class Rarity(Model):
    code: str
    name: str
    color: str


class Finish(Model):
    paint_index: int
    paint_codename: str | None
    name: str
    phase: str | None
    slug: str
    rarity: Rarity
    float_min: float | None
    float_max: float | None
    image_url: str
    retired: bool

    @property
    def display_name(self) -> str:
        return f"{self.name} ({self.phase})" if self.phase else self.name


class ItemType(Model):
    kind: Kind
    def_index: int
    codename: str
    name: str
    slug: str
    finishes: tuple[Finish, ...]
    retired: bool


class Source(Model):
    repository: str
    commit: str
    file: str
    license: str


class Snapshot(Model):
    source: Source
    item_types: tuple[ItemType, ...]


class DisplayOrder(Model):
    """Hand-kept order: type slugs per kind, and finish slugs per `<kind>/<type slug>`."""

    types: dict[Kind, tuple[str, ...]]
    finishes: dict[str, tuple[str, ...]]


def load_snapshot(path: Path = SNAPSHOT) -> Snapshot:
    return Snapshot.model_validate_json(path.read_text())


def dump_snapshot(snapshot: Snapshot) -> str:
    data = snapshot.model_dump(mode="json")
    return json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def load_display_order(path: Path = DISPLAY_ORDER) -> DisplayOrder:
    return DisplayOrder.model_validate_json(path.read_text())


def load_slug_overrides(path: Path = SLUG_OVERRIDES) -> dict[str, str]:
    overrides: dict[str, str] = json.loads(path.read_text())
    return overrides


def finish_key(item_type: ItemType) -> str:
    return f"{item_type.kind}/{item_type.slug}"


def _in_order[T](
    items: Iterable[T], listed: Iterable[str], slug: Callable[[T], str], game_id: Callable[[T], int]
) -> list[T]:
    """Listed items first, as listed; the rest after, by game id."""
    rank = {value: index for index, value in enumerate(listed)}
    return sorted(items, key=lambda item: (rank.get(slug(item), len(rank)), game_id(item)))


def ordered_types(snapshot: Snapshot, order: DisplayOrder, kind: Kind) -> list[ItemType]:
    """Types still in the game, in display order. Retired types are left out."""
    return _in_order(
        (t for t in snapshot.item_types if t.kind == kind and not t.retired),
        order.types.get(kind, ()),
        lambda t: t.slug,
        lambda t: t.def_index,
    )


def ordered_finishes(item_type: ItemType, order: DisplayOrder) -> list[Finish]:
    """Finishes still in the game, in display order. Retired finishes are left out."""
    return _in_order(
        (f for f in item_type.finishes if not f.retired),
        order.finishes.get(finish_key(item_type), ()),
        lambda f: f.slug,
        lambda f: f.paint_index,
    )


def unlisted(snapshot: Snapshot, order: DisplayOrder) -> list[str]:
    """Types and finishes the display order does not place yet."""
    names = []
    for kind in KINDS:
        listed_types = set(order.types.get(kind, ()))
        for item_type in ordered_types(snapshot, order, kind):
            if item_type.slug not in listed_types:
                names.append(item_type.name)
            listed = set(order.finishes.get(finish_key(item_type), ()))
            names.extend(
                f"{item_type.name} | {finish.display_name}"
                for finish in ordered_finishes(item_type, order)
                if finish.slug not in listed
            )
    return names
