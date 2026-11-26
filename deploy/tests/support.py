"""Fakes for the publish command's tests: the local API and bucket, the R2 buckets, the
Keychain, and `wrangler`, `npm` and `docker` as small programs that record what they were
given. `git` is the real one, on a temporary repository with its own origin."""

import hashlib
import io
import json
import mimetypes
import shutil
import subprocess
import sys
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from combo_publish.app import Deps
from combo_publish.bucket import ObjectInfo
from combo_publish.cli import main
from combo_publish.console import Console
from combo_publish.headers import every_response
from combo_publish.http import HttpError, Response
from combo_publish.keychain import MissingCredential, R2Credentials
from combo_publish.proc import Tools
from combo_publish.settings import Settings, load

REAL_OPENAPI = Path(__file__).parents[2] / "api" / "openapi.json"
WRANGLER_PIN = "4.156.2"
ACCOUNT = "0123456789abcdef0123456789abcdef"
PAGES_TOKEN = "fake-pages-token-value-1234567890"
IMAGES_KEY = "fakeimageskeyid0000"
IMAGES_SECRET = "fake-images-secret-value-abcdefghij"
BACKUP_KEY = "fakebackupkeyid0000"
BACKUP_SECRET = "fake-backup-secret-value-klmnopqrst"
SECRETS = (PAGES_TOKEN, IMAGES_KEY, IMAGES_SECRET, BACKUP_KEY, BACKUP_SECRET)
LOCAL_API = "http://127.0.0.1:8000"
LOCAL_IMAGES = "http://localhost:9000/local-images"
GAME = "https://community.akamai.steamstatic.com/economy/image"
TODAY = date(2026, 11, 22)

type Json = Any


def key_of(name: str) -> str:
    return f"catalog/{hashlib.md5(name.encode(), usedforsecurity=False).hexdigest()}.png"


def catalog(gloves: Mapping[str, list[str]], knives: Mapping[str, list[str]]) -> Json:
    def types(kind: str, by_type: Mapping[str, list[str]]) -> list[Json]:
        return [
            {
                "id": type_id,
                "name": type_id.title(),
                "finishes": [
                    {
                        "id": finish_id,
                        "name": finish_id.title(),
                        "image": f"{GAME}/{type_id}-{finish_id}",
                        "image_key": key_of(f"{kind}/{type_id}/{finish_id}"),
                    }
                    for finish_id in finishes
                ],
            }
            for type_id, finishes in by_type.items()
        ]

    return {
        "source": {"commit": "0" * 40},
        "gloves": types("gloves", gloves),
        "knives": types("knives", knives),
    }


SMALL_CATALOG = catalog(
    {"specialist": ["mogul", "crimson-kimono"], "sport": ["vice"]},
    {"karambit": ["doppler-ruby", "fade"], "bayonet": ["lore"]},
)


def full_catalog() -> Json:
    """670 finishes, as today's: 8 glove types with 94 finishes, 20 knife types with 576."""
    gloves: dict[str, list[str]] = {f"glove-{index}": [] for index in range(8)}
    knives: dict[str, list[str]] = {f"knife-{index}": [] for index in range(20)}
    for number in range(94):
        gloves[f"glove-{number % 8}"].append(f"finish-{number}")
    for number in range(576):
        knives[f"knife-{number % 20}"].append(f"finish-{number}")
    return catalog(gloves, knives)


AGENTS: Json = {
    "source": {"commit": "0" * 40},
    "agents": [
        {
            "def_index": 4613,
            "name": "Agent",
            "team": "t",
            "image": f"{GAME}/agent",
            "image_key": key_of("agent/4613"),
        }
    ],
}


