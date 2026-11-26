"""`deploy-code`: a merge deploy, the website of one commit on the data that is already live
(spec 026). Combos only change when the owner publishes from the Mac; this never adds, edits or
removes one, and never touches the images or the back office.

`build` makes and checks the site folder with no credential at all (CI runs it on a machine
without the token). `release` deploys a folder made by `build`, with the Pages token only, after
checking on Pages that the data is still the live data and that nothing was rolled back.
"""

import json
import re
import shutil
from collections.abc import Callable, Mapping
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from combo_publish import images, pages_api, site, wrangler
from combo_publish.app import CommandError, Deps, megabytes
from combo_publish.export import (
    COUNTS_FILE,
    KINDS,
    Export,
    catalog_finishes,
    check_files,
    data_path,
    encode,
)
from combo_publish.git import MAIN, Git
from combo_publish.headers import generate
from combo_publish.http import Http, HttpError
from combo_publish.manifest import MANIFEST_FILE, Manifest, ManifestError, parse, sha256
from combo_publish.pages_api import Deployment
from combo_publish.proc import ToolError
from combo_publish.schema import PublicSchema, schema_drift
from combo_publish.settings import DEFAULTS, NAME, SettingsError
from combo_publish.smoke import smoke_test

AT_ONCE = 8
PLAN = "plan.json"
SITE = "site"
TOKEN = "CLOUDFLARE_API_TOKEN"  # noqa: S105 (the variable's name, not a value)
ACCOUNT = "CLOUDFLARE_ACCOUNT_ID"
PROJECT = "PAGES_PROJECT"
# Nothing deployed may hold the back office's addresses, here as on the Mac.
LOCAL_URLS = (DEFAULTS["local_api_url"], DEFAULTS["local_image_base_url"])
OG_IMAGE = re.compile(
    r"""<meta\s[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']""", re.IGNORECASE
)
EMPTY = encode([])
CHANGED = "The live data changed during the download; run it again."
RACED_DATA = "A publish went live during this run; run it again."
RACED_LIVE = "A deployment went live during this run; run it again."
RACED_PRODUCTION = (
    "A publish went live during the production deploy; production was rolled back to it"
)

type Json = Any


class NeedsPublish(CommandError):
    """The merged code can't go live on the live data: a publish from the Mac is needed."""

    def __init__(self, reason: str) -> None:
        super().__init__(f"Needs a publish from the Mac: {reason}")


class Paused(CommandError):
    """Production is rolled back; a push doesn't deploy until a publish or a run by hand."""

    def __init__(self, reason: str) -> None:
        super().__init__(f"Paused: {reason}")


class NotDeployed(Exception):
    """Nothing to deploy, and nothing wrong (exit 0)."""


@dataclass(frozen=True)
class Target:
    account_id: str
    pages_project: str


def _project(deps: Deps) -> str:
    """The Pages project: from the environment in CI, else from the Mac's settings."""
    project = deps.environ.get(PROJECT) or ""
    if not project:
        try:
            project = deps.settings().pages_project
        except SettingsError as error:
            raise CommandError(f"Set {PROJECT}, or fill in deploy/publish.toml: {error}") from error
    if not NAME.fullmatch(project):
        raise CommandError(f"{PROJECT} must be lower-case letters, digits and hyphens")
    return deps.console.secret(project)


def _print(deps: Deps, line: str) -> None:
    deps.console.print(line)


# The live data


def _download_once(http: Http, base: str) -> tuple[Manifest, dict[str, bytes], list[str]]:
    try:
        answer = http.get(f"{base}/{MANIFEST_FILE}")
    except HttpError as error:
        raise CommandError(f"The live site did not answer: {error}") from error
    if answer.status != 200 or answer.content_type != "application/json":
        raise NeedsPublish("the live deployment has no data manifest.")
    try:
        manifest = parse(answer.body)
    except ManifestError as error:
        raise CommandError(f"The live {error}") from error

    def fetch(path: str) -> tuple[str, bytes | None, str]:
        try:
            got = http.get(f"{base}/{path}")
        except HttpError as error:
            return path, None, f"{path} did not download: {error}"
        if got.status != 200 or got.content_type != "application/json":
            kind = got.content_type or f"status {got.status}"
            return path, None, f"{path} is not served as JSON ({kind})"
        if sha256(got.body) != manifest.files[path]:
            return path, None, CHANGED
        return path, got.body, ""

    with ThreadPoolExecutor(AT_ONCE) as pool:
        results = list(pool.map(fetch, sorted(manifest.files)))
    files = {path: body for path, body, _ in results if body is not None}
    problems = sorted({problem for _, _, problem in results if problem})
    return manifest, files, problems


