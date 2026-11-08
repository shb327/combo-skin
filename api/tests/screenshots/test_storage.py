from datetime import UTC, datetime

import pytest

from combo_api.screenshots.storage import IMMUTABLE, MemoryStorage, Missing

pytestmark = pytest.mark.anyio


async def test_memory_storage_keeps_objects_per_bucket() -> None:
    storage = MemoryStorage()
    await storage.put("public", "combos/a/1.webp", b"one", "image/webp", IMMUTABLE)
    await storage.put("originals", "combos/a/1.png", b"two", "image/png")

    blob = await storage.get("public", "combos/a/1.webp")
    assert (blob.data, blob.content_type, blob.cache_control) == (b"one", "image/webp", IMMUTABLE)
    assert (await storage.get("originals", "combos/a/1.png")).cache_control is None
    with pytest.raises(Missing):
        await storage.get("public", "combos/a/1.png")

    listed = await storage.list("public")
    assert [(o.key, o.size) for o in listed] == [("combos/a/1.webp", 3)]
    assert listed[0].last_modified <= datetime.now(UTC)
    assert [o.key for o in await storage.list("originals", "combos/b/")] == []

    await storage.delete("public", "combos/a/1.webp")
    await storage.delete("public", "combos/a/1.webp")
    assert await storage.list("public") == []


async def test_memory_storage_can_fail_deletes() -> None:
    storage = MemoryStorage()
    await storage.put("public", "k", b"x", "image/webp")
    storage.fail_deletes = True
    with pytest.raises(OSError):
        await storage.delete("public", "k")
    assert [o.key for o in await storage.list("public")] == ["k"]