def item(kind: str, type_id: str, finish_id: str, **overrides: Any) -> Json:
    return {
        "type_slug": type_id,
        "type_name": type_id.title(),
        "finish_slug": finish_id,
        "display_name": finish_id.title(),
        "def_index": 500,
        "paint_index": 1,
        "image_url": f"{LOCAL_IMAGES}/{key_of(f'{kind}/{type_id}/{finish_id}')}",
        "fallback_image_url": f"{GAME}/{type_id}-{finish_id}",
        "rarity": {"code": "rarity_ancient", "name": "Covert", "color": "#eb4b4b"},
        "active": True,
        "float_min": 0.0,
        "float_max": 1.0,
        "float_from": None,
        "float_to": None,
        "seeds": [],
        "pattern_group": None,
        **overrides,
    }


def screenshot_keys(combo_id: str, version: str = "v1") -> list[str]:
    return [f"combos/{combo_id}/{version}/{width}.webp" for width in (640, 1280, 1920)]


def combo(
    combo_id: str,
    glove: tuple[str, str],
    knife: tuple[str, str],
    *,
    rating: float = 9.0,
    screenshot: bool = True,
    version: str = "v1",
) -> Json:
    return {
        "id": combo_id,
        "rating": rating,
        "description": None,
        "glove": item("gloves", *glove),
        "knife": item("knives", *knife),
        "screenshot": {
            "width": 1920,
            "height": 1080,
            "images": [
                {
                    "url": f"{LOCAL_IMAGES}/{key}",
                    "width": width,
                    "height": width * 9 // 16,
                    "type": "image/webp",
                }
                for key, width in zip(
                    screenshot_keys(combo_id, version), (640, 1280, 1920), strict=True
                )
            ],
        }
        if screenshot
        else None,
    }


class FakeApi:
    """The local API's public routes, from a list of combos. `answers` replaces the combos
    route of one finish for the next requests, in order (to simulate edits mid-publish)."""

    def __init__(self, combos: list[Json] | None = None) -> None:
        self.combos: list[Json] = combos or []
        self.openapi: Json = json.loads(REAL_OPENAPI.read_text())
        self.answers: dict[str, list[Json]] = {}
        self.requests: list[str] = []

    def counts(self) -> Json:
        counts: Json = {"gloves": {}, "knives": {}}
        for one in self.combos:
            for kind, side in (("gloves", "glove"), ("knives", "knife")):
                by_type = counts[kind].setdefault(one[side]["type_slug"], {})
                finish = one[side]["finish_slug"]
                by_type[finish] = by_type.get(finish, 0) + 1
        return counts

    def finish(self, kind: str, type_id: str, finish_id: str) -> list[Json]:
        side = "glove" if kind == "gloves" else "knife"
        return [
            one
            for one in self.combos
            if (one[side]["type_slug"], one[side]["finish_slug"]) == (type_id, finish_id)
        ]

    def get(self, path: str) -> Response:
        self.requests.append(path)
        if path == "/combo-counts":
            return json_response(self.counts())
        if path == "/openapi.json":
            return json_response(self.openapi)
        parts = path.strip("/").split("/")
        if len(parts) == 4 and parts[0] in ("gloves", "knives") and parts[3] == "combos":
            queued = self.answers.get(path)
            if queued:
                return json_response(queued.pop(0))
            return json_response(self.finish(parts[0], parts[1], parts[2]))
        return json_response({"detail": "Not Found"}, 404)


def json_response(body: Json, status: int = 200) -> Response:
    return Response(status, json.dumps(body).encode(), {"content-type": "application/json"})


class FakeBucket:
    def __init__(self) -> None:
        self.store: dict[str, tuple[bytes, str, str | None]] = {}
        self.puts: list[str] = []
        self.deleted: list[str] = []
        self.bad_etag: set[str] = set()
        self.fail_put = False

    def objects(self, prefix: str = "") -> dict[str, ObjectInfo]:
        return {
            key: ObjectInfo(len(body), hashlib.md5(body, usedforsecurity=False).hexdigest())
            for key, (body, _, _) in self.store.items()
            if key.startswith(prefix)
        }

    def put(self, key: str, body: bytes, content_type: str, cache_control: str | None) -> str:
        if self.fail_put:
            raise RuntimeError("the bucket refused the upload")
        self.puts.append(key)
        self.store[key] = (body, content_type, cache_control)
        if key in self.bad_etag:
            return "0" * 32
        return hashlib.md5(body, usedforsecurity=False).hexdigest()

    def get(self, key: str) -> bytes:
        return self.store[key][0]

    def delete(self, keys: list[str]) -> None:
        for key in keys:
            self.deleted.append(key)
            self.store.pop(key, None)


