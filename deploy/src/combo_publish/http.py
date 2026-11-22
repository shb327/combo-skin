"""Plain HTTP GETs: the local API and bucket, the smoke test, and the Pages API for `status`.
Redirects are not followed."""

import urllib.error
import urllib.request
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Protocol

TIMEOUT_S = 30


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


class _NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args: object, **kwargs: object) -> None:
        return None


class UrlHttp:
    def __init__(self) -> None:
        self._opener = urllib.request.build_opener(_NoRedirects)

    def get(self, url: str, headers: Mapping[str, str] | None = None) -> Response:
        if not url.startswith(("http://", "https://")):
            raise HttpError(f"Refused a URL that is not http(s): {url}")
        request = urllib.request.Request(url, headers=dict(headers or {}))  # noqa: S310
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