def download(http: Http, base: str) -> tuple[Manifest, dict[str, bytes]]:
    """The live manifest and every file it lists, each checked against its SHA-256. A publish
    landing mid-download makes a mismatch: start over once."""
    for attempt in range(2):
        manifest, files, problems = _download_once(http, base)
        if not problems:
            return manifest, files
        if attempt == 1:
            # A file that keeps changing is a publish in progress; anything else, say what.
            other = [problem for problem in problems if problem != CHANGED]
            raise CommandError(other[0] if other else CHANGED)
    raise AssertionError("unreachable")


def fit(files: dict[str, bytes], catalog: Json) -> tuple[dict[str, bytes], int, int]:
    """The live data files for this commit's catalog: a new finish gets `[]`, a finish that left
    the catalog is dropped if it has no combos. Every other file stays byte for byte. Returns
    the files, how many were added and how many dropped."""
    finishes = catalog_finishes(catalog)
    known = set(finishes)
    counts = json.loads(files[COUNTS_FILE])
    for kind in KINDS:
        for type_id, by_finish in counts.get(kind, {}).items():
            for finish_id, count in by_finish.items():
                if count and (kind, type_id, finish_id) not in known:
                    raise NeedsPublish(
                        f"{kind}/{type_id}/{finish_id} has combos but is not in this commit's "
                        "catalog."
                    )
    wanted = {data_path(*finish) for finish in finishes}
    fitted = {COUNTS_FILE: files[COUNTS_FILE]}
    added = 0
    for path in sorted(wanted):
        if path in files:
            fitted[path] = files[path]
        else:
            fitted[path] = EMPTY
            added += 1
    dropped = [path for path in files if path not in wanted and path != COUNTS_FILE]
    for path in dropped:
        if json.loads(files[path]) != []:
            raise NeedsPublish(f"{path} has combos but is not in this commit's catalog.")
    return fitted, added, len(dropped)


# Images, checked anonymously on the image host


def _missing(http: Http, urls: list[str]) -> list[str]:
    def absent(url: str) -> bool:
        try:
            return http.send("HEAD", url).status != 200
        except HttpError:
            return True

    with ThreadPoolExecutor(AT_ONCE) as pool:
        return [url for url, gone in zip(urls, pool.map(absent, urls), strict=True) if gone]


def preview_images(folder: Path, image_base: str) -> list[str]:
    """The link-preview images the built pages name on the image host (spec 022)."""
    found: set[str] = set()
    for page in folder.rglob("*.html"):
        found.update(
            url
            for url in OG_IMAGE.findall(page.read_text(errors="replace"))
            if url.startswith(image_base + "/")
        )
    return sorted(found)


# build


