"""Our copies of the catalog's pictures, in the public bucket.

Each finish's and agent's picture is downloaded once from the game's image host and stored
under a key made from its URL, so a changed picture (which gets a new URL) gets a new key and
caches can keep every copy for ever. The API and the website show our copy and keep the
game's URL as a fallback.
"""

import hashlib
import io
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol
from urllib.parse import urlsplit

import anyio
from PIL import Image, UnidentifiedImageError

from combo_api.catalog.snapshot import Snapshot
from combo_api.catalog.validate import IMAGE_HOST_SUFFIX
from combo_api.screenshots.storage import IMMUTABLE, Storage

PREFIX = "catalog/"
MAX_BYTES = 2 * 1024 * 1024
MAX_SIDE = 2048
PARALLEL = 4
TIMEOUT = 20
TRIES = 2
CLIENT = "combo-skin-catalog-images"

Print = Callable[[str], None]
Fetch = Callable[[str], bytes]


class Refused(Exception):
    """A picture that is not copied: the reason is the message."""


def image_key(url: str) -> str:
    """The object key of the picture at this URL of the game's image host."""
    return f"{PREFIX}{hashlib.sha256(url.encode()).hexdigest()[:32]}.png"


def copy_url(base_url: str, url: str) -> str:
    """Our copy's URL, under the public bucket's base URL."""
    return f"{base_url}/{image_key(url)}"


@dataclass(frozen=True)
class Picture:
    name: str
    url: str


def pictures(snapshot: Snapshot) -> list[Picture]:
    """Every finish's and agent's picture, retired ones included, once per URL."""
    found = [
        Picture(f"{t.name} | {f.display_name}", f.image_url)
        for t in snapshot.item_types
        for f in t.finishes
    ]
    found += [Picture(a.name, a.image_url) for a in snapshot.agents]
    by_key: dict[str, Picture] = {}
    for picture in found:
        by_key.setdefault(image_key(picture.url), picture)
    return list(by_key.values())


class NoRedirects(urllib.request.HTTPRedirectHandler):
    """A redirect could lead off the game's image host: refuse it."""

    def redirect_request(
        self, req: Any, fp: Any, code: int, msg: str, headers: Any, newurl: str
    ) -> Any:
        raise Refused(f"answered with a redirect ({code})")


def make_opener() -> urllib.request.OpenerDirector:
    return urllib.request.build_opener(NoRedirects())


class Opener(Protocol):
    def open(self, request: urllib.request.Request, timeout: float) -> Any: ...


def download(url: str, opener: Opener | None = None) -> bytes:
    """The picture's bytes: only from `https` on the game's image host, without redirects, a
    PNG answer of at most `MAX_BYTES`."""
    parts = urlsplit(url)
    if parts.scheme != "https":
        raise Refused("not https")
    if not (parts.hostname or "").endswith(IMAGE_HOST_SUFFIX):
        raise Refused("not on the game's image host")
    request = urllib.request.Request(url, headers={"User-Agent": CLIENT})  # noqa: S310
    with (opener or make_opener()).open(request, timeout=TIMEOUT) as response:
        content_type = (response.headers.get("Content-Type") or "").split(";")[0].strip()
        if content_type != "image/png":
            raise Refused(f"answered {content_type or 'no content type'}")
        data: bytes = response.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise Refused("more than 2 MiB")
    return data


def checked(data: bytes) -> bytes:
    """The bytes, if they are a PNG of at most `MAX_SIDE` on each side."""
    try:
        with Image.open(io.BytesIO(data)) as image:
            if image.format != "PNG":
                raise Refused("not a PNG")
            width, height = image.size
            if width > MAX_SIDE or height > MAX_SIDE:
                raise Refused(f"larger than {MAX_SIDE} by {MAX_SIDE}")
            image.verify()
    except (UnidentifiedImageError, SyntaxError, OSError) as error:
        raise Refused("not an image") from error
    return data


async def copy(
    snapshot: Snapshot,
    storage: Storage,
    *,
    check: bool,
    fetch: Fetch | None = None,
    say: Print = print,
) -> int:
    """Copy every picture not in the public bucket yet; with `check`, only report those
    missing. Existing objects are never written again. Exit code 1 if any is missing (with
    `check`) or could not be copied."""
    present = {listed.key for listed in await storage.list("public", PREFIX)}
    wanted = pictures(snapshot)
    missing = [p for p in wanted if image_key(p.url) not in present]
    if check:
        say(f"Missing {len(missing)}")
        for picture in missing:
            say(f"  {picture.name}")
        return 1 if missing else 0

    failed: dict[str, str] = {}
    copied = 0
    limiter = anyio.CapacityLimiter(PARALLEL)

    async def one(picture: Picture) -> None:
        nonlocal copied
        reason = ""
        for _ in range(TRIES):
            try:
                data = await anyio.to_thread.run_sync(
                    fetch or download, picture.url, limiter=limiter
                )
                await storage.put(
                    "public", image_key(picture.url), checked(data), "image/png", IMMUTABLE
                )
            except Refused as refused:
                reason = str(refused)
                break
            except OSError as error:
                reason = f"could not be downloaded ({error})"
                continue
            copied += 1
            return
        failed[picture.name] = reason

    async with anyio.create_task_group() as group:
        for picture in missing:
            group.start_soon(one, picture)

    say(f"Copied {copied}, already there {len(wanted) - len(missing)}, failed {len(failed)}")
    for picture in wanted:
        if picture.name in failed:
            say(f"  {picture.name}: {failed[picture.name]}")
    return 1 if failed else 0
