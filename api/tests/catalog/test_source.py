import json
import urllib.request
from pathlib import Path
from typing import Any

import pytest

from combo_api.catalog import source
from combo_api.catalog.__main__ import main
from combo_api.catalog.snapshot import CatalogError, Snapshot, load_snapshot
from tests.catalog.support import FIXTURES, find

COMMIT = "0123456789abcdef0123456789abcdef01234567"
RAW = (FIXTURES / "raw_skins.json").read_bytes()


def raw_with(paint_index: str, **changes: Any) -> bytes:
    entries = json.loads(RAW)
    for entry in entries:
        if entry["weapon"]["weapon_id"] == 507 and entry.get("paint_index") == paint_index:
            pattern = changes.pop("pattern_name", None)
            if pattern:
                entry["pattern"]["name"] = pattern
            entry.update(changes)
    return json.dumps(entries).encode()


def normalise(
    raw: bytes = RAW, previous: Snapshot | None = None, overrides: dict[str, str] | None = None
) -> Snapshot:
    return source.normalise(raw, COMMIT, previous, overrides or {})


def test_only_knives_and_gloves_are_kept() -> None:
    snapshot = normalise()
    assert sorted(t.slug for t in snapshot.item_types) == ["bloodhound", "karambit", "talon"]
    assert snapshot.source.commit == COMMIT


def test_vanilla_becomes_paint_index_zero_of_its_knife() -> None:
    karambit = find(normalise(), "knife", "karambit")
    vanilla = karambit.finishes[0]
    assert karambit.codename == "weapon_knife_karambit"
    assert (vanilla.paint_index, vanilla.name, vanilla.slug) == (0, "Vanilla", "vanilla")
    assert (vanilla.paint_codename, vanilla.float_min, vanilla.float_max) == (None, None, None)


def test_star_is_stripped_and_phases_are_kept() -> None:
    snapshot = normalise()
    names = [t.name for t in snapshot.item_types] + [
        f.display_name for t in snapshot.item_types for f in t.finishes
    ]
    assert not any("★" in name for name in names)
    assert "Doppler (Phase 2)" in names
    assert find(snapshot, "knife", "talon").finishes[0].slug == "doppler-phase-1"


def test_existing_finish_keeps_its_slug_after_a_rename() -> None:
    previous = normalise()
    renamed = normalise(raw_with("38", pattern_name="Fade Reborn"), previous=previous)
    fade = next(f for f in find(renamed, "knife", "karambit").finishes if f.paint_index == 38)
    assert (fade.name, fade.slug) == ("Fade Reborn", "fade")


def test_override_sets_a_new_finish_slug() -> None:
    snapshot = normalise(overrides={"507:38": "classic-fade"})
    fade = next(f for f in find(snapshot, "knife", "karambit").finishes if f.paint_index == 38)
    assert fade.slug == "classic-fade"


def test_clashing_new_slugs_fail_naming_both() -> None:
    raw = raw_with("38", pattern_name="Doppler", phase="Phase 2")
    with pytest.raises(CatalogError) as error:
        normalise(raw)
    message = str(error.value)
    assert "Doppler (Phase 2) (38)" in message
    assert "Doppler (Phase 2) (419)" in message
    assert "'doppler-phase-2'" in message


def test_refresh_needs_a_full_commit_and_no_network(monkeypatch: pytest.MonkeyPatch) -> None:
    def no_network(*_: object, **__: object) -> None:
        raise AssertionError("refresh used the network")

    monkeypatch.setattr(urllib.request, "urlopen", no_network)
    assert main(["refresh", "--commit", "main"]) == 1
    assert main(["refresh", "--commit", COMMIT[:12]]) == 1


def write_order(path: Path, order: dict[str, Any]) -> Path:
    path.write_text(json.dumps(order))
    return path


def test_refresh_writes_a_valid_snapshot_and_lists_unplaced_finishes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(source, "download", lambda commit: RAW)
    order = write_order(
        tmp_path / "order.json",
        {"types": {"knife": ["karambit"]}, "finishes": {"knife/karambit": ["vanilla", "fade"]}},
    )
    snapshot = tmp_path / "snapshot.json"
    args = [
        "refresh",
        "--commit",
        COMMIT,
        "--snapshot",
        str(snapshot),
        "--display-order",
        str(order),
    ]
    assert main(args) == 0
    assert load_snapshot(snapshot).source.commit == COMMIT
    err = capsys.readouterr().err
    assert "Karambit | Doppler (Phase 2)" in err
    assert "Bloodhound Gloves | Charred" in err
    assert "Karambit | Fade\n" not in err


def test_refresh_writes_nothing_when_validation_fails(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(source, "download", lambda commit: RAW)
    order = write_order(tmp_path / "order.json", {"types": {"knife": ["spoon"]}, "finishes": {}})
    snapshot = tmp_path / "snapshot.json"
    args = [
        "refresh",
        "--commit",
        COMMIT,
        "--snapshot",
        str(snapshot),
        "--display-order",
        str(order),
    ]
    assert main(args) == 1
    assert not snapshot.exists()
