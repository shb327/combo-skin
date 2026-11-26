"""The smoke test of a deployment's own URL before production (spec 021, R9)."""

import json
import time
from collections.abc import Callable
from typing import Any

from combo_publish.export import COUNTS_FILE, Export
from combo_publish.headers import every_response
from combo_publish.http import Http, HttpError, Response
from combo_publish.manifest import MANIFEST_FILE
from combo_publish.settings import SiteOrigins

TRIES = 5
WAIT_S = 3.0


class SmokeError(Exception):
    """The deployment does not serve what was exported. Production is unchanged."""


def _get(http: Http, url: str, sleep: Callable[[float], None]) -> Response:
    last = ""
    for attempt in range(TRIES):
        try:
            answer = http.get(url)
            if answer.status == 200:
                return answer
            last = f"status {answer.status}"
        except HttpError as error:
            last = str(error)
        if attempt < TRIES - 1:
            sleep(WAIT_S)
    raise SmokeError(f"{url} failed: {last}")


def _first_screenshot(export: Export) -> tuple[str, str] | None:
    """A finish with combos and one of its screenshot URLs, if any."""
    for path, body in sorted(export.files.items()):
        if path == COUNTS_FILE:
            continue
        combos: list[Any] = json.loads(body)
        for combo in combos:
            screenshot = combo.get("screenshot")
            if screenshot and screenshot["images"]:
                return path, str(screenshot["images"][0]["url"])
    return None


def smoke_test(
    http: Http,
    settings: SiteOrigins,
    url: str,
    export: Export,
    *,
    manifest: bytes,
    noindex: bool,
    sleep: Callable[[float], None] = time.sleep,
) -> None:
    home = _get(http, f"{url}/", sleep)
    for name, value in every_response(settings).items():
        sent = home.headers.get(name.lower())
        if sent != value:
            raise SmokeError(f"/ sends {name}: {sent!r}, not {value!r}")
    # Pages adds its own noindex to previews, so the header may hold it twice.
    robots = [part.strip() for part in home.headers.get("x-robots-tag", "").split(",")]
    if noindex and "noindex" not in robots:
        raise SmokeError("/ sends no X-Robots-Tag: noindex on a pages.dev address")
    counts = _get(http, f"{url}/{COUNTS_FILE}", sleep)
    if counts.content_type != "application/json" or json.loads(counts.body) != export.counts:
        raise SmokeError("/data/combo-counts.json differs from the export")
    served_manifest = _get(http, f"{url}/{MANIFEST_FILE}", sleep)
    if served_manifest.content_type != "application/json" or json.loads(
        served_manifest.body
    ) != json.loads(manifest):
        raise SmokeError(f"/{MANIFEST_FILE} differs from what was deployed")
    sample = _first_screenshot(export)
    finish = sample[0] if sample else next(path for path in export.files if path != COUNTS_FILE)
    served = _get(http, f"{url}/{finish}", sleep)
    if served.content_type != "application/json" or json.loads(served.body) != json.loads(
        export.files[finish]
    ):
        raise SmokeError(f"/{finish} differs from the export")
    if sample:
        image = _get(http, sample[1], sleep)
        if image.content_type != "image/webp":
            raise SmokeError(f"{sample[1]} is not served as image/webp")