def build(deps: Deps, *, ref: str | None, out: Path | None, dry_run: bool) -> None:
    if TOKEN in deps.environ:
        raise CommandError(
            f"deploy-code build runs with no Cloudflare credential, but {TOKEN} is set"
        )
    if (out is None) == (not dry_run):
        raise CommandError("Give either --out <folder> or --dry-run")
    if out is not None and out.exists() and any(out.iterdir()):
        raise CommandError(f"{out} is not empty")
    project = _project(deps)
    git = Git(deps.tools, deps.repo)
    git.fetch()
    try:
        commit = git.commit(ref or MAIN)
    except ToolError as error:
        raise CommandError(f"No commit named {ref or MAIN}") from error
    _print(deps, f"Commit {commit[:12]} ({ref or MAIN}): {git.subject(commit)}")

    manifest, files = download(deps.http, f"https://{project}.pages.dev")
    counts = json.loads(files[COUNTS_FILE])
    combos = sum(sum(by_finish.values()) for by_finish in counts.get("gloves", {}).values())
    _print(
        deps,
        f"Live data: {combos} combos, data {manifest.data_version[:12]}, exported "
        f"{manifest.exported_at} with commit {manifest.exported_with[:12]}",
    )

    with deps.workdir() as work:
        source = work / "source"
        git.archive(commit, source)
        built = json.loads((source / "api" / "openapi.json").read_text())
        try:
            exported = json.loads(git.show(manifest.exported_with, "api/openapi.json"))
        except ToolError as error:
            raise CommandError(
                f"The live data's export commit {manifest.exported_with[:12]} is not in this "
                "repository"
            ) from error
        differ = schema_drift(exported, built)
        if differ:
            raise NeedsPublish(
                "the merged code expects public schemas the live data doesn't have "
                f"({', '.join(differ)})."
            )
        catalog = json.loads((source / "website/src/data/catalog.json").read_text())
        agents = json.loads((source / "website/src/data/agents.json").read_text())
        fitted, added, dropped = fit(files, catalog)
        _print(deps, f"Data files: {len(fitted) - added} kept, {added} added, {dropped} dropped")
        schema = PublicSchema(built)
        problems = check_files(fitted, catalog, schema, manifest.origins.image_base_url)
        if problems:
            raise CommandError(f"The live data does not pass this commit's checks: {problems[0]}")

        origins = manifest.origins
        dist = site.build_website(deps.tools, source, origins)
        folder = work / SITE
        data = {**fitted, MANIFEST_FILE: manifest.with_files(fitted).encode()}
        site.assemble(dist, folder, data, generate(origins))
        summary = site.check(folder, LOCAL_URLS, schema)

        base = origins.image_base_url
        pictures = sorted(images.picture_keys(catalog, agents))
        previews = preview_images(folder, base)
        missing_pictures = _missing(deps.http, [f"{base}/{key}" for key in pictures])
        missing_previews = _missing(deps.http, previews)
        _print(
            deps,
            f"Images: {len(pictures)} catalog copies and {len(previews)} preview images checked "
            "on the image host",
        )
        if missing_previews:
            raise NeedsPublish(
                f"{len(missing_previews)} preview images of this code are not uploaded."
            )
        warnings = []
        if missing_pictures:
            keys = ", ".join(url.removeprefix(base + "/") for url in missing_pictures[:3])
            more = ", ..." if len(missing_pictures) > 3 else ""
            warnings.append(
                f"{len(missing_pictures)} catalog copies are not on the image host yet; the site "
                f"shows the game's pictures until the next publish ({keys}{more})"
            )
        for warning in warnings:
            _print(deps, f"Warning: {warning}")
        _print(deps, f"Site: {summary.files} files ({megabytes(summary.size)}), checked")
        if out is None:
            _print(deps, "Dry run: nothing written.")
            return
        out.mkdir(parents=True, exist_ok=True)
        shutil.copytree(folder, out / SITE)
        plan = {"commit": commit, "manifest": json.loads(manifest.encode()), "warnings": warnings}
        (out / PLAN).write_text(json.dumps(plan, indent=2) + "\n")
        _print(deps, f"Built: {out}")


# release


def _target(deps: Deps) -> tuple[Target, str]:
    env = deps.environ
    token = env.get(TOKEN, "")
    account = env.get(ACCOUNT, "")
    if not token:
        raise CommandError(f"{TOKEN} is not set")
    if not re.fullmatch(r"[0-9a-f]{32}", account):
        raise CommandError(f"{ACCOUNT} must be the 32-character account id")
    deps.console.secret(token)
    deps.console.secret(account)
    project = env.get(PROJECT, "")
    if not NAME.fullmatch(project):
        raise CommandError(f"{PROJECT} must be lower-case letters, digits and hyphens")
    deps.console.secret(project)
    return Target(account, project), token


def _manifest_of(http: Http, deployment: Deployment) -> Manifest | None:
    try:
        answer = http.get(f"{deployment.url}/{MANIFEST_FILE}")
    except HttpError:
        return None
    if answer.status != 200 or answer.content_type != "application/json":
        return None
    try:
        return parse(answer.body)
    except ManifestError:
        return None


def _state(deps: Deps, target: Target, token: str) -> tuple[Deployment | None, Deployment | None]:
    """The live deployment L and the newest production deployment N."""
    live = pages_api.live_or_none(deps.http, target, token)
    newest = next(iter(pages_api.production(deps.http, target, token)), None)
    return live, newest or live


def _export_of(folder: Path) -> Export:
    """The folder's data, in the shape the smoke test checks."""
    data = folder / "data"
    files = {
        path.relative_to(folder).as_posix(): path.read_bytes()
        for path in sorted(data.rglob("*.json"))
        if path.relative_to(folder).as_posix() != MANIFEST_FILE
    }
    counts = json.loads(files[COUNTS_FILE])
    return Export(
        counts=counts,
        files=files,
        combos=sum(sum(by.values()) for by in counts.get("gloves", {}).values()),
        glove_finishes=sum(len(by) for by in counts.get("gloves", {}).values()),
        knife_finishes=sum(len(by) for by in counts.get("knives", {}).values()),
    )


