import pytest

from combo_api.catalog.snapshot import (
    CatalogError,
    DisplayOrder,
    Finish,
    ItemType,
    Snapshot,
    load_display_order,
    load_snapshot,
)
from combo_api.catalog.validate import validate

SNAPSHOT = load_snapshot()
ORDER = load_display_order()


def replace_type(snapshot: Snapshot, slug: str, **changes: object) -> Snapshot:
    types = tuple(
        t.model_copy(update=changes) if t.slug == slug else t for t in snapshot.item_types
    )
    return snapshot.model_copy(update={"item_types": types})


def replace_finish(
    snapshot: Snapshot, type_slug: str, paint_index: int, **changes: object
) -> Snapshot:
    item_type = next(t for t in snapshot.item_types if t.slug == type_slug)
    finishes = tuple(
        f.model_copy(update=changes) if f.paint_index == paint_index else f
        for f in item_type.finishes
    )
    return replace_type(snapshot, type_slug, finishes=finishes)


def karambit() -> ItemType:
    return next(t for t in SNAPSHOT.item_types if t.slug == "karambit")


def finish(paint_index: int) -> Finish:
    return next(f for f in karambit().finishes if f.paint_index == paint_index)


def fails(snapshot: Snapshot, message: str, order: DisplayOrder = ORDER) -> None:
    with pytest.raises(CatalogError) as error:
        validate(snapshot, order)
    assert message in str(error.value)


def test_duplicate_definition_index() -> None:
    fails(replace_type(SNAPSHOT, "bayonet", def_index=507), "Duplicate definition index 507")


def test_duplicate_finish_slug() -> None:
    fails(
        replace_finish(SNAPSHOT, "karambit", 38, slug="vanilla"), "duplicate finish slug 'vanilla'"
    )


def test_slug_not_kebab_case() -> None:
    fails(
        replace_finish(SNAPSHOT, "karambit", 38, slug="Fade_1"),
        "Karambit | Fade (507:38): slug 'Fade_1' is not kebab-case",
    )


def test_float_range_out_of_order() -> None:
    fails(
        replace_finish(SNAPSHOT, "karambit", 38, float_min=0.5, float_max=0.08),
        "Karambit | Fade (507:38): float range 0.5 to 0.08",
    )


def test_vanilla_with_floats() -> None:
    fails(
        replace_finish(SNAPSHOT, "karambit", 0, float_min=0.0, float_max=1.0),
        "Karambit | Vanilla (507:0): Vanilla has a float range",
    )


def test_doppler_without_phase() -> None:
    fails(
        replace_finish(SNAPSHOT, "karambit", 419, phase=None),
        "Karambit | Doppler (507:419): missing or unknown phase None",
    )


def test_doppler_with_unknown_phase() -> None:
    fails(replace_finish(SNAPSHOT, "karambit", 419, phase="Phase 9"), "unknown phase 'Phase 9'")


@pytest.mark.parametrize(
    "url",
    [
        "https://images.example.com/karambit.png",
        "http://community.akamai.steamstatic.com/economy/image/abc",
        "https://steamstatic.com.example.com/economy/image/abc",
    ],
)
def test_image_url_must_be_https_on_steam_cdn(url: str) -> None:
    fails(
        replace_finish(SNAPSHOT, "karambit", 38, image_url=url),
        "Karambit | Fade (507:38): image URL is not HTTPS on a .steamstatic.com host",
    )


def test_display_order_entry_without_finish() -> None:
    finishes = {**ORDER.finishes, "knife/karambit": (*ORDER.finishes["knife/karambit"], "nope")}
    fails(
        SNAPSHOT,
        "knife/karambit has no finish 'nope'",
        ORDER.model_copy(update={"finishes": finishes}),
    )


def test_display_order_entry_without_type() -> None:
    types = {**ORDER.types, "knife": (*ORDER.types["knife"], "spoon")}
    fails(SNAPSHOT, "no knife type 'spoon'", ORDER.model_copy(update={"types": types}))


def test_real_snapshot_is_valid() -> None:
    validate(SNAPSHOT, ORDER)
    assert finish(0).name == "Vanilla"
