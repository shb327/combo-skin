"""Criteria 7 and 10: images and pruning."""

import hashlib
from datetime import timedelta

import pytest

from combo_publish.images import IMMUTABLE
from tests.support import AGENTS, SMALL_CATALOG, World, combo, screenshot_keys


@pytest.fixture
def ready(world: World) -> World:
    world.add(
        combo("a", ("specialist", "mogul"), ("karambit", "fade")),
        combo("b", ("sport", "vice"), ("karambit", "fade"), version="v7"),
    )
    return world


def every_picture() -> set[str]:
    keys = {
        finish["image_key"]
        for kind in ("gloves", "knives")
        for item_type in SMALL_CATALOG[kind]
        for finish in item_type["finishes"]
    }
    return keys | {agent["image_key"] for agent in AGENTS["agents"]}


# Criterion 7


def test_the_referenced_keys_are_every_screenshot_and_every_catalog_picture(ready: World) -> None:
    assert ready.run("publish").code == 0
    expected = set(screenshot_keys("a")) | set(screenshot_keys("b", "v7")) | every_picture()
    assert set(ready.public.store) == expected
    assert sorted(ready.public.puts) == sorted(expected)


def test_uploads_keep_their_type_and_get_the_immutable_cache_control(ready: World) -> None:
    assert ready.run("publish").code == 0
    for key, (body, kind, cache) in ready.public.store.items():
        assert body == ready.local_images[key]
        assert kind == ("image/webp" if key.endswith(".webp") else "image/png")
        assert cache == IMMUTABLE == "public, max-age=31536000, immutable"


def test_present_keys_are_not_uploaded_again(ready: World) -> None:
    ready.public.store["combos/a/v1/640.webp"] = (
        b"webp combos/a/v1/640.webp",
        "image/webp",
        IMMUTABLE,
    )
    assert ready.run("publish").code == 0
    assert "combos/a/v1/640.webp" not in ready.public.puts
    ready.public.puts.clear()
    ready.clear_deployments()
    assert ready.run("publish").code == 0
    assert ready.public.puts == []


def test_a_wrong_etag_stops_before_wrangler_runs(ready: World) -> None:
    ready.public.bad_etag.add("combos/a/v1/1280.webp")
    result = ready.run("publish")
    assert result.code == 1
    assert (
        "combos/a/v1/1280.webp was stored with an ETag that does not match its bytes" in result.err
    )
    assert ready.calls("wrangler") == []


def test_a_screenshot_missing_locally_stops(ready: World) -> None:
    del ready.local_images["combos/b/v7/1920.webp"]
    result = ready.run("publish")
    assert result.code == 1
    assert "The local bucket answered combos/b/v7/1920.webp with 404" in result.err
    assert ready.deploys() == []


def test_a_catalog_copy_missing_locally_is_skipped_and_counted(ready: World) -> None:
    missing = sorted(every_picture())[0]
    del ready.local_images[missing]
    result = ready.run("publish")
    assert result.code == 0, result.err
    assert missing not in ready.public.store
    assert "1 catalog copies missing locally (the site shows the game's)" in result.out


def test_verify_images_uploads_a_changed_copy_again(ready: World) -> None:
    assert ready.run("publish").code == 0
    ready.public.store["combos/a/v1/640.webp"] = (b"corrupt", "image/webp", IMMUTABLE)
    ready.public.puts.clear()
    ready.clear_deployments()
    assert ready.run("publish").code == 0
    assert ready.public.puts == []
    ready.clear_deployments()
    assert ready.run("publish", "--verify-images").code == 0
    assert ready.public.puts == ["combos/a/v1/640.webp"]
    assert (
        ready.public.store["combos/a/v1/640.webp"][0] == ready.local_images["combos/a/v1/640.webp"]
    )


def test_only_managed_prefixes_are_counted_or_pruned(ready: World) -> None:
    ready.public.store["other/readme.txt"] = (b"x", "text/plain", None)
    assert ready.run("publish").code == 0
    ready.today += timedelta(days=90)
    ready.clear_deployments()
    assert ready.run("publish").code == 0
    assert "other/readme.txt" in ready.public.store


