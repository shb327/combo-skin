"""The site folder: the website built from one commit with the production settings, the data
files and `_headers`, checked against Pages' limits and our own rules before any upload
(spec 021, R4 to R6)."""

import json
import os
import re
import shutil
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from combo_publish.headers import rule_count
from combo_publish.manifest import MANIFEST_FILE, ManifestError, parse, verify
from combo_publish.proc import Tools, base_env, run
from combo_publish.schema import PublicSchema
from combo_publish.settings import SiteOrigins

MAX_FILES = 20_000
MAX_FILE_BYTES = 25 * 1024 * 1024
MAX_HEADER_RULES = 100
MAX_HEADER_LINE = 2_000
# A local address: localhost with a port (every local service has one), or any loopback IP.
# Libraries such as React Router parse relative URLs against a bare "http://localhost", which
# is not an address the site loads, so localhost without a port is allowed.
LOCAL = re.compile(rb"localhost:\d|127\.0\.0\.1|\[::1\]", re.IGNORECASE)
# An asset the build inlined: the CSP allows images and fonts only from real hosts, never data:.
# Only the build's code can inline one; pictures and fonts are not searched.
INLINED = re.compile(rb"data:(?:image|font)/[\w.+-]+", re.IGNORECASE)
CODE = (".js", ".mjs", ".css", ".html")


class SiteError(Exception):
    """The site cannot be deployed. Nothing has been uploaded."""


def build_env(settings: SiteOrigins) -> dict[str, str]:
    """The build's environment: the production settings and nothing from the caller beyond
    PATH, HOME, the locale and the temporary folder. No `.env` file is written."""
    return base_env(
        {
            "VITE_IMAGE_BASE_URL": settings.image_base_url,
            "VITE_VIEWER_ORIGIN": settings.viewer_origin,
        }
    )


def build_website(tools: Tools, source: Path, settings: SiteOrigins) -> Path:
    """`npm ci` and `npm run build` in the archived commit's `website/`; returns `dist/`."""
    website = source / "website"
    env = build_env(settings)
    run([tools.npm, "ci", "--no-audit", "--no-fund"], cwd=website, env=env, what="npm ci")
    run([tools.npm, "run", "build"], cwd=website, env=env, what="npm run build")
    dist = website / "dist"
    if not (dist / "index.html").is_file():
        raise SiteError("The website build wrote no dist/index.html")
    return dist


def assemble(dist: Path, site: Path, files: dict[str, bytes], headers: str) -> None:
    shutil.copytree(dist, site)
    for relative, body in files.items():
        target = site / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(body)
    (site / "_headers").write_text(headers)


@dataclass
class Summary:
    files: int
    size: int


def check(site: Path, local_urls: Sequence[str], schema: PublicSchema) -> Summary:
    """Pages' limits, valid data files that match the data manifest, no local URL anywhere in
    the site (`local_urls` are the back office's), and no asset inlined as a data: URL in its
    code."""
    paths = sorted(path for path in site.rglob("*") if path.is_file())
    if len(paths) > MAX_FILES:
        raise SiteError(f"The site has {len(paths)} files; Pages takes at most {MAX_FILES}")
    local = [url.encode() for url in local_urls]
    data: dict[str, bytes] = {}
    total = 0
    for path in paths:
        relative = path.relative_to(site).as_posix()
        size = os.path.getsize(path)
        total += size
        if size > MAX_FILE_BYTES:
            raise SiteError(f"{relative} is {size} bytes; Pages takes at most 25 MiB per file")
        body = path.read_bytes()
        found = LOCAL.search(body)
        hit = (
            found.group().decode()
            if found
            else next((needle.decode() for needle in local if needle in body), None)
        )
        if hit is not None:
            raise SiteError(f"{relative} holds a local URL ({hit})")
        inlined = INLINED.search(body) if relative.endswith(CODE) else None
        if inlined is not None:
            raise SiteError(
                f"{relative} holds an inlined data: URL ({inlined.group().decode()}), which the "
                "CSP blocks; the build must emit every asset as a file"
            )
        if relative.startswith("data/") and relative != MANIFEST_FILE:
            _check_data(relative, body, schema)
            data[relative] = body
    _check_manifest(site, data)
    headers = (site / "_headers").read_text()
    if rule_count(headers) > MAX_HEADER_RULES:
        raise SiteError(f"_headers has {rule_count(headers)} rules; Pages takes at most 100")
    longest = max((len(line) for line in headers.splitlines()), default=0)
    if longest > MAX_HEADER_LINE:
        raise SiteError(f"_headers has a line of {longest} characters; Pages takes at most 2,000")
    return Summary(len(paths), total)


def _check_manifest(site: Path, data: dict[str, bytes]) -> None:
    path = site / MANIFEST_FILE
    if not path.is_file():
        raise SiteError(f"The site has no {MANIFEST_FILE}")
    try:
        problems = verify(parse(path.read_bytes()), data)
    except ManifestError as error:
        raise SiteError(str(error)) from error
    if problems:
        raise SiteError(f"The data files do not match {MANIFEST_FILE}: {problems[0]}")


def _check_data(relative: str, body: bytes, schema: PublicSchema) -> None:
    try:
        value = json.loads(body)
    except ValueError as error:
        raise SiteError(f"{relative} is not valid JSON") from error
    if relative == "data/combo-counts.json":
        errors = schema.counts_errors(value)
    elif isinstance(value, list):
        errors = [error for combo in value for error in schema.combo_errors(combo)]
    else:
        errors = ["not a list of combos"]
    if errors:
        raise SiteError(f"{relative} is not in the public schema: {errors[0]}")
