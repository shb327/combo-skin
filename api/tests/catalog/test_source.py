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
RAW_AGENTS = (FIXTURES / "raw_agents.json").read_bytes()


def files(raw: bytes = RAW, raw_agents: bytes = RAW_AGENTS) -> Any:
    """A stand-in for `source.download`: the skins or the agents file of the fixture."""
    return lambda commit, file=source.FILE: raw_agents if file == source.AGENTS_FILE else raw


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
    return source.normalise(raw, RAW_AGENTS, COMMIT, previous, overrides or {})


def agents_without(def_index: str) -> bytes:
    return json.dumps([a for a in json.loads(RAW_AGENTS) if a["def_index"] != def_index]).encode()


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
    monkeypatch.setattr(source, "download", files())
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
    monkeypatch.setattr(source, "download", files())
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


def raw_without(def_index: int, paint_index: str | None = "any") -> bytes:
    """The fixture without one finish (`paint_index`), or without a whole type (`"any"`)."""
    entries = [
        e
        for e in json.loads(RAW)
        if not (
            e["weapon"]["weapon_id"] == def_index
            and (paint_index == "any" or e.get("paint_index") == paint_index)
        )
    ]
    return json.dumps(entries).encode()


def karambit_finish(snapshot: Snapshot, paint_index: int) -> Any:
    return next(
        f for f in find(snapshot, "knife", "karambit").finishes if f.paint_index == paint_index
    )


def test_missing_finish_is_kept_retired() -> None:
    previous = normalise()
    snapshot = normalise(raw_without(507, "38"), previous=previous)
    fade = karambit_finish(snapshot, 38)
    assert fade == karambit_finish(previous, 38).model_copy(update={"retired": True})
    assert not find(snapshot, "knife", "karambit").retired


def test_missing_type_is_kept_retired_with_all_finishes() -> None:
    previous = normalise()
    snapshot = normalise(raw_without(523), previous=previous)
    talon = find(snapshot, "knife", "talon")
    assert talon.retired
    assert talon.finishes and all(f.retired for f in talon.finishes)
    assert talon.slug == find(previous, "knife", "talon").slug


def test_returning_entries_are_no_longer_retired() -> None:
    first = normalise()
    retired = normalise(
        raw_without(523), previous=normalise(raw_without(507, "38"), previous=first)
    )
    back = normalise(previous=retired)
    assert not find(back, "knife", "talon").retired
    assert not karambit_finish(back, 38).retired
    assert karambit_finish(back, 38).slug == "fade"
    assert back == first


def test_new_finish_cannot_take_a_retired_slug() -> None:
    retired = normalise(raw_without(507, "38"), previous=normalise())
    entries = json.loads(RAW)
    for entry in entries:
        if entry["weapon"]["weapon_id"] == 507 and entry.get("paint_index") == "38":
            entry["paint_index"] = "777"
    raw = json.dumps(entries).encode()
    with pytest.raises(CatalogError) as error:
        normalise(raw, previous=retired)
    message = str(error.value)
    assert "Fade (38, retired)" in message
    assert "Fade (777)" in message


def test_new_type_cannot_take_a_retired_type_slug() -> None:
    retired = normalise(raw_without(523), previous=normalise())
    entries = json.loads(raw_without(523))
    talon = [e for e in json.loads(RAW) if e["weapon"]["weapon_id"] == 523]
    for entry in talon:
        entry["weapon"]["weapon_id"] = 599
        entry["weapon"]["id"] = "weapon_knife_talon_2"
    with pytest.raises(CatalogError) as error:
        normalise(json.dumps(entries + talon).encode(), previous=retired)
    message = str(error.value)
    assert "Talon Knife (523, retired)" in message
    assert "Talon Knife (599)" in message


def run_refresh(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, raw: bytes, order: Path) -> int:
    monkeypatch.setattr(source, "download", files(raw))
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
    return main(args)


