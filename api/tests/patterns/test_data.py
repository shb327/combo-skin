"""The committed groups file: the owner's 13 groups, valid against the committed catalog."""

import json
from typing import Any

import pytest
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.patterns.data import (
    GROUPS,
    PatternError,
    catalog_from_snapshot,
    load_groups,
    validate,
)
from combo_api.patterns.importer import import_groups
from tests.patterns.conftest import SNAPSHOT
from tests.patterns.support import SOURCE, group, groups_file

# Design, The groups: slug, name and finish, in the file's order.
EXPECTED = [
    ("black-gem", "Black Gem", "scorched"),
    ("gold-gem", "Gold Gem", "case-hardened"),
    ("blue-gem", "Blue Gem", "case-hardened"),
    ("full-mesh", "Full Mesh", "safari-mesh"),
    ("full-fade", "Full Fade", "fade"),
    ("mango-fade", "Mango Fade", "fade"),
    ("cyanbit", "Cyanbit", "gamma-doppler-phase-3"),
    ("full-cyan", "Full Cyan", "gamma-doppler-phase-4"),
    ("full-lime", "Full Lime", "gamma-doppler-phase-4"),
    ("fire-and-ice", "Fire & Ice", "marble-fade"),
    ("piss-and-ice", "Piss & Ice", "marble-fade"),
    ("diamond-gem", "Diamond Gem", "gamma-doppler-phase-1"),
    ("white-gem", "White Gem", "urban-masked"),
]
CATALOG = catalog_from_snapshot(SNAPSHOT)


def test_the_file_holds_the_owners_groups() -> None:
    groups = load_groups().groups
    assert [(g.slug, g.name, g.finish) for g in groups] == EXPECTED
    assert {g.kind for g in groups} == {"knife"}


def test_the_file_is_valid_against_the_catalog() -> None:
    validate(load_groups(), CATALOG)


def test_every_source_is_complete() -> None:
    for g in load_groups().groups:
        for source in g.sources:
            assert source.title and source.author, g.slug
            assert source.url.startswith("https://"), g.slug


def test_the_file_is_formatted() -> None:
    """Two-space JSON with a final newline, so pull requests show only real changes."""
    text = GROUPS.read_text()
    assert text == json.dumps(json.loads(text), indent=2, ensure_ascii=False) + "\n"


def test_a_valid_file_passes() -> None:
    validate(groups_file(), CATALOG)


@pytest.mark.parametrize(
    ("fields", "message"),
    [
        ({"finish": "no-such-finish"}, "no active knife type has the finish no-such-finish"),
        ({"seeds": {"karambit": 387, "no-such-knife": 1}}, "no-such-knife"),
        ({"finish": "marble-fade", "seeds": {"kukri": 1}}, "kukri has no marble-fade"),
        ({"kind": "glove", "finish": "doppler-ruby"}, "no active glove type"),
    ],
)
def test_the_catalog_check_refuses(fields: dict[str, Any], message: str) -> None:
    with pytest.raises(PatternError) as refused:
        validate(groups_file(group(**fields)), CATALOG)
    assert message in str(refused.value)


def test_a_duplicate_slug_is_refused() -> None:
    with pytest.raises(PatternError, match="blue-gem appears twice"):
        validate(groups_file(group(), group(name="Other")), CATALOG)


@pytest.mark.parametrize(
    "fields",
    [
        {"kind": "sticker"},
        {"seeds": {"karambit": 1001}},
        {"seeds": {"karambit": -1}},
        {"seeds": {}},
        {"sources": [{**SOURCE, "url": "http://example.com/guide"}]},
        {"sources": [{**SOURCE, "title": ""}]},
        {"slug": "Blue Gem"},
        {"name": "x" * 41},
        {"extra": 1},
    ],
)
def test_the_file_format_refuses(fields: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        groups_file(group(**fields))


def test_a_group_without_sources_is_the_owners_pick() -> None:
    validate(groups_file(group(sources=[])), CATALOG)


def test_the_owners_own_picks() -> None:
    """Piss & Ice is the owner's: their seeds, and no sources. Gold Gem's Shadow Daggers seed
    is the owner's too, added after import; the group still has no Kukri."""
    groups = {g.slug: g for g in load_groups().groups}
    piss_and_ice = groups["piss-and-ice"]
    assert piss_and_ice.seeds == {"karambit": 769, "bayonet": 609, "flip": 92, "gut": 722}
    assert piss_and_ice.sources == []
    gold_gem = groups["gold-gem"]
    assert gold_gem.seeds["shadow-daggers"] == 511
    assert "kukri" not in gold_gem.seeds
    assert len(gold_gem.seeds) == 19


@pytest.mark.anyio
async def test_the_committed_file_imports(catalog: AsyncSession) -> None:
    counts = await import_groups(catalog, load_groups())
    assert counts.inserted == len(load_groups().groups)
    again = await import_groups(catalog, load_groups())
    assert (again.inserted, again.updated) == (0, 0)