def release(deps: Deps, out: Path, *, by_hand: bool) -> list[str]:
    """Deploys a built folder; returns the summary lines of a successful run."""
    target, token = _target(deps)
    folder = out / SITE
    try:
        plan = json.loads((out / PLAN).read_text())
    except (OSError, ValueError) as error:
        raise CommandError(f"{out} holds no {PLAN} from deploy-code build") from error
    commit = str(plan["commit"])
    git = Git(deps.tools, deps.repo)
    git.fetch()
    try:
        openapi = json.loads(git.show(commit, "api/openapi.json"))
    except ToolError as error:
        raise CommandError(f"The built commit {commit[:12]} is not in this repository") from error
    site.check(folder, LOCAL_URLS, PublicSchema(openapi))
    built = parse((folder / MANIFEST_FILE).read_bytes())

    live, newest = _state(deps, target, token)
    live_manifest = _manifest_of(deps.http, live) if live else None
    if live is None or newest is None or live_manifest is None:
        raise NeedsPublish("the live deployment has no data manifest.")
    if not live.commit or not git.is_ancestor(live.commit, MAIN):
        raise CommandError("The live commit is not on main.")
    if git.is_ancestor(commit, live.commit):
        raise NotDeployed(f"already live in {live.commit[:12]} (deployment {live.id})")
    newest_manifest = live_manifest if newest.id == live.id else _manifest_of(deps.http, newest)
    if newest_manifest is None or newest_manifest.data_version != live_manifest.data_version:
        raise NeedsPublish(f"production is rolled back to the data of {live_manifest.exported_at}.")
    if newest.id != live.id and not by_hand:
        raise Paused(
            f"production is rolled back to deployment {live.id}. Run this workflow by hand on "
            "main to deploy anyway, or publish from the Mac."
        )
    if built.data_version != live_manifest.data_version:
        raise CommandError(RACED_DATA)

    message = f"Combo Skin {commit[:12]} merge deploy, data {built.data_version[:12]}"
    with deps.workdir() as work:

        def deploy(branch: str) -> wrangler.Deployment:
            return wrangler.deploy(
                deps.tools,
                target,
                token,
                folder,
                branch=branch,
                commit=commit,
                message=message,
                work=work,
            )

        first = deploy(wrangler.PREVIEW_BRANCH)
        smoke_test(
            deps.http,
            built.origins,
            first.url,
            _export_of(folder),
            manifest=(folder / MANIFEST_FILE).read_bytes(),
            noindex=True,
            sleep=deps.sleep,
        )
        _print(deps, f"Preview: deployment {first.id} checked")
        again_live, again_newest = _state(deps, target, token)
        if (again_live and again_live.id) != live.id or (
            again_newest and again_newest.id
        ) != newest.id:
            raise CommandError(RACED_LIVE)
        ours = deploy(wrangler.PRODUCTION_BRANCH)

    lines = _after_production(deps, target, token, newest, ours.id)
    lines = [
        f"Live: commit {commit[:12]}, deployment {ours.id}, on the data of the publish of "
        f"{built.exported_at} (data {built.data_version[:12]})",
        *lines,
        *(f"Warning: {warning}" for warning in plan.get("warnings", [])),
        "Roll back: Pages dashboard > the project > Deployments > an earlier production "
        "deployment > Rollback to this deployment (deploy/README.md, Rollback)",
    ]
    for line in lines:
        _print(deps, line)
    return lines


def _after_production(
    deps: Deps, target: Target, token: str, newest: Deployment, ours: str
) -> list[str]:
    """A publish that landed between N and this deploy would be overwritten with older data:
    roll production back to it, and delete this deploy."""
    listed: list[Deployment] = []
    for attempt in range(5):
        listed = pages_api.production(deps.http, target, token)
        if any(one.id == ours for one in listed):
            break
        if attempt < 4:
            deps.sleep(3.0)
    own = next((one for one in listed if one.id == ours), None)
    if own is None:
        raise CommandError(f"Deployment {ours} is not in the Pages API's list; check production")
    between = [
        one for one in listed if newest.created < one.created < own.created and one.id != ours
    ]
    if between:
        restore = max(between, key=lambda one: one.created)
        pages_api.rollback(deps.http, target, token, restore.id)
        note = ""
        try:
            pages_api.delete(deps.http, target, token, ours)
        except pages_api.PagesError as error:
            note = f" Deployment {ours} could not be deleted ({error}); delete it in the dashboard."
        raise CommandError(f"{RACED_PRODUCTION} (deployment {restore.id}).{note}")
    later = [one for one in listed if one.created > own.created]
    if later:
        return [f"Since then, deployment {later[0].id} went live with newer data."]
    return []


def write_summary(environ: Mapping[str, str], lines: list[str]) -> None:
    """The run summary on GitHub Actions; nothing elsewhere."""
    path = environ.get("GITHUB_STEP_SUMMARY")
    if not path or not lines:
        return
    with Path(path).open("a") as handle:
        handle.write("\n\n".join(lines) + "\n")


def annotate(environ: Mapping[str, str], kind: str, line: str, emit: Callable[[str], None]) -> None:
    if environ.get("GITHUB_ACTIONS") == "true":
        emit(f"::{kind}::{line}")
