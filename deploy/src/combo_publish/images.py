"""The public image bucket: which keys the site references, uploading the missing ones from the
local public bucket, and pruning keys no production publish has used for 30 days (spec 021,
R15 to R17)."""

import hashlib
import re
from collections.abc import Iterable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

from combo_publish.bucket import Bucket, ObjectInfo
from combo_publish.http import Http, HttpError
from combo_publish.settings import Settings
from combo_publish.state import State

IMMUTABLE = "public, max-age=31536000, immutable"
PRUNE_AFTER_DAYS = 30
UPLOADS_AT_ONCE = 8
# What the command manages in the public bucket. Anything else there is left alone.
PREFIXES = ("combos/", "catalog/")
PICTURE_KEY = re.compile(r"^catalog/[0-9a-f]{32}\.png$")
TYPES = {".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg"}

type Json = Any


class ImageError(Exception):
    """An image could not be read or stored. Nothing has been deployed."""


def picture_keys(catalog: Json, agents: Json) -> set[str]:
    """Every `image_key` of the built `catalog.json` and `agents.json`."""
    keys: set[str] = set()
    for kind in ("gloves", "knives"):
        for item_type in catalog[kind]:
            keys.update(finish["image_key"] for finish in item_type["finishes"])
    keys.update(agent["image_key"] for agent in agents["agents"])
    keys.discard(None)
    bad = sorted(key for key in keys if not PICTURE_KEY.fullmatch(key))
    if bad:
        raise ImageError(f"The catalog names keys that are not catalog copies: {bad[:3]}")
    return keys


def managed(listing: dict[str, ObjectInfo]) -> dict[str, ObjectInfo]:
    return {key: info for key, info in listing.items() if key.startswith(PREFIXES)}


@dataclass
class Plan:
    referenced: set[str]
    present: set[str]
    missing: list[str]
    unused: set[str]

    @property
    def already_there(self) -> int:
        return len(self.referenced & self.present)


def plan(referenced: set[str], listing: dict[str, ObjectInfo] | None) -> Plan:
    present = set(managed(listing)) if listing is not None else set()
    return Plan(
        referenced=referenced,
        present=present,
        missing=sorted(referenced - present),
        unused=present - referenced,
    )


@dataclass
class Uploaded:
    count: int = 0
    size: int = 0
    # Catalog copies the local bucket does not have: the site shows the game's picture.
    skipped: list[str] = field(default_factory=list)


def _read_local(http: Http, settings: Settings, key: str) -> tuple[bytes, str] | None:
    url = f"{settings.local_image_base_url}/{key}"
    try:
        answer = http.get(url)
    except HttpError as error:
        raise ImageError(f"The local bucket did not answer: {error}") from error
    if answer.status == 404 and key.startswith("catalog/"):
        return None
    if answer.status != 200:
        raise ImageError(f"The local bucket answered {key} with {answer.status}")
    suffix = key[key.rfind(".") :]
    content_type = answer.content_type or TYPES.get(suffix, "")
    if content_type != TYPES.get(suffix):
        raise ImageError(f"{key} has the type {content_type or 'none'}, not {TYPES.get(suffix)}")
    return answer.body, content_type


def local_sizes(http: Http, settings: Settings, keys: Iterable[str]) -> Uploaded:
    """What uploading `keys` would send, read but not uploaded (for `--dry-run`)."""
    result = Uploaded()
    for key in sorted(keys):
        found = _read_local(http, settings, key)
        if found is None:
            result.skipped.append(key)
            continue
        result.count += 1
        result.size += len(found[0])
    return result


def upload(http: Http, settings: Settings, bucket: Bucket, keys: Iterable[str]) -> Uploaded:
    """Copies each key from the local public bucket to `bucket`, checking every returned ETag
    against the MD5 of the bytes sent."""
    result = Uploaded()

    def one(key: str) -> int | None:
        found = _read_local(http, settings, key)
        if found is None:
            return None
        body, content_type = found
        etag = bucket.put(key, body, content_type, IMMUTABLE)
        if etag != hashlib.md5(body, usedforsecurity=False).hexdigest():
            raise ImageError(f"{key} was stored with an ETag that does not match its bytes")
        return len(body)

    ordered = sorted(keys)
    with ThreadPoolExecutor(max_workers=UPLOADS_AT_ONCE) as pool:
        for key, size in zip(ordered, pool.map(one, ordered), strict=True):
            if size is None:
                result.skipped.append(key)
            else:
                result.count += 1
                result.size += size
    return result


def changed(
    http: Http, settings: Settings, listing: dict[str, ObjectInfo], keys: set[str]
) -> list[str]:
    """`--verify-images`: the present keys whose size or ETag differs from the local copy."""
    differ = []
    for key in sorted(keys & set(listing)):
        found = _read_local(http, settings, key)
        if found is None:
            continue
        body = found[0]
        info = listing[key]
        if (
            info.size != len(body)
            or info.etag != hashlib.md5(body, usedforsecurity=False).hexdigest()
        ):
            differ.append(key)
    return differ


def mark_used(state: State, keys: Iterable[str], today: date) -> None:
    for key in keys:
        state.images[key] = today.isoformat()


def due(state: State, listing: dict[str, ObjectInfo], today: date) -> list[str]:
    """Listed keys that no production publish has used for 30 days or more.

    A listed key the state does not know is marked as used today first, so lost state never
    deletes anything. Keys the latest production publish used are never due, however long ago
    it was: the live site still shows them.
    """
    for key in managed(listing):
        state.images.setdefault(key, today.isoformat())
    cutoff = today - timedelta(days=PRUNE_AFTER_DAYS)
    live = set(state.live.images) if state.live else set()
    return sorted(
        key
        for key in managed(listing)
        if key not in live and date.fromisoformat(state.images[key]) <= cutoff
    )


def forget(state: State, keys: Iterable[str]) -> None:
    for key in keys:
        state.images.pop(key, None)


def combo_keys(listing: dict[str, ObjectInfo], combo_id: str) -> list[str]:
    """Every key of one combo's images."""
    if not re.fullmatch(r"[A-Za-z0-9_-]+", combo_id):
        raise ImageError(f"Not a combo id: {combo_id!r}")
    return sorted(key for key in listing if key.startswith(f"combos/{combo_id}/"))
