"""`check`: whether everything a publish needs is in place, without changing anything or
reading any credential's value (spec 021, R13)."""

import json
from pathlib import Path

from combo_publish import wrangler
from combo_publish.app import Deps
from combo_publish.git import MAIN, Git
from combo_publish.http import HttpError
from combo_publish.keychain import MissingCredential, add_command
from combo_publish.proc import ToolError, base_env, run
from combo_publish.schema import schema_drift
from combo_publish.settings import SettingsError


def pinned_wrangler(repo: Path) -> str:
    manifest = json.loads((repo / "deploy" / "package.json").read_text())
    return str(manifest["devDependencies"]["wrangler"])


def run_check(deps: Deps) -> bool:
    out = deps.console
    ok = True

    def report(ready: bool, what: str, detail: str = "") -> None:
        nonlocal ok
        ok = ok and ready
        out.print(f"  {'ready  ' if ready else 'MISSING'}  {what}{': ' + detail if detail else ''}")

    try:
        settings = deps.settings()
    except SettingsError as error:
        report(False, "settings", str(error))
        return False
    report(True, "settings", str(deps.settings_path.name))

    for service in settings.keychain_services:
        present = deps.keychain.has(service)
        report(
            present,
            f"Keychain item {service}",
            "" if present else f"add it with {add_command(service)}",
        )

    try:
        answer = deps.http.get(f"{settings.local_api_url}/combo-counts")
        report(
            answer.status == 200, "local API", f"{settings.local_api_url} answered {answer.status}"
        )
    except HttpError as error:
        report(False, "local API", str(error))

    git = Git(deps.tools, deps.repo)
    try:
        catalog = json.loads(git.show(MAIN, "website/src/data/catalog.json"))
        key = catalog["gloves"][0]["finishes"][0]["image_key"]
        answer = deps.http.get(f"{settings.local_image_base_url}/{key}")
        report(
            answer.status == 200,
            "local image bucket",
            f"{settings.local_image_base_url} answered {answer.status} for a catalog copy",
        )
    except (HttpError, ToolError, KeyError, IndexError) as error:
        report(False, "local image bucket", str(error))

    try:
        running = deps.local_json(settings, "/openapi.json")
        built = json.loads(git.show(MAIN, "api/openapi.json"))
        differ = schema_drift(running, built)
        report(
            not differ,
            f"public schemas match {MAIN} (as last fetched)",
            "" if not differ else f"{', '.join(differ)} differ; rebuild the stack first",
        )
    except Exception as error:
        report(False, "public schemas", str(error))

    for tool, name in ((deps.tools.node, "node"), (deps.tools.npm, "npm")):
        try:
            report(True, name, run([tool, "--version"], env=base_env()).decode().strip())
        except ToolError as error:
            report(False, name, str(error))

    pin = pinned_wrangler(deps.repo)
    with deps.workdir() as work:
        try:
            found = wrangler.version(deps.tools, work)
            pinned = pin in found
            report(
                pinned,
                "wrangler",
                found if pinned else f"{found}, not the pinned {pin}: run npm ci in deploy/",
            )
        except ToolError as error:
            report(False, "wrangler", f"{error} (run npm ci in deploy/)")
        if deps.keychain.has(settings.pages_token_service):
            try:
                token = deps.secret(settings.pages_token_service)
                seen = settings.account_id in wrangler.whoami(deps.tools, settings, token, work)
                report(
                    seen,
                    "wrangler sees the account",
                    "" if seen else "the Pages token cannot reach the configured account",
                )
            except (ToolError, MissingCredential) as error:
                report(False, "wrangler sees the account", str(error))
        else:
            report(False, "wrangler sees the account", "needs the Pages token first")
    return ok
