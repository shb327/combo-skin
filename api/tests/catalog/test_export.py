import gzip
import json
from pathlib import Path

import pytest

from combo_api.catalog import export
from combo_api.catalog.__main__ import main
from combo_api.catalog.snapshot import SNAPSHOT as SNAPSHOT_PATH
from combo_api.catalog.snapshot import load_display_order, load_snapshot
from tests.catalog.support import website_slugs

SNAPSHOT = load_snapshot()
ORDER = load_display_order()


def test_export_is_up_to_date() -> None:
    assert main(["export-website", "--check"]) == 0


def test_check_fails_on_stale_export(tmp_path: Path) -> None:
    stale = tmp_path / "catalog.json"
    stale.write_text("{}\n")
    assert main(["export-website", "--check", "--output", str(stale)]) == 1
    assert main(["export-website", "--output", str(stale)]) == 0
    assert main(["export-website", "--check", "--output", str(stale)]) == 0
    assert stale.read_text() == export.WEBSITE_EXPORT.read_text()


def test_export_keeps_website_slugs_and_order() -> None:
    data = json.loads(export.render(SNAPSHOT, ORDER))
    assert data["source"] == {"commit": SNAPSHOT.source.commit}
    for group, kind in export.GROUPS.items():
        expected = [w for w in website_slugs() if w["kind"] == kind]
        assert [t["id"] for t in data[group]] == [w["slug"] for w in expected]
        for item_type, website_type in zip(data[group], expected, strict=True):
            slugs = [f["id"] for f in item_type["finishes"]]
            assert slugs[: len(website_type["finishes"])] == website_type["finishes"]
    karambit = next(t for t in data["knives"] if t["id"] == "karambit")
    assert karambit["name"] == "Karambit"
    phase_2 = next(f for f in karambit["finishes"] if f["id"] == "doppler-phase-2")
    assert phase_2["name"] == "Doppler (Phase 2)"
    assert phase_2["image"].startswith("https://")


def test_export_lists_unplaced_finishes(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["export-website", "--check"]) == 0
    err = capsys.readouterr().err
    assert "Driver Gloves | Wave Chaser" in err
    assert "Sport Gloves | Occult" in err


def test_export_is_small() -> None:
    assert len(gzip.compress(export.WEBSITE_EXPORT.read_bytes())) < 65536


def test_check_fails_when_the_snapshot_changes(tmp_path: Path) -> None:
    data = json.loads(SNAPSHOT_PATH.read_text())
    mogul = next(
        f
        for t in data["item_types"]
        if t["slug"] == "specialist"
        for f in t["finishes"]
        if f["slug"] == "mogul"
    )
    mogul["name"] = "Mogul Renamed"
    changed = tmp_path / "snapshot.json"
    changed.write_text(json.dumps(data))
    assert main(["export-website", "--check", "--snapshot", str(changed)]) == 1
    assert main(["export-website", "--check", "--snapshot", str(SNAPSHOT_PATH)]) == 0


def test_export_places_new_finishes_last() -> None:
    data = json.loads(export.render(SNAPSHOT, ORDER))
    unplaced = {"driver": 8, "specialist": 7, "sport": 7}
    for group, kind in export.GROUPS.items():
        expected = [w for w in website_slugs() if w["kind"] == kind]
        for item_type, website_type in zip(data[group], expected, strict=True):
            rest = [f["id"] for f in item_type["finishes"]][len(website_type["finishes"]) :]
            assert len(rest) == unplaced.get(item_type["id"], 0), item_type["id"]
            assert not set(rest) & set(website_type["finishes"])


def test_agents_export() -> None:
    data = json.loads(export.render_agents(SNAPSHOT))
    assert data["source"] == {"commit": SNAPSHOT.source.commit}
    agents = data["agents"]
    assert len(agents) == 63
    assert [a["team"] for a in agents] == ["ct"] * 29 + ["t"] * 34
    for team in ("ct", "t"):
        names = [a["name"] for a in agents if a["team"] == team]
        assert names == sorted(names, key=str.casefold)
    assert all(set(a) == {"def_index", "name", "team", "image"} for a in agents)
    ricksaw = next(a for a in agents if a["def_index"] == 5404)
    assert ricksaw["name"] == "Lt. Commander Ricksaw | NSWC SEAL"
    assert ricksaw["team"] == "ct"
    assert ricksaw["image"].startswith("https://")


def test_agents_export_leaves_out_retired_agents() -> None:
    first = SNAPSHOT.agents[0]
    retired = SNAPSHOT.model_copy(
        update={"agents": (first.model_copy(update={"retired": True}), *SNAPSHOT.agents[1:])}
    )
    data = json.loads(export.render_agents(retired))
    assert first.def_index not in [a["def_index"] for a in data["agents"]]
    assert len(data["agents"]) == 62


def test_agents_export_is_up_to_date_and_checked(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert export.AGENTS_EXPORT.read_text() == export.render_agents(SNAPSHOT)
    stale = tmp_path / "agents.json"
    stale.write_text(export.AGENTS_EXPORT.read_text().replace("Ricksaw", "Rick"))
    assert main(["export-website", "--check", "--agents-output", str(stale)]) == 1
    assert "agents.json is out of date" in capsys.readouterr().err
    assert main(["export-website", "--agents-output", str(stale)]) == 0
    assert main(["export-website", "--check", "--agents-output", str(stale)]) == 0
    assert stale.read_text() == export.AGENTS_EXPORT.read_text()


def test_agents_export_is_missing(tmp_path: Path) -> None:
    missing = tmp_path / "agents.json"
    assert main(["export-website", "--check", "--agents-output", str(missing)]) == 1