# Criterion 10


def unpublish_b(world: World) -> None:
    world.api.combos = [one for one in world.api.combos if one["id"] != "b"]


def test_keys_unused_for_30_days_are_pruned_after_a_production_publish(ready: World) -> None:
    assert ready.run("publish").code == 0
    unpublish_b(ready)
    for days, deleted in ((29, []), (30, sorted(screenshot_keys("b", "v7")))):
        ready.today = ready.now.date() + timedelta(days=days)
        ready.clear_deployments()
        result = ready.run("publish")
        assert result.code == 0, result.err
        assert ready.public.deleted == deleted
    assert "Pruned: 3 images unused by production for 30 days" in result.out
    assert not set(screenshot_keys("b", "v7")) & set(ready.state()["images"])


def test_a_preview_publish_deletes_nothing(ready: World) -> None:
    assert ready.run("publish").code == 0
    unpublish_b(ready)
    ready.today += timedelta(days=60)
    ready.clear_deployments()
    assert ready.run("publish", "--preview").code == 0
    assert ready.public.deleted == []


def test_a_failed_production_publish_deletes_nothing(ready: World) -> None:
    assert ready.run("publish").code == 0
    unpublish_b(ready)
    ready.today += timedelta(days=60)
    ready.clear_deployments()
    ready.config["fail"] = ["main"]
    ready.write_config()
    assert ready.run("publish").code == 1
    assert ready.public.deleted == []


def test_prune_dry_run_lists_and_deletes_nothing(ready: World) -> None:
    assert ready.run("publish").code == 0
    unpublish_b(ready)
    ready.clear_deployments()
    assert ready.run("publish").code == 0
    ready.today += timedelta(days=31)
    result = ready.run("prune-images", "--dry-run")
    assert result.code == 0, result.err
    assert "Would delete 3 images" in result.out
    for key in screenshot_keys("b", "v7"):
        assert f"https://img.combo.skin/{key}" in result.out
    assert ready.public.deleted == []
    result = ready.run("prune-images")
    assert result.code == 0
    assert sorted(ready.public.deleted) == sorted(screenshot_keys("b", "v7"))


def test_prune_never_deletes_what_the_live_deployment_uses(ready: World) -> None:
    assert ready.run("publish").code == 0
    ready.today += timedelta(days=400)
    result = ready.run("prune-images")
    assert result.code == 0, result.err
    assert "Deleting 0 images" in result.out
    assert ready.public.deleted == []


def test_without_a_state_file_nothing_is_deleted_and_every_key_is_marked_today(
    ready: World,
) -> None:
    for key in ("combos/old/v1/640.webp", "catalog/" + "f" * 32 + ".png"):
        ready.public.store[key] = (b"x", "image/webp", IMMUTABLE)
    result = ready.run("publish")
    assert result.code == 0, result.err
    assert ready.public.deleted == []
    marked = ready.state()["images"]
    assert marked["combos/old/v1/640.webp"] == ready.today.isoformat()
    assert set(marked) == set(ready.public.store)
    assert all(day == ready.today.isoformat() for day in marked.values())


def test_prune_now_deletes_exactly_one_combo_and_prints_the_cache_note(ready: World) -> None:
    assert ready.run("publish").code == 0
    result = ready.run("prune-images", "--now", "b")
    assert result.code == 0, result.err
    assert sorted(ready.public.deleted) == sorted(screenshot_keys("b", "v7"))
    assert "Cloudflare's cache may keep serving these images until they are purged" in result.out
    assert set(screenshot_keys("a")) <= set(ready.public.store)


def test_prune_now_refuses_a_bad_id(ready: World) -> None:
    result = ready.run("prune-images", "--now", "../a")
    assert result.code == 1
    assert ready.public.deleted == []


def test_uploads_are_checked_against_md5(ready: World) -> None:
    assert ready.run("publish").code == 0
    for key, info in ready.public.objects().items():
        assert info.etag == hashlib.md5(ready.local_images[key], usedforsecurity=False).hexdigest()