@dataclass
class FakeBuckets:
    buckets: dict[str, FakeBucket] = field(default_factory=dict)
    opened: list[tuple[str, str]] = field(default_factory=list)

    def __call__(self, account_id: str, bucket: str, credentials: R2Credentials) -> FakeBucket:
        self.opened.append((account_id, bucket))
        return self.buckets.setdefault(bucket, FakeBucket())


class FakeKeychain:
    def __init__(self, values: dict[str, str]) -> None:
        self.values = values

    def has(self, service: str) -> bool:
        return service in self.values

    def read(self, service: str) -> str:
        if service not in self.values:
            raise MissingCredential(service)
        return self.values[service]


PYTHON = sys.executable

WRANGLER = r"""
import json, os, shutil, sys
from pathlib import Path
ROOT = Path(__ROOT__)
config = json.loads((ROOT / "config.json").read_text())
log = ROOT / "wrangler.ndjson"
with log.open("a") as handle:
    entry = {"argv": sys.argv[1:], "env": dict(os.environ), "cwd": os.getcwd()}
    handle.write(json.dumps(entry) + "\n")
args = sys.argv[1:]
if args == ["--version"]:
    print(" wrangler " + config.get("version", "__PIN__")); sys.exit(0)
if args == ["whoami"]:
    print("Account | " + config.get("account", "")); sys.exit(0)
if args[:2] == ["pages", "deploy"]:
    branch = args[args.index("--branch") + 1]
    if branch in config.get("fail", []):
        print("Deployment failed!", file=sys.stderr); sys.exit(1)
    number = len(list((ROOT / "deployments").glob("*"))) + 1
    deployment = f"dep{number}"
    shutil.copytree(args[2], ROOT / "deployments" / deployment)
    (ROOT / "meta").mkdir(exist_ok=True)
    (ROOT / "meta" / f"{deployment}.json").write_text(json.dumps({
        "number": number, "branch": branch,
        "commit": args[args.index("--commit-hash") + 1],
        "message": args[args.index("--commit-message") + 1]}))
    project = args[args.index("--project-name") + 1]
    url = f"https://{deployment}.{project}.pages.dev"
    alias = f"https://{branch}.{project}.pages.dev" if branch != "main" else None
    entry = {"type": "pages-deploy-detailed", "version": 1, "pages_project": project,
             "deployment_id": deployment, "url": url, "alias": alias,
             "environment": "production" if branch == "main" else "preview"}
    with open(os.environ["WRANGLER_OUTPUT_FILE_PATH"], "a") as out:
        out.write(json.dumps({"type": "wrangler-session"}) + "\n" + json.dumps(entry) + "\n")
    print("Deployment complete! Take a peek over at " + url); sys.exit(0)
sys.exit(2)
"""

NPM = r"""
import json, os, sys
from pathlib import Path
ROOT = Path(__ROOT__)
cwd = Path.cwd()
with (ROOT / "npm.ndjson").open("a") as handle:
    source = cwd.parent
    files = sorted(str(p.relative_to(source)) for p in source.rglob("*") if p.is_file())
    catalog_path = cwd / "src" / "data" / "catalog.json"
    catalog = catalog_path.read_text() if catalog_path.is_file() else None
    handle.write(json.dumps({"argv": sys.argv[1:], "env": dict(os.environ), "cwd": str(cwd),
                             "dotenv": sorted(str(p) for p in source.rglob(".env*")),
                             "files": files, "catalog": catalog}) + "\n")
if sys.argv[1:] == ["run", "build"]:
    dist = cwd / "dist"
    (dist / "assets").mkdir(parents=True, exist_ok=True)
    page = '<!doctype html><script type="module" src="/assets/index-a1.js"></script>'
    (dist / "index.html").write_text(page)
    images = os.environ.get("VITE_IMAGE_BASE_URL", "http://localhost:9000/local-images")
    viewer = os.environ.get("VITE_VIEWER_ORIGIN", "http://127.0.0.1:5321")
    body = f"const images={json.dumps(images)};const viewer={json.dumps(viewer)};"
    body += (ROOT / "extra.js").read_text() if (ROOT / "extra.js").exists() else ""
    (dist / "assets" / "index-a1.js").write_text(body)
print("ok")
"""

