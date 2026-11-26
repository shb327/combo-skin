"""Plain HTTP requests: the local API and bucket, the smoke test, the image host, and the
Pages API. Redirects are not followed."""

import urllib.error
import urllib.request
from collections.abc import Mapping
from dataclasses import dataclass, field
from importlib.metadata import version
from typing import Any, Protocol

TIMEOUT_S = 30
# Cloudflare answers 403 to Python's default user agent, so every request names this command.
USER_AGENT = f"combo-publish/{version('combo-publish')}"


class HttpError(Exception):
    """No response at all: refused, timed out, or not HTTP."""


@dataclass(frozen=True)
class Response:
    status: int
    body: bytes
    # Lower-case header names.
    headers: Mapping[str, str] = field(default_factory=dict)

    @property
    def content_type(self) -> str:
        return self.headers.get("content-type", "").split(";")[0].strip().lower()


class Http(Protocol):
    def get(self, url: str, headers: Mapping[str, str] | None = None) -> Response: ...

    def send(self, method: str, url: str, headers: Mapping[str, str] | None = None) -> Response:
        """A request with no body: HEAD for the image host, POST and DELETE for the Pages
        API."""
        ...


class _NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args: object, **kwargs: object) -> None:
        return None


class Opener(Protocol):
    def open(self, request: urllib.request.Request, /, *, timeout: float) -> Any: ...


class UrlHttp:
    def __init__(self, opener: Opener | None = None) -> None:
        self._opener: Opener = opener or urllib.request.build_opener(_NoRedirects)

    def get(self, url: str, headers: Mapping[str, str] | None = None) -> Response:
        return self.send("GET", url, headers)

    def send(self, method: str, url: str, headers: Mapping[str, str] | None = None) -> Response:
        if not url.startswith(("http://", "https://")):
            raise HttpError(f"Refused a URL that is not http(s): {url}")
        given = dict(headers or {})
        if not any(name.lower() == "user-agent" for name in given):
            given["User-Agent"] = USER_AGENT
        request = urllib.request.Request(url, headers=given, method=method)  # noqa: S310
        try:
            with self._opener.open(request, timeout=TIMEOUT_S) as answer:
                return Response(answer.status, answer.read(), _headers(answer.headers.items()))
        except urllib.error.HTTPError as error:
            return Response(error.code, error.read(), _headers(error.headers.items()))
        except (urllib.error.URLError, OSError, ValueError) as error:
            raise HttpError(f"No answer from {url.split('?')[0]}: {error}") from error


def _headers(items: object) -> dict[str, str]:
    found: dict[str, str] = {}
    for name, value in items:  # type: ignore[attr-defined]
        key = str(name).lower()
        found[key] = f"{found[key]}, {value}" if key in found else str(value)
    return found
