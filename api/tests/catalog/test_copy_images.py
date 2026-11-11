"""Copying the catalog's pictures into the public bucket, once each."""

import io
import re
from collections.abc import Callable
from typing import Any

import pytest
from PIL import Image

from combo_api.catalog import images
from combo_api.catalog.images import Refused, copy, download, image_key
from combo_api.catalog.snapshot import Snapshot, load_snapshot
from combo_api.screenshots.storage import IMMUTABLE, MemoryStorage

pytestmark = pytest.mark.anyio

HOST = "https://community.akamai.steamstatic.com"


def small_snapshot() -> Snapshot:
    """Karambit with two finishes (one retired), and two agents, from the committed snapshot."""
    full = load_snapshot()
    karambit = next(t for t in full.item_types if t.slug == "karambit")
    finishes = tuple(
        f.model_copy(update={"retired": f.slug == "fade"})
        for f in karambit.finishes
        if f.slug in {"vanilla", "fade"}
    )
    return full.model_copy(
        update={
            "item_types": (karambit.model_copy(update={"finishes": finishes}),),
            "agents": full.agents[:2],
        }
    )


def png(width: int = 512, height: int = 384, fmt: str = "PNG") -> bytes:
    buffer = io.BytesIO()
    Image.new("RGBA" if fmt == "PNG" else "RGB", (width, height)).save(buffer, format=fmt)
    return buffer.getvalue()


class Fetches:
    """A stand-in for the download: answers by URL and records every request."""

    def __init__(self, answer: Callable[[str], bytes] = lambda url: png()) -> None:
        self.answer = answer
        self.urls: list[str] = []

    def __call__(self, url: str) -> bytes:
        self.urls.append(url)
        return self.answer(url)


def urls(snapshot: Snapshot) -> list[str]:
    found = [f.image_url for t in snapshot.item_types for f in t.finishes]
    return found + [a.image_url for a in snapshot.agents]


def test_the_key_comes_from_the_url() -> None:
    url = f"{HOST}/economy/image/abc"
    key = image_key(url)
    assert re.fullmatch(r"catalog/[0-9a-f]{32}\.png", key)
    assert image_key(url) == key
    assert image_key(f"{HOST}/economy/image/abd") != key


async def test_copies_every_picture_once() -> None:
    snapshot = small_snapshot()
    storage = MemoryStorage()
    fetch = Fetches()
    said: list[str] = []
    assert await copy(snapshot, storage, check=False, fetch=fetch, say=said.append) == 0
    assert sorted(fetch.urls) == sorted(urls(snapshot))
    assert storage.keys("public") == {image_key(url) for url in urls(snapshot)}
    assert storage.keys("originals") == set()
    blob = await storage.get("public", image_key(urls(snapshot)[0]))
    assert (blob.content_type, blob.cache_control) == ("image/png", IMMUTABLE)
    assert blob.data == png()
    assert said[0] == "Copied 4, already there 0, failed 0"

    again = Fetches()
    assert await copy(snapshot, storage, check=False, fetch=again, say=said.append) == 0
    assert again.urls == []
    assert said[-1] == "Copied 0, already there 4, failed 0"


async def test_never_overwrites_a_copy() -> None:
    snapshot = small_snapshot()
    storage = MemoryStorage()
    first = image_key(urls(snapshot)[0])
    await storage.put("public", first, b"kept", "image/png", IMMUTABLE)
    fetch = Fetches()
    await copy(snapshot, storage, check=False, fetch=fetch, say=lambda _: None)
    assert urls(snapshot)[0] not in fetch.urls
    assert (await storage.get("public", first)).data == b"kept"


@pytest.mark.parametrize(
    ("answer", "reason"),
    [
        (lambda url: png(fmt="JPEG"), "not a PNG"),
        (lambda url: b"<html>not an image</html>", "not an image"),
        (lambda url: png(4096, 4096), "larger than 2048 by 2048"),
    ],
)
async def test_refuses_what_is_not_a_picture(answer: Callable[[str], bytes], reason: str) -> None:
    snapshot = small_snapshot()
    storage = MemoryStorage()
    said: list[str] = []
    assert await copy(snapshot, storage, check=False, fetch=Fetches(answer), say=said.append) == 1
    assert storage.keys("public") == set()
    assert said[0] == "Copied 0, already there 0, failed 4"
    assert f"  Karambit | Vanilla: {reason}" in said


