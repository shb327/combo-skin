"""A screenshot's objects in storage, and deleting them after the rows stop referring to
them. A failed delete is logged and left for `sweep`."""

import logging

from combo_api.screenshots.keys import version_keys
from combo_api.screenshots.models import ComboScreenshot
from combo_api.screenshots.storage import Bucket, Storage

logger = logging.getLogger("combo_api.screenshots")

Object = tuple[Bucket, str]


def versions_of(combo_id: str, shot: ComboScreenshot) -> list[Object]:
    return [("public", key) for key in version_keys(combo_id, shot.version_id, shot.widths)]


def objects_of(combo_id: str, shot: ComboScreenshot) -> list[Object]:
    """The original and every public version."""
    return [("originals", shot.original_key), *versions_of(combo_id, shot)]


async def delete_objects(storage: Storage, objects: list[Object]) -> int:
    """Delete each object; returns how many failed."""
    deleted, failed = [], 0
    for bucket, key in objects:
        try:
            await storage.delete(bucket, key)
        except Exception:
            failed += 1
            logger.warning("object delete failed bucket=%s key=%s", bucket, key)
        else:
            deleted.append(key)
    if deleted:
        logger.info("objects deleted keys=%s", ",".join(deleted))
    return failed