DOCKER = r"""
import json, sys
from pathlib import Path
ROOT = Path(__ROOT__)
config = json.loads((ROOT / "config.json").read_text())
args = sys.argv[1:]
with (ROOT / "docker.ndjson").open("a") as handle:
    handle.write(json.dumps({"argv": args}) + "\n")
if args[0] == "ps":
    print("cid0"); sys.exit(0)
if args[:3] == ["exec", "cid0", "sh"]:
    sys.stdout.buffer.write(b"PGDMP fake dump " + config.get("dump", "1").encode()); sys.exit(0)
if args[:4] == ["exec", "-i", "cid0", "pg_restore"]:
    data = sys.stdin.buffer.read()
    if config.get("restore_fails") or not data.startswith(b"PGDMP"):
        print("pg_restore: error: not a valid archive", file=sys.stderr)
        sys.exit(1)
    print(";\n; Archive created\n;"); sys.exit(0)
sys.exit(2)
"""


def make_tool(folder: Path, name: str, body: str, root: Path) -> str:
    path = folder / name
    source = body.replace("__ROOT__", repr(str(root))).replace("__PIN__", WRANGLER_PIN)
    path.write_text(f"#!{PYTHON}\n{source}")
    path.chmod(0o755)
    return str(path)


def git(repo: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(repo), *args], check=True, capture_output=True, text=True
    ).stdout.strip()


def make_repo(root: Path, catalog_json: Json) -> tuple[Path, Path]:
    """A repository with the files the command reads, pushed to its own bare origin."""
    origin = root / "origin.git"
    repo = root / "checkout"
    subprocess.run(["git", "init", "-q", "--bare", "-b", "main", str(origin)], check=True)
    subprocess.run(["git", "init", "-q", "-b", "main", str(repo)], check=True)
    git(repo, "config", "user.email", "test@example.com")
    git(repo, "config", "user.name", "Test")
    git(repo, "config", "commit.gpgsign", "false")
    git(repo, "config", "core.hooksPath", "/dev/null")
    files = {
        "api/openapi.json": REAL_OPENAPI.read_text(),
        "website/src/data/catalog.json": json.dumps(catalog_json),
        "website/src/data/agents.json": json.dumps(AGENTS),
        "website/package.json": '{"name": "combo-skin-website"}\n',
        "deploy/package.json": json.dumps({"devDependencies": {"wrangler": WRANGLER_PIN}}),
        "README.md": "test\n",
    }
    for relative, text in files.items():
        (repo / relative).parent.mkdir(parents=True, exist_ok=True)
        (repo / relative).write_text(text)
    git(repo, "add", ".")
    git(repo, "commit", "-q", "-m", "First")
    git(repo, "remote", "add", "origin", str(origin))
    git(repo, "push", "-q", "origin", "main")
    git(repo, "fetch", "-q", "origin")
    return repo, origin


SETTINGS = """\
account_id = "{account}"
pages_project = "combo-test"
site_origin = "https://combo.skin"
image_base_url = "https://img.combo.skin"
viewer_origin = "https://view.combo.skin"
public_bucket = "images-test"
backup_bucket = "backups-test"
state_dir = "{state}"
backup_dir = "{backups}"
"""


