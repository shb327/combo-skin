from combo_api.catalog.slugs import finish_slug, slugify, type_slug
from combo_api.catalog.snapshot import (
    dump_snapshot,
    load_display_order,
    load_snapshot,
    ordered_finishes,
    ordered_types,
    unlisted,
)
from combo_api.catalog.source import FILE, LICENSE, REPOSITORY
from combo_api.catalog.validate import problems
from tests.catalog.support import find, website_slugs

SNAPSHOT = load_snapshot()
ORDER = load_display_order()

ORIGINAL_KNIVES = ["bayonet", "bowie", "butterfly", "falchion", "flip", "gut", "huntsman"]
ORIGINAL_KNIVES += ["karambit", "m9-bayonet", "shadow-daggers"]
NEWER_KNIVES = ["navaja", "nomad", "paracord", "skeleton", "stiletto", "survival", "talon", "ursus"]
KNIFE_FINISHES = {
    **dict.fromkeys(ORIGINAL_KNIVES, 35),
    **dict.fromkeys(NEWER_KNIVES, 25),
    "classic": 13,
    "kukri": 13,
}


def test_snapshot_records_its_source() -> None:
    source = SNAPSHOT.source
    assert (source.repository, source.file, source.license) == (REPOSITORY, FILE, LICENSE)
    assert len(source.commit) == 40
    assert int(source.commit, 16) >= 0


def test_snapshot_is_written_canonically() -> None:
    from combo_api.catalog.snapshot import SNAPSHOT as PATH

    assert dump_snapshot(SNAPSHOT) == PATH.read_text()


def test_snapshot_passes_validation() -> None:
    assert problems(SNAPSHOT, ORDER) == []


def test_snapshot_counts() -> None:
    knives = {t.slug: len(t.finishes) for t in SNAPSHOT.item_types if t.kind == "knife"}
    gloves = [t for t in SNAPSHOT.item_types if t.kind == "glove"]
    assert knives == KNIFE_FINISHES
    assert sum(knives.values()) == 576
    assert len(gloves) == 8
    assert sum(len(t.finishes) for t in gloves) == 94


def test_karambit_vanilla() -> None:
    karambit = find(SNAPSHOT, "knife", "karambit")
    vanilla = next(f for f in karambit.finishes if f.paint_index == 0)
    assert karambit.def_index == 507
    assert karambit.codename == "weapon_knife_karambit"
    assert (vanilla.slug, vanilla.name, vanilla.paint_codename) == ("vanilla", "Vanilla", None)
    assert (vanilla.float_min, vanilla.float_max) == (None, None)


def test_karambit_doppler_phase_2() -> None:
    finish = next(f for f in find(SNAPSHOT, "knife", "karambit").finishes if f.paint_index == 419)
    assert finish.paint_codename == "am_doppler_phase2"
    assert (finish.name, finish.phase, finish.slug) == ("Doppler", "Phase 2", "doppler-phase-2")
    assert finish.display_name == "Doppler (Phase 2)"
    assert (finish.float_min, finish.float_max) == (0.0, 0.08)


def test_talon_doppler_phase_1_has_its_own_paint_kit() -> None:
    talon = find(SNAPSHOT, "knife", "talon")
    finish = next(f for f in talon.finishes if f.slug == "doppler-phase-1")
    assert (talon.def_index, finish.paint_index) == (523, 852)


def test_karambit_gamma_doppler_emerald() -> None:
    finish = next(f for f in find(SNAPSHOT, "knife", "karambit").finishes if f.paint_index == 568)
    assert finish.slug == "gamma-doppler-emerald"
    assert finish.display_name == "Gamma Doppler (Emerald)"


def test_specialist_mogul() -> None:
    specialist = find(SNAPSHOT, "glove", "specialist")
    finish = next(f for f in specialist.finishes if f.slug == "mogul")
    assert (specialist.def_index, finish.paint_index) == (5034, 10064)
    assert finish.rarity.name == "Extraordinary"
    assert (finish.float_min, finish.float_max) == (0.06, 0.8)


def test_every_website_slug_is_kept() -> None:
    for website_type in website_slugs():
        item_type = find(SNAPSHOT, website_type["kind"], website_type["slug"])
        assert set(website_type["finishes"]) <= {f.slug for f in item_type.finishes}, item_type.name
    moto = {f.slug for f in find(SNAPSHOT, "glove", "moto").finishes}
    broken_fang = {f.slug for f in find(SNAPSHOT, "glove", "broken-fang").finishes}
    assert "3rd-commando" in moto
    assert "yellow-jacket" in broken_fang


def test_display_order_keeps_the_website_order() -> None:
    for kind in ("glove", "knife"):
        expected = [w["slug"] for w in website_slugs() if w["kind"] == kind]
        assert [t.slug for t in ordered_types(SNAPSHOT, ORDER, kind)] == expected
    for website_type in website_slugs():
        item_type = find(SNAPSHOT, website_type["kind"], website_type["slug"])
        finishes = ordered_finishes(item_type, ORDER)
        listed = website_type["finishes"]
        assert [f.slug for f in finishes[: len(listed)]] == listed
        rest = finishes[len(listed) :]
        assert [f.paint_index for f in rest] == sorted(f.paint_index for f in rest)


def test_new_glove_finishes_are_unlisted() -> None:
    names = unlisted(SNAPSHOT, ORDER)
    assert len(names) == 22
    assert "Driver Gloves | Wave Chaser" in names
    assert all(
        name.split(" | ")[0] in {"Driver Gloves", "Specialist Gloves", "Sport Gloves"}
        for name in names
    )


def test_slug_rule() -> None:
    assert type_slug("Bowie Knife") == "bowie"
    assert type_slug("Broken Fang Gloves") == "broken-fang"
    assert type_slug("M9 Bayonet") == "m9-bayonet"
    assert finish_slug("Doppler", "Black Pearl") == "doppler-black-pearl"
    assert finish_slug("Pandora's Box", None) == "pandoras-box"
    assert slugify("CAUTION!") == "caution"
    assert slugify("Lt. Commander") == "lt-commander"
