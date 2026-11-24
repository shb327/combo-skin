"""The plain HTTP client: every request names the command and its version, since Cloudflare
answers 403 to Python's default user agent."""

import tomllib
import urllib.request
from collections.abc import Iterator
from pathlib import Path

import pytest

from combo_publish import http

# conftest refuses UrlHttp.get for every test; these tests give it a fake opener instead.
REAL_GET = http.UrlHttp.get
VERSION = tomllib.loads((Path(__file__).parents[1] / "pyproject.toml").read_text())["project"][
    "version"
]


class FakeAnswer:
    status = 200
    headers: dict[str, str] = {"Content-Type": "text/html"}  # noqa: RUF012

    def read(self) -> bytes:
        return b"ok"

    def __enter__(self) -> FakeAnswer:
        return self

    def __exit__(self, *args: object) -> None:
        return None


class FakeOpener:
    def __init__(self) -> None:
        self.requests: list[urllib.request.Request] = []

    def open(self, request: urllib.request.Request, timeout: float) -> FakeAnswer:
        self.requests.append(request)
        return FakeAnswer()


@pytest.fixture
def opener(monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeOpener]:
    monkeypatch.setattr(http.UrlHttp, "get", REAL_GET)
    yield FakeOpener()


def client(opener: FakeOpener) -> http.UrlHttp:
    return http.UrlHttp(opener=opener)


def test_every_request_names_the_command_and_its_version(opener: FakeOpener) -> None:
    answer = client(opener).get("https://dep1.combo-test.pages.dev/")
    assert answer.status == 200
    (request,) = opener.requests
    assert request.get_header("User-agent") == f"combo-publish/{VERSION}"


def test_the_callers_headers_are_kept_alongside_the_user_agent(opener: FakeOpener) -> None:
    client(opener).get("https://api.example.test/x", {"Authorization": "Bearer fake"})
    (request,) = opener.requests
    assert request.get_header("Authorization") == "Bearer fake"
    assert request.get_header("User-agent") == f"combo-publish/{VERSION}"


@pytest.mark.parametrize("name", ["User-Agent", "user-agent"])
def test_a_user_agent_from_the_caller_wins(opener: FakeOpener, name: str) -> None:
    client(opener).get("https://img.combo.skin/x.png", {name: "other/2.0"})
    (request,) = opener.requests
    assert request.get_header("User-agent") == "other/2.0"
    assert [key for key in request.header_items() if key[0].lower() == "user-agent"] == [
        ("User-agent", "other/2.0")
    ]
