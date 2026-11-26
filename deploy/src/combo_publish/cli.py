"""The command line: `uv run --project deploy python -m combo_publish <subcommand>`."""

import argparse
import sys
import time
from collections.abc import Sequence
from datetime import date, datetime
from pathlib import Path

from combo_publish import backup, check, deploy_code, prune, publish, status
from combo_publish.app import CommandError, Deps
from combo_publish.bucket import R2Bucket
from combo_publish.console import Console
from combo_publish.export import ExportError
from combo_publish.http import HttpError, UrlHttp
from combo_publish.images import ImageError
from combo_publish.keychain import MacKeychain, MissingCredential
from combo_publish.manifest import ManifestError
from combo_publish.pages_api import PagesError
from combo_publish.proc import ToolError, Tools
from combo_publish.settings import SettingsError
from combo_publish.site import SiteError
from combo_publish.smoke import SmokeError
from combo_publish.state import Busy
from combo_publish.wrangler import DeployError

# deploy/src/combo_publish/cli.py: the repository is three folders up from this package.
REPO = Path(__file__).resolve().parents[3]
STOPS = (
    CommandError,
    SettingsError,
    MissingCredential,
    ExportError,
    SiteError,
    ImageError,
    DeployError,
    SmokeError,
    PagesError,
    ToolError,
    HttpError,
    Busy,
    ManifestError,
)


def parser() -> argparse.ArgumentParser:
    top = argparse.ArgumentParser(prog="combo_publish", description=__doc__)
    top.add_argument(
        "--settings", type=Path, help="the settings file (default deploy/publish.toml)"
    )
    commands = top.add_subparsers(dest="command", required=True)
    commands.add_parser("check", help="check settings, credentials and tools; changes nothing")
    command = commands.add_parser("publish", help="publish the site")
    command.add_argument("--preview", action="store_true", help="deploy to the preview branch only")
    command.add_argument("--ref", help="the commit to build (only with --preview)")
    command.add_argument("--dry-run", action="store_true", help="print the plan; upload nothing")
    command.add_argument(
        "--verify-images", action="store_true", help="re-check every present image's size and ETag"
    )
    commands.add_parser("status", help="the live deployment and what changed since")
    command = commands.add_parser("prune-images", help="delete images unused for 30 days")
    command.add_argument("--dry-run", action="store_true", help="list what would be deleted")
    command.add_argument("--now", metavar="COMBO_ID", help="delete one combo's images now")
    commands.add_parser("backup", help="dump the database and copy it to the backup bucket")
    command = commands.add_parser(
        "deploy-code", help="deploy the website's code on the live data (merge deploys)"
    )
    steps = command.add_subparsers(dest="step", required=True)
    step = steps.add_parser("build", help="build and check one commit on the live data")
    step.add_argument("--ref", help="the commit to build (default origin/main)")
    step.add_argument("--out", type=Path, help="the folder to write the site and plan to")
    step.add_argument("--dry-run", action="store_true", help="print the plan; write nothing")
    step = steps.add_parser("release", help="deploy a folder made by build (needs the token)")
    step.add_argument("folder", type=Path, help="the folder build wrote")
    step.add_argument(
        "--by-hand",
        action="store_true",
        help="the run was started by hand (deploys after a rollback)",
    )
    return top


def main(argv: Sequence[str] | None = None, deps: Deps | None = None) -> int:
    args = parser().parse_args(argv)
    deps = deps or Deps(
        repo=REPO,
        settings_path=REPO / "deploy" / "publish.toml",
        http=UrlHttp(),
        keychain=MacKeychain(),
        buckets=R2Bucket,
        tools=Tools(wrangler=str(REPO / "deploy" / "node_modules" / ".bin" / "wrangler")),
        console=Console(sys.stdout, sys.stderr),
        today=date.today,
        now=lambda: datetime.now().astimezone(),
        sleep=time.sleep,
    )
    if args.settings is not None:
        deps.settings_path = args.settings
    if args.command == "deploy-code":
        return _deploy_code(args, deps)
    try:
        match args.command:
            case "check":
                return 0 if check.run_check(deps) else 1
            case "publish":
                publish.run(
                    deps,
                    preview=args.preview,
                    ref=args.ref,
                    dry_run=args.dry_run,
                    verify_images=args.verify_images,
                )
            case "status":
                status.run(deps)
            case "prune-images":
                prune.run(deps, dry_run=args.dry_run, now=args.now)
            case "backup":
                backup.run(deps)
    except STOPS as error:
        deps.console.error(
            f"{deps.now().isoformat(timespec='seconds')} {error}"
            if args.command == "backup"
            else str(error)
        )
        return 1
    return 0


def _deploy_code(args: argparse.Namespace, deps: Deps) -> int:
    """A merge deploy step. Whatever stops it says why on the first line of the run summary
    (spec 026, R11)."""
    out = deps.console
    try:
        if args.step == "build":
            deploy_code.build(deps, ref=args.ref, out=args.out, dry_run=args.dry_run)
        else:
            lines = deploy_code.release(deps, args.folder, by_hand=args.by_hand)
            deploy_code.write_summary(deps.environ, [out.redact(line) for line in lines])
        return 0
    except deploy_code.NotDeployed as reason:
        line, kind, code = f"Not deployed: {reason}", "notice", 0
        out.print(line)
    except (deploy_code.NeedsPublish, deploy_code.Paused) as reason:
        line, kind, code = str(reason), "error", 1
        out.error(line)
    except STOPS as error:
        line, kind, code = f"Failed: {error}", "error", 1
        out.error(line)
    line = out.redact(line)
    deploy_code.write_summary(deps.environ, [line])
    deploy_code.annotate(deps.environ, kind, line.splitlines()[0], out.print)
    return code
