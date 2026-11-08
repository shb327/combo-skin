"""Maintenance commands: bucket setup, remaking every public version, and removing objects no
row refers to. Each returns an exit code and prints what it did."""

import logging
from collections.abc import Callable
from datetime import datetime, timedelta

import anyio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.admins import clock
from combo_api.combos.models import Combo
from combo_api.screenshots import images
from combo_api.screenshots.keys import new_id, version_key, version_keys
from combo_api.screenshots.models import ComboScreenshot
from combo_api.screenshots.objects import Object, delete_objects, versions_of
from combo_api.screenshots.storage import BUCKETS, IMMUTABLE, Missing, S3Storage, Storage

logger = logging.getLogger("combo_api.screenshots")

Print = Callable[[str], None]
# Unreferenced objects younger than this may belong to an upload that has not committed yet.
SWEEP_AFTER = timedelta(days=1)


async def init(storage: S3Storage, *, check: bool, say: Print = print) -> int:
    """Create both buckets and let anyone read the public one. With `check`, only check that
    both exist, changing nothing: what production runs, where buckets are made by hand."""
    names = storage.bucket_names
    code = 0
    for bucket in BUCKETS:
        name = names[bucket]
        exists = await storage.bucket_exists(name)
        if check:
            say(f"{bucket} bucket {name}: {'present' if exists else 'missing'}")
            code = code if exists else 1
            continue
        if not exists:
            await storage.create_bucket(name)
        say(f"{bucket} bucket {name}: {'present' if exists else 'created'}")
    if check:
        return code

    public = names["public"]
    wanted = S3Storage.public_read_policy(public)
    if await storage.bucket_policy(public) == wanted:
        say(f"public bucket {public}: anyone may read objects (unchanged)")
    else:
        await storage.allow_public_read(public)
        say(f"public bucket {public}: anyone may read objects")
    originals = names["originals"]
    if await storage.bucket_policy(originals) is not None:
        say(f"originals bucket {originals} has a bucket policy: remove it, it must stay private")
        return 1
    return 0


async def rebuild(db: AsyncSession, storage: Storage, *, say: Print = print) -> int:
    """Remake every screenshot's public versions from its original, with the current
    watermark and a new version id; the old versions are deleted after each commit."""
    rows = (
        await db.execute(
            select(ComboScreenshot.combo_id, Combo.public_id)
            .join(Combo, Combo.id == ComboScreenshot.combo_id)
            .order_by(ComboScreenshot.combo_id)
        )
    ).all()
    await db.rollback()
    rebuilt = failed = 0
    for row_id, combo_id in rows:
        shot = await db.get(ComboScreenshot, row_id)
        if shot is None:
            continue
        original_key = shot.original_key
        await db.rollback()
        try:
            data = (await storage.get("originals", original_key)).data
        except Missing:
            say(f"{combo_id}: original {original_key} is missing")
            failed += 1
            continue
        made = await anyio.to_thread.run_sync(images.make_versions, data)
        version_id = new_id()
        written: list[Object] = []
        for version in made:
            key = version_key(combo_id, version_id, version.width)
            await storage.put("public", key, version.data, "image/webp", IMMUTABLE)
            written.append(("public", key))

        shot = await db.get(ComboScreenshot, row_id, with_for_update=True)
        if shot is None or shot.original_key != original_key:
            # Replaced or removed meanwhile: its new screenshot has its own versions.
            await db.rollback()
            await delete_objects(storage, written)
            continue
        old = versions_of(combo_id, shot)
        shot.version_id = version_id
        shot.widths = [version.width for version in made]
        shot.watermark_revision = images.WATERMARK_REVISION
        await db.commit()
        await delete_objects(storage, old)
        rebuilt += 1
    say(f"Rebuilt {rebuilt} screenshots, {failed} failed")
    return 1 if failed else 0


async def sweep(
    db: AsyncSession,
    storage: Storage,
    *,
    dry_run: bool,
    now: datetime | None = None,
    say: Print = print,
) -> int:
    """Delete objects older than a day that no row refers to, in both buckets."""
    cutoff = (now or clock.now()) - SWEEP_AFTER
    rows = (
        await db.execute(
            select(
                Combo.public_id,
                ComboScreenshot.original_key,
                ComboScreenshot.version_id,
                ComboScreenshot.widths,
            ).join(Combo, Combo.id == ComboScreenshot.combo_id)
        )
    ).all()
    await db.rollback()
    referenced: dict[str, set[str]] = {
        "originals": {original for _, original, _, _ in rows},
        "public": {
            key
            for combo_id, _, version_id, widths in rows
            for key in version_keys(combo_id, version_id, widths)
        },
    }
    code = 0
    for bucket in BUCKETS:
        listed = await storage.list(bucket)
        stale = [
            item.key
            for item in listed
            if item.key not in referenced[bucket] and item.last_modified < cutoff
        ]
        if dry_run:
            for key in stale:
                say(f"{bucket}: {key}")
            say(f"{bucket}: {len(listed)} objects, {len(stale)} unreferenced (dry run)")
            continue
        failed = await delete_objects(storage, [(bucket, key) for key in stale])
        say(f"{bucket}: {len(listed)} objects, {len(stale) - failed} deleted, {failed} failed")
        code = 1 if failed else code
    return code