def test_refresh_reports_retired_and_returning_entries(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    order = write_order(tmp_path / "order.json", {"types": {}, "finishes": {}})
    assert run_refresh(tmp_path, monkeypatch, RAW, order) == 0
    assert run_refresh(tmp_path, monkeypatch, raw_without(507, "38"), order) == 0
    err = capsys.readouterr().err
    assert f"Retired since {COMMIT[:12]}:\n  Karambit | Fade\n" in err
    assert run_refresh(tmp_path, monkeypatch, RAW, order) == 0
    err = capsys.readouterr().err
    assert f"Back since {COMMIT[:12]}:\n  Karambit | Fade\n" in err
    assert "Retired since" not in err


def test_display_order_may_list_retired_finishes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    order = write_order(
        tmp_path / "order.json",
        {"types": {"knife": ["karambit"]}, "finishes": {"knife/karambit": ["vanilla", "fade"]}},
    )
    assert run_refresh(tmp_path, monkeypatch, RAW, order) == 0
    assert run_refresh(tmp_path, monkeypatch, raw_without(507, "38"), order) == 0
    snapshot = load_snapshot(tmp_path / "snapshot.json")
    assert karambit_finish(snapshot, 38).retired


def test_agents_are_normalised() -> None:
    snapshot = normalise()
    assert snapshot.source.agents_file == "public/api/en/agents.json"
    assert [a.def_index for a in snapshot.agents] == [4613, 4619, 5305, 5404]
    ricksaw = snapshot.agents[-1]
    assert ricksaw.name == "Lt. Commander Ricksaw | NSWC SEAL"
    assert ricksaw.codename == "customplayer_ctm_st6_varianti"
    assert (ricksaw.team, ricksaw.retired) == ("ct", False)
    assert ricksaw.rarity.code == "rarity_ancient_character"
    assert ricksaw.image_url.startswith("https://community.akamai.steamstatic.com/")
    assert snapshot.agents[0].team == "t"


def test_missing_agent_is_kept_retired() -> None:
    previous = normalise()
    snapshot = source.normalise(RAW, agents_without("5305"), COMMIT, previous, {})
    operator = next(a for a in snapshot.agents if a.def_index == 5305)
    assert operator == next(a for a in previous.agents if a.def_index == 5305).model_copy(
        update={"retired": True}
    )
    back = normalise(previous=snapshot)
    assert not any(a.retired for a in back.agents)
    assert back == previous


def test_refresh_downloads_agents_from_the_same_commit(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    asked: list[tuple[str, str]] = []

    def download(commit: str, file: str = source.FILE) -> bytes:
        asked.append((commit, file))
        return RAW_AGENTS if file == source.AGENTS_FILE else RAW

    order = write_order(tmp_path / "order.json", {"types": {}, "finishes": {}})
    monkeypatch.setattr(source, "download", download)
    snapshot = tmp_path / "snapshot.json"
    args = ["refresh", "--commit", COMMIT, "--snapshot", str(snapshot), "--display-order"]
    assert main([*args, str(order)]) == 0
    assert sorted(asked) == [(COMMIT, source.AGENTS_FILE), (COMMIT, source.FILE)]
    assert len(load_snapshot(snapshot).agents) == 4
    assert "4 agents" in capsys.readouterr().out
    monkeypatch.setattr(source, "download", files(RAW, agents_without("5305")))
    assert main([*args, str(order)]) == 0
    err = capsys.readouterr().err
    assert f"Retired since {COMMIT[:12]}:\n  Operator | FBI SWAT\n" in err


def talon_again() -> bytes:
    """The dataset with a second Talon Knife under a new definition index and codename."""
    talon = [e for e in json.loads(RAW) if e["weapon"]["weapon_id"] == 523]
    for entry in talon:
        entry["weapon"]["weapon_id"] = 599
        entry["weapon"]["id"] = "weapon_knife_talon_2"
    return json.dumps(json.loads(RAW) + talon).encode()


def test_a_type_slug_clash_names_the_override_file() -> None:
    with pytest.raises(CatalogError) as error:
        normalise(talon_again())
    message = str(error.value)
    assert "Talon Knife (523) and Talon Knife (599) both have slug 'talon'" in message
    assert "slug_overrides.json" in message
    assert "type:599" in message


def test_override_sets_a_new_type_slug() -> None:
    snapshot = normalise(talon_again(), overrides={"type:599": "talon-2"})
    slugs = {t.def_index: t.slug for t in snapshot.item_types}
    assert (slugs[523], slugs[599]) == ("talon", "talon-2")


def test_a_type_keeps_its_slug_over_an_override() -> None:
    snapshot = normalise(overrides={"type:507": "karambit-2"}, previous=normalise())
    assert {t.def_index: t.slug for t in snapshot.item_types}[507] == "karambit"
