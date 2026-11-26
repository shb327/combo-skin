"""`data/manifest.json`: what a deploy's data is (spec 026, R1). The publish writes it; a merge
deploy downloads the live one, checks every file against it, and keeps its data version,
export time, export commit and origins.

It holds no credential and nothing that isn't public already: the hosts are in the site's CSP
and data files, and the export commit is on main.
"""

import hashlib
import json
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from combo_publish.http import Http, HttpError
from combo_publish.settings import Origins, SettingsError, SiteOrigins, https_base, https_origin

MANIFEST_FILE = "data/manifest.json"
COUNTS_FILE = "data/combo-counts.json"
FORMAT = 1
SHA256 = re.compile(r"^[0-9a-f]{64}$")
COMMIT = re.compile(r"^[0-9a-f]{40}$")
DATA_FILE = re.compile(r"^data/(gloves|knives)/[a-z0-9][a-z0-9-]*/[a-z0-9][a-z0-9-]*\.json$")

type Json = Any


class ManifestError(Exception):
    """A manifest that is missing, malformed, or doesn't match its files."""


def sha256(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


@dataclass(frozen=True)
class Manifest:
    data_version: str
    exported_at: str
    exported_with: str
    origins: Origins
    # Every file under data/ but the manifest, and its SHA-256.
    files: dict[str, str] = field(default_factory=dict)

    def with_files(self, files: dict[str, bytes]) -> Manifest:
        """The same data version, export and origins, listing these files."""
        return Manifest(
            self.data_version,
            self.exported_at,
            self.exported_with,
            self.origins,
            {path: sha256(body) for path, body in sorted(files.items())},
        )

    def encode(self) -> bytes:
        value = {
            "format": FORMAT,
            "data_version": self.data_version,
            "exported_at": self.exported_at,
            "exported_with": self.exported_with,
            "origins": {
                "site": self.origins.site_origin,
                "images": self.origins.image_base_url,
                "viewer": self.origins.viewer_origin,
            },
            "files": dict(sorted(self.files.items())),
        }
        return (json.dumps(value, indent=2) + "\n").encode()


def make(
    files: dict[str, bytes],
    *,
    data_version: str,
    exported_at: str,
    exported_with: str,
    origins: SiteOrigins,
) -> Manifest:
    return Manifest(
        data_version,
        exported_at,
        exported_with,
        Origins(origins.site_origin, origins.image_base_url, origins.viewer_origin),
    ).with_files(files)


def parse(body: bytes) -> Manifest:
    try:
        raw: Json = json.loads(body)
    except ValueError as error:
        raise ManifestError("data/manifest.json is not valid JSON") from error
    if not isinstance(raw, dict) or raw.get("format") != FORMAT:
        raise ManifestError(f"data/manifest.json is not a format {FORMAT} manifest")
    version, at, commit = raw.get("data_version"), raw.get("exported_at"), raw.get("exported_with")
    if not isinstance(version, str) or not SHA256.fullmatch(version):
        raise ManifestError("data/manifest.json has no valid data_version")
    if not isinstance(commit, str) or not COMMIT.fullmatch(commit):
        raise ManifestError("data/manifest.json has no valid exported_with commit")
    try:
        datetime.fromisoformat(str(at))
    except ValueError as error:
        raise ManifestError("data/manifest.json has no valid exported_at") from error
    origins = raw.get("origins")
    if not isinstance(origins, dict):
        raise ManifestError("data/manifest.json has no origins")
    try:
        parsed = Origins(
            https_origin("origins.site", str(origins.get("site", ""))),
            https_base("origins.images", str(origins.get("images", ""))),
            https_origin("origins.viewer", str(origins.get("viewer", ""))),
        )
    except SettingsError as error:
        raise ManifestError(f"data/manifest.json: {error}") from error
    files = raw.get("files")
    if not isinstance(files, dict) or COUNTS_FILE not in files:
        raise ManifestError("data/manifest.json lists no data/combo-counts.json")
    for path, digest in files.items():
        if path != COUNTS_FILE and not DATA_FILE.fullmatch(str(path)):
            raise ManifestError(f"data/manifest.json lists a path that is not a data file: {path}")
        if not isinstance(digest, str) or not SHA256.fullmatch(digest):
            raise ManifestError(f"data/manifest.json has no valid SHA-256 for {path}")
    return Manifest(version, str(at), commit, parsed, dict(files))


def verify(manifest: Manifest, files: dict[str, bytes]) -> list[str]:
    """What differs between a manifest and the data files it describes."""
    problems = [
        f"{path} is not in the manifest" for path in sorted(files) if path not in manifest.files
    ]
    for path, digest in sorted(manifest.files.items()):
        body = files.get(path)
        if body is None:
            problems.append(f"{path} is missing")
        elif sha256(body) != digest:
            problems.append(f"{path} does not match its SHA-256")
    return problems


def fetch(http: Http, base: str) -> Manifest | None:
    """The manifest a deployment serves at `base`, or None if it has none (a deploy made before
    spec 026, or Pages' fallback page)."""
    try:
        answer = http.get(f"{base}/{MANIFEST_FILE}")
    except HttpError:
        return None
    if answer.status != 200 or answer.content_type != "application/json":
        return None
    try:
        return parse(answer.body)
    except ManifestError:
        return None
