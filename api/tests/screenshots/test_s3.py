"""The S3 implementation against the real local storage service (RustFS in Compose and CI)."""

from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest

from combo_api.combos.ids import new_public_id as new_id
from combo_api.screenshots.storage import IMMUTABLE, Missing, S3Storage
from combo_api.settings import Settings

pytestmark = pytest.mark.anyio


@pytest.fixture
async def s3(test_settings: Settings) -> AsyncIterator[S3Storage]:
    """S3 storage on two throwaway buckets, removed afterwards."""
    suffix = new_id()
    settings = test_settings.model_copy(
        update={
            "storage_originals_bucket": f"test-originals-{suffix}",
            "storage_public_bucket": f"test-images-{suffix}",
        }
    )
    storage = S3Storage(settings)
    await storage.create_bucket(settings.storage_originals_bucket)
    await storage.create_bucket(settings.storage_public_bucket)
    try:
        yield storage
    finally:
        for bucket in ("originals", "public"):
            for listed in await storage.list(bucket):
                await storage.delete(bucket, listed.key)
        await storage.remove_bucket(settings.storage_originals_bucket)
        await storage.remove_bucket(settings.storage_public_bucket)


async def test_put_get_list_delete(s3: S3Storage) -> None:
    before = datetime.now(UTC) - timedelta(minutes=1)
    await s3.put("public", "combos/a/v/640.webp", b"webp bytes", "image/webp", IMMUTABLE)
    await s3.put("originals", "combos/a/u.png", b"png bytes", "image/png")

    blob = await s3.get("public", "combos/a/v/640.webp")
    assert blob.data == b"webp bytes"
    assert blob.content_type == "image/webp"
    assert blob.cache_control == "public, max-age=31536000, immutable"
    original = await s3.get("originals", "combos/a/u.png")
    assert (original.data, original.cache_control) == (b"png bytes", None)

    listed = await s3.list("public", "combos/a/")
    assert [(o.key, o.size) for o in listed] == [("combos/a/v/640.webp", 10)]
    assert listed[0].last_modified >= before
    assert await s3.list("public", "combos/b/") == []

    await s3.delete("public", "combos/a/v/640.webp")
    await s3.delete("public", "combos/a/v/640.webp")
    with pytest.raises(Missing):
        await s3.get("public", "combos/a/v/640.webp")
    assert await s3.list("public") == []


async def test_list_pages_through_many_objects(s3: S3Storage) -> None:
    for index in range(3):
        await s3.put("originals", f"combos/p/{index}.png", b"x", "image/png")
    listed = await s3.list("originals", page_size=2)
    assert [o.key for o in listed] == [f"combos/p/{index}.png" for index in range(3)]


async def test_buckets(s3: S3Storage) -> None:
    assert await s3.bucket_exists(s3.bucket_names["originals"])
    assert not await s3.bucket_exists(f"test-missing-{new_id()}")
    public = s3.bucket_names["public"]
    assert await s3.bucket_policy(public) is None
    await s3.allow_public_read(public)
    policy = await s3.bucket_policy(public)
    assert policy == S3Storage.public_read_policy(public)
