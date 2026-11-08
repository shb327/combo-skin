"""The S3 implementation against the real local storage service (RustFS in Compose and CI)."""

from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from combo_api.combos.ids import new_public_id as new_id
from combo_api.screenshots import commands
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


async def test_init_creates_both_buckets_once(test_settings: Settings) -> None:
    suffix = new_id()
    settings = test_settings.model_copy(
        update={
            "storage_originals_bucket": f"test-originals-{suffix}",
            "storage_public_bucket": f"test-images-{suffix}",
        }
    )
    storage = S3Storage(settings)
    said: list[str] = []
    try:
        assert await commands.init(storage, check=True, say=said.append) == 1
        assert said == [
            f"originals bucket test-originals-{suffix}: missing",
            f"public bucket test-images-{suffix}: missing",
        ]
        said.clear()
        assert await commands.init(storage, check=False, say=said.append) == 0
        assert said == [
            f"originals bucket test-originals-{suffix}: created",
            f"public bucket test-images-{suffix}: created",
            f"public bucket test-images-{suffix}: anyone may read objects",
        ]
        said.clear()
        assert await commands.init(storage, check=False, say=said.append) == 0
        assert said == [
            f"originals bucket test-originals-{suffix}: present",
            f"public bucket test-images-{suffix}: present",
            f"public bucket test-images-{suffix}: anyone may read objects (unchanged)",
        ]
        said.clear()
        assert await commands.init(storage, check=True, say=said.append) == 0
        assert await storage.bucket_policy(f"test-originals-{suffix}") is None

        await storage.put("public", "k.webp", b"x", "image/webp")
        await storage.put("originals", "k.png", b"x", "image/png")
        base = settings.storage_endpoint_url
        async with httpx.AsyncClient() as anonymous:
            public = await anonymous.get(f"{base}/test-images-{suffix}/k.webp")
            private = await anonymous.get(f"{base}/test-originals-{suffix}/k.png")
        assert (public.status_code, public.content) == (200, b"x")
        assert private.status_code == 403
    finally:
        for bucket in ("originals", "public"):
            if await storage.bucket_exists(storage.bucket_names[bucket]):
                for listed in await storage.list(bucket):
                    await storage.delete(bucket, listed.key)
                await storage.remove_bucket(storage.bucket_names[bucket])