class FakeHttp:
    """Answers every URL the command fetches: the local API and bucket, pages.dev deployments
    from what the fake wrangler deployed, the public image host from the fake bucket, and the
    Pages API. `override` replaces any answer; `drop_header` removes one from deployments."""

    def __init__(self, world: World) -> None:
        self.world = world
        self.override: dict[str, Response | Callable[[], Response]] = {}
        self.drop_header: str | None = None
        self.requests: list[tuple[str, dict[str, str]]] = []
        # Called with each URL after it is answered, to change the world mid-run.
        self.after: list[Callable[[str], None]] = []
        self.sent: list[tuple[str, str]] = []

    def get(self, url: str, headers: Mapping[str, str] | None = None) -> Response:
        answer = self._get(url, headers)
        for hook in list(self.after):
            hook(url)
        return answer

    def send(self, method: str, url: str, headers: Mapping[str, str] | None = None) -> Response:
        self.requests.append((f"{method} {url}", dict(headers or {})))
        self.sent.append((method, url))
        if method == "HEAD":
            answer = self._get(url, headers)
            return Response(answer.status, b"", answer.headers)
        return self.world.pages_send(method, url)

    def _get(self, url: str, headers: Mapping[str, str] | None = None) -> Response:
        self.requests.append((url, dict(headers or {})))
        if url in self.override:
            answer = self.override[url]
            return answer() if callable(answer) else answer
        parts = urlsplit(url)
        if url.startswith(LOCAL_API):
            if self.world.api_down:
                raise HttpError("connection refused")
            return self.world.api.get(parts.path)
        if url.startswith(LOCAL_IMAGES + "/"):
            key = url.removeprefix(LOCAL_IMAGES + "/")
            body = self.world.local_images.get(key)
            if body is None:
                return Response(404, b"", {})
            kind = "image/webp" if key.endswith(".webp") else "image/png"
            return Response(200, body, {"content-type": kind})
        if parts.hostname and parts.hostname.endswith(".pages.dev"):
            return self._deployment(parts.hostname.split(".")[0], parts.path)
        if url.startswith("https://img.combo.skin/"):
            store = self.world.buckets.buckets.get("images-test")
            key = url.removeprefix("https://img.combo.skin/")
            if store is None or key not in store.store:
                return Response(404, b"", {})
            body, kind, _ = store.store[key]
            return Response(200, body, {"content-type": kind})
        if url.startswith("https://api.cloudflare.com/"):
            return self.world.pages_get(url)
        raise HttpError(f"no fake for {url}")

    def _deployment(self, deployment: str, path: str) -> Response:
        if deployment == self.world.settings.pages_project:
            # The production address serves the live deployment.
            live = self.world.canonical_id()
            if live is None:
                return Response(404, b"", {})
            deployment = live
        folder = self.world.root / "deployments" / deployment
        target = folder / (path.lstrip("/") or "index.html")
        if path == "/":
            target = folder / "index.html"
        headers = {
            name.lower(): value for name, value in every_response(self.world.settings).items()
        }
        headers["x-robots-tag"] = "noindex"
        if self.drop_header:
            headers.pop(self.drop_header.lower(), None)
        if not target.is_file():
            target = folder / "index.html"
        kind = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        return Response(200, target.read_bytes(), {**headers, "content-type": kind})


@dataclass
class Result:
    code: int
    out: str
    err: str


