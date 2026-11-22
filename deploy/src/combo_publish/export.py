"""The export: the published combos, read from the local API's public routes, as the site's
data files (spec 021, R2, R3 and R14)."""

import hashlib
import json
import re
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import quote

from combo_publish.http import Http, HttpError
from combo_publish.schema import PublicSchema
from combo_publish.settings import Settings

KINDS = ("gloves", "knives")
GAME_IMAGE_PREFIX = "https://community.akamai.steamstatic.com/"
SLUG = re.compile(r"^[a-z0-9][a-z0-9-]*$")
URL = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*://")
SCREENSHOT_KEY = re.compile(r"^combos/[^/]+/[^/]+/\d+\.webp$")
CHANGED = "Combos changed while publishing; run it again."
COUNTS_FILE = "data/combo-counts.json"

type Json = Any


class ExportError(Exception):
    """The export cannot be published. Nothing has been uploaded or deployed."""


@dataclass
class Export:
    counts: Json
    # Each data file's path in the deploy (without a leading slash) and its bytes.
    files: dict[str, bytes]
    combos: int
    glove_finishes: int
    knife_finishes: int
    # Keys in the public bucket that the data references: screenshots and catalog copies.
    screenshot_keys: set[str] = field(default_factory=set)
    picture_keys: set[str] = field(default_factory=set)

    @property
    def digests(self) -> dict[str, str]:
        return {path: hashlib.sha256(body).hexdigest() for path, body in self.files.items()}

    @property
    def sha256(self) -> str:
        whole = hashlib.sha256()
        for path, digest in sorted(self.digests.items()):
            whole.update(f"{path}\0{digest}\n".encode())
        return whole.hexdigest()


def catalog_finishes(catalog: Json) -> list[tuple[str, str, str]]:
    """Every (kind, type, finish) in a built `catalog.json`."""
    found = []
    for kind in KINDS:
        for item_type in catalog[kind]:
            for finish in item_type["finishes"]:
                type_id, finish_id = item_type["id"], finish["id"]
                if not SLUG.fullmatch(type_id) or not SLUG.fullmatch(finish_id):
                    raise ExportError(
                        f"The catalog has a slug that is not a path: {type_id}/{finish_id}"
                    )
                found.append((kind, type_id, finish_id))
    return found


def data_path(kind: str, type_id: str, finish_id: str) -> str:
    return f"data/{kind}/{type_id}/{finish_id}.json"


def encode(value: Json) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()


class _Rewriter:
    """Moves image URLs from the local bucket to the public image host, and refuses any URL
    that is neither there nor, for the fallback picture, on the game's host."""

    def __init__(self, settings: Settings) -> None:
        self._local = settings.local_image_base_url + "/"
        self._public = settings.image_base_url + "/"
        self.screenshots: set[str] = set()
        self.pictures: set[str] = set()

    def __call__(self, value: Json, where: str, name: str = "") -> Json:
        if isinstance(value, dict):
            return {key: self(item, f"{where}.{key}", key) for key, item in value.items()}
        if isinstance(value, list):
            return [self(item, f"{where}[{index}]", name) for index, item in enumerate(value)]
        if isinstance(value, str) and URL.match(value):
            if value.startswith(self._local):
                key = value.removeprefix(self._local)
                (self.screenshots if SCREENSHOT_KEY.match(key) else self.pictures).add(key)
                return self._public + key
            if name == "fallback_image_url" and value.startswith(GAME_IMAGE_PREFIX):
                return value
            raise ExportError(f"{where} is a URL off the local image base: {value}")
        return value


def _get_json(http: Http, url: str) -> tuple[int, Json]:
    try:
        answer = http.get(url)
    except HttpError as error:
        raise ExportError(f"The local API did not answer: {error}") from error
    if answer.status == 404:
        return 404, None
    if answer.status != 200 or answer.content_type != "application/json":
        raise ExportError(f"The local API answered {url} with {answer.status}")
    return 200, json.loads(answer.body)


def _once(http: Http, settings: Settings, catalog: Json, schema: PublicSchema) -> Export | None:
    """One export, or None when the counts and lists disagree."""
    api = settings.local_api_url
    status, counts = _get_json(http, f"{api}/combo-counts")
    if status != 200:
        raise ExportError("The local API has no /combo-counts route")
    errors = schema.counts_errors(counts)
    if errors:
        raise ExportError("The combo counts are not in the public schema: " + "; ".join(errors))
    finishes = catalog_finishes(catalog)
    known = set(finishes)
    for kind in KINDS:
        for type_id, by_finish in counts[kind].items():
            for finish_id in by_finish:
                if (kind, type_id, finish_id) not in known:
                    raise ExportError(
                        f"{kind}/{type_id}/{finish_id} has combos but is not in the built "
                        "commit's catalog"
                    )
    rewrite = _Rewriter(settings)
    files: dict[str, bytes] = {COUNTS_FILE: encode(counts)}
    consistent = True
    combos = 0
    for kind, type_id, finish_id in finishes:
        expected = counts[kind].get(type_id, {}).get(finish_id, 0)
        listed: Json = []
        if expected:
            path = f"/{kind}/{quote(type_id)}/{quote(finish_id)}/combos"
            status, listed = _get_json(http, api + path)
            if status != 200 or not isinstance(listed, list):
                consistent = False
                listed = []
            for index, combo in enumerate(listed):
                where = f"{kind}/{type_id}/{finish_id}[{index}]"
                problems = schema.combo_errors(combo)
                if problems:
                    raise ExportError(
                        f"{where} is not in the public schema: " + "; ".join(problems)
                    )
            listed = rewrite(listed, f"{kind}/{type_id}/{finish_id}")
            if len(listed) != expected:
                consistent = False
            if kind == "gloves":
                combos += len(listed)
        files[data_path(kind, type_id, finish_id)] = encode(listed)
    knife_side = sum(sum(by_finish.values()) for by_finish in counts["knives"].values())
    glove_side = sum(sum(by_finish.values()) for by_finish in counts["gloves"].values())
    if not consistent or knife_side != glove_side:
        return None
    return Export(
        counts=counts,
        files=files,
        combos=combos,
        glove_finishes=sum(len(by_finish) for by_finish in counts["gloves"].values()),
        knife_finishes=sum(len(by_finish) for by_finish in counts["knives"].values()),
        screenshot_keys=rewrite.screenshots,
        picture_keys=rewrite.pictures,
    )


def export(http: Http, settings: Settings, catalog: Json, openapi: Json) -> Export:
    """Exports the published combos; a second try after a mismatch, then ExportError."""
    schema = PublicSchema(openapi)
    for _ in range(2):
        result = _once(http, settings, catalog, schema)
        if result is not None:
            return result
    raise ExportError(CHANGED)