async def test_a_failure_is_tried_again_once_then_reported() -> None:
    snapshot = small_snapshot()
    calls: dict[str, int] = {}

    def flaky(url: str) -> bytes:
        calls[url] = calls.get(url, 0) + 1
        if url == urls(snapshot)[0] and calls[url] == 1:
            raise OSError("connection reset")
        if url == urls(snapshot)[1]:
            raise OSError("connection reset")
        return png()

    storage = MemoryStorage()
    said: list[str] = []
    assert await copy(snapshot, storage, check=False, fetch=flaky, say=said.append) == 1
    assert calls[urls(snapshot)[0]] == 2
    assert calls[urls(snapshot)[1]] == 2
    assert said[0] == "Copied 3, already there 0, failed 1"


async def test_check_downloads_nothing() -> None:
    snapshot = small_snapshot()
    storage = MemoryStorage()
    fetch = Fetches()
    said: list[str] = []
    assert await copy(snapshot, storage, check=True, fetch=fetch, say=said.append) == 1
    assert said[0] == "Missing 4"
    await copy(snapshot, storage, check=False, fetch=fetch, say=said.append)
    fetch.urls.clear()
    await storage.delete("public", image_key(urls(snapshot)[2]))
    assert await copy(snapshot, storage, check=True, fetch=fetch, say=said.append) == 1
    assert said[-2:] == ["Missing 1", f"  {snapshot.agents[0].name}"]
    await copy(snapshot, storage, check=False, fetch=Fetches(), say=lambda _: None)
    assert await copy(snapshot, storage, check=True, fetch=fetch, say=said.append) == 0
    assert said[-1] == "Missing 0"
    assert fetch.urls == []


class FakeResponse(io.BytesIO):
    def __init__(self, body: bytes, content_type: str = "image/png") -> None:
        super().__init__(body)
        self.headers = {"Content-Type": content_type}

    def __enter__(self) -> FakeResponse:
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()


class FakeOpener:
    def __init__(self, response: FakeResponse) -> None:
        self.response = response
        self.requests: list[Any] = []

    def open(self, request: Any, timeout: float) -> FakeResponse:
        self.requests.append((request, timeout))
        return self.response


def test_download_checks_the_address_and_the_answer() -> None:
    opener = FakeOpener(FakeResponse(png()))
    assert download(f"{HOST}/economy/image/abc", opener=opener) == png()
    request, timeout = opener.requests[0]
    assert timeout == images.TIMEOUT
    assert request.get_header("User-agent") == images.CLIENT
    for url, reason in (
        ("http://community.akamai.steamstatic.com/economy/image/abc", "not https"),
        ("https://images.example.com/economy/image/abc", "not on the game's image host"),
        ("https://steamstatic.com.example.com/x", "not on the game's image host"),
    ):
        with pytest.raises(Refused, match=reason):
            download(url, opener=opener)
    with pytest.raises(Refused, match="more than 2 MiB"):
        download(f"{HOST}/x", opener=FakeOpener(FakeResponse(b"0" * (3 * 1024 * 1024))))
    with pytest.raises(Refused, match="answered text/html"):
        download(f"{HOST}/x", opener=FakeOpener(FakeResponse(png(), "text/html")))


def test_redirects_are_refused() -> None:
    handler = images.NoRedirects()
    with pytest.raises(Refused, match="redirect"):
        handler.redirect_request(None, None, 302, "Found", {}, "https://elsewhere.example.com/")
    handlers = images.make_opener().handlers  # type: ignore[attr-defined]
    assert any(isinstance(h, images.NoRedirects) for h in handlers)


def test_the_command_copies_into_the_public_bucket(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    from combo_api.catalog import __main__ as cli

    storage = MemoryStorage()
    monkeypatch.setattr(cli, "load_settings", lambda: None)
    monkeypatch.setattr(cli, "S3Storage", lambda settings: storage)
    monkeypatch.setattr(cli, "load_snapshot", small_snapshot)
    monkeypatch.setattr(images, "download", Fetches())
    assert cli.main(["copy-images", "--check"]) == 1
    assert capsys.readouterr().out.startswith("Missing 4\n")
    assert cli.main(["copy-images"]) == 0
    assert capsys.readouterr().out == "Copied 4, already there 0, failed 0\n"
    assert cli.main(["copy-images", "--check"]) == 0