class World:
    """Everything a test needs: a repository with an origin, settings, fakes, and `run`."""

    def __init__(self, root: Path, catalog_json: Json = SMALL_CATALOG) -> None:
        self.root = root
        (root / "deployments").mkdir()
        (root / "bin").mkdir()
        self.config: Json = {"account": ACCOUNT}
        self.write_config()
        self.repo, self.origin = make_repo(root, catalog_json)
        self.settings_path = root / "publish.toml"
        self.settings_path.write_text(
            SETTINGS.format(account=ACCOUNT, state=root / "state", backups=root / "backups")
        )
        self.settings: Settings = load(self.settings_path)
        self.api = FakeApi()
        self.api_down = False
        self.local_images: dict[str, bytes] = {}
        self.buckets = FakeBuckets()
        self.keychain = FakeKeychain(
            {
                "combo-skin-pages": PAGES_TOKEN,
                "combo-skin-r2-images": f"{IMAGES_KEY}:{IMAGES_SECRET}",
                "combo-skin-r2-backup": f"{BACKUP_KEY}:{BACKUP_SECRET}",
            }
        )
        self.http = FakeHttp(self)
        # The deployment a dashboard rollback made live; None means the newest production one.
        self.rolled_back_to: str | None = None
        self.today = TODAY
        self.now = datetime(2026, 11, 22, 3, 0, 0)
        self.temp = root / "tmp"
        self.temp.mkdir()
        self.tools = Tools(
            git="git",
            npm=make_tool(root / "bin", "npm", NPM, root),
            node=PYTHON,
            wrangler=make_tool(root / "bin", "wrangler", WRANGLER, root),
            docker=make_tool(root / "bin", "docker", DOCKER, root),
        )
        self.pictures(catalog_json)

    def write_config(self) -> None:
        (self.root / "config.json").write_text(json.dumps(self.config))

    def pictures(self, catalog_json: Json) -> None:
        """Local copies of every catalog and agent picture."""
        for kind in ("gloves", "knives"):
            for item_type in catalog_json[kind]:
                for finish in item_type["finishes"]:
                    self.local_images[finish["image_key"]] = f"png {finish['image_key']}".encode()
        for agent in AGENTS["agents"]:
            self.local_images[agent["image_key"]] = b"png agent"

    def add(self, *combos: Json) -> None:
        """Published combos, with their screenshots in the local bucket."""
        for one in combos:
            self.api.combos.append(one)
            for image in (one["screenshot"] or {"images": []})["images"]:
                key = image["url"].removeprefix(LOCAL_IMAGES + "/")
                self.local_images[key] = f"webp {key}".encode()

    @property
    def public(self) -> FakeBucket:
        return self.buckets.buckets.setdefault("images-test", FakeBucket())

    def deps(self, out: io.StringIO, err: io.StringIO) -> Deps:
        return Deps(
            repo=self.repo,
            settings_path=self.settings_path,
            http=self.http,
            keychain=self.keychain,
            buckets=self.buckets,
            tools=self.tools,
            console=Console(out, err),
            today=lambda: self.today,
            now=lambda: datetime.combine(self.today, self.now.time()),
            sleep=lambda _: None,
            temp_root=self.temp,
        )

    def run(self, *argv: str) -> Result:
        out, err = io.StringIO(), io.StringIO()
        code = main(list(argv), self.deps(out, err))
        return Result(code, out.getvalue(), err.getvalue())

    def calls(self, tool: str) -> list[Json]:
        path = self.root / f"{tool}.ndjson"
        if not path.is_file():
            return []
        return [json.loads(line) for line in path.read_text().splitlines()]

    def deploys(self) -> list[Json]:
        return [call for call in self.calls("wrangler") if call["argv"][:2] == ["pages", "deploy"]]

    def state(self) -> Json:
        path = self.settings.state_dir / "state.json"
        return json.loads(path.read_text()) if path.is_file() else None

    def commit_on_main(self, relative: str, text: str, message: str = "Change") -> str:
        (self.repo / relative).write_text(text)
        git(self.repo, "commit", "-q", "-am", message)
        git(self.repo, "push", "-q", "origin", "main")
        return git(self.repo, "rev-parse", "HEAD")

    def clear_deployments(self) -> None:
        shutil.rmtree(self.root / "deployments")
        (self.root / "deployments").mkdir()
        shutil.rmtree(self.root / "meta", ignore_errors=True)

    # The Pages API, from what the fake wrangler deployed.

    def pages_deployments(self, environment: str | None = None) -> list[Json]:
        """Every deployment, newest first, as the Pages API describes it."""
        found = []
        for path in (self.root / "meta").glob("*.json") if (self.root / "meta").is_dir() else []:
            meta = json.loads(path.read_text())
            if meta.get("deleted"):
                continue
            deployment = path.stem
            kind = "production" if meta["branch"] == "main" else "preview"
            if environment is not None and kind != environment:
                continue
            project = self.settings.pages_project
            found.append(
                {
                    "id": deployment,
                    "short_id": deployment,
                    "url": f"https://{deployment}.{project}.pages.dev",
                    "environment": kind,
                    "created_on": f"2026-11-22T03:{meta['number'] // 60:02d}:"
                    f"{meta['number'] % 60:02d}.000000Z",
                    "deployment_trigger": {
                        "type": "ad_hoc",
                        "metadata": {
                            "branch": meta["branch"],
                            "commit_hash": meta["commit"],
                            "commit_message": meta["message"],
                        },
                    },
                    "number": meta["number"],
                }
            )
        return sorted(found, key=lambda one: -int(one["number"]))

    def canonical_id(self) -> str | None:
        if self.rolled_back_to is not None:
            return self.rolled_back_to
        production = self.pages_deployments("production")
        return str(production[0]["id"]) if production else None

    def pages_get(self, url: str) -> Response:
        parts = urlsplit(url)
        project = f"/accounts/{ACCOUNT}/pages/projects/{self.settings.pages_project}"
        path = parts.path.removeprefix("/client/v4")
        if path == project:
            live = self.canonical_id()
            canonical = next((one for one in self.pages_deployments() if one["id"] == live), None)
            return json_response({"result": {"canonical_deployment": canonical}})
        if path == project + "/deployments":
            query = dict(pair.split("=") for pair in parts.query.split("&") if pair)
            listed = self.pages_deployments(query.get("env"))
            page, per_page = int(query.get("page", "1")), int(query.get("per_page", "25"))
            chunk = listed[(page - 1) * per_page : page * per_page]
            return json_response(
                {
                    "result": chunk,
                    "result_info": {
                        "page": page,
                        "per_page": per_page,
                        "count": len(chunk),
                        "total_count": len(listed),
                        "total_pages": max(1, -(-len(listed) // per_page)),
                    },
                }
            )
        return json_response({"success": False}, 404)

    def pages_send(self, method: str, url: str) -> Response:
        path = urlsplit(url).path.removeprefix("/client/v4")
        prefix = f"/accounts/{ACCOUNT}/pages/projects/{self.settings.pages_project}/deployments/"
        if not path.startswith(prefix):
            return json_response({"success": False}, 404)
        rest = path.removeprefix(prefix)
        if method == "POST" and rest.endswith("/rollback"):
            self.rolled_back_to = rest.removesuffix("/rollback")
            return json_response({"success": True, "result": {}})
        if method == "DELETE" and "/" not in rest:
            if rest == self.canonical_id():
                return json_response({"success": False}, 400)
            meta_path = self.root / "meta" / f"{rest}.json"
            meta = json.loads(meta_path.read_text())
            meta_path.write_text(json.dumps({**meta, "deleted": True}))
            return json_response({"success": True, "result": None})
        return json_response({"success": False}, 404)

    def add_deployment(
        self, branch: str, message: str, commit: str | None = None, like: str | None = None
    ) -> str:
        """A deployment made elsewhere (a publish on the Mac, or CI), with the files of `like`
        (by default the newest production deployment)."""
        number = len(list((self.root / "deployments").glob("*"))) + 1
        deployment = f"dep{number}"
        source = like or self.canonical_id()
        target = self.root / "deployments" / deployment
        if source is not None:
            shutil.copytree(self.root / "deployments" / source, target)
        else:
            target.mkdir()
        (self.root / "meta").mkdir(exist_ok=True)
        (self.root / "meta" / f"{deployment}.json").write_text(
            json.dumps(
                {
                    "number": number,
                    "branch": branch,
                    "commit": commit or git(self.repo, "rev-parse", "origin/main"),
                    "message": message,
                }
            )
        )
        return deployment
