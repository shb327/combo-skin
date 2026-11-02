"""Slugs from English names: `Bowie Knife` → `bowie`, `Doppler` + `Phase 2` → `doppler-phase-2`."""

import re

SLUG_PATTERN = re.compile(r"[a-z0-9]+(-[a-z0-9]+)*")


def slugify(text: str) -> str:
    text = text.lower().replace("'", "").replace("\u2019", "")
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def type_slug(name: str) -> str:
    return slugify(re.sub(r" (Knife|Gloves)$", "", name))


def finish_slug(name: str, phase: str | None) -> str:
    return slugify(f"{name} {phase}" if phase else name)
