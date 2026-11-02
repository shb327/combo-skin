"""Helpers for catalog tests."""

import json
from pathlib import Path
from typing import Any

from combo_api.catalog.snapshot import ItemType, Snapshot

FIXTURES = Path(__file__).resolve().parent / "fixtures"


def website_slugs() -> list[dict[str, Any]]:
    """Every type and its finish slugs, in order, from the website's data files before spec 005."""
    types: list[dict[str, Any]] = json.loads((FIXTURES / "website_slugs.json").read_text())["types"]
    return types


def find(snapshot: Snapshot, kind: str, slug: str) -> ItemType:
    return next(t for t in snapshot.item_types if t.kind == kind and t.slug == slug)
