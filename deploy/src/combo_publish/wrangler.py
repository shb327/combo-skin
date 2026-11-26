"""Pages deployments through the pinned wrangler (spec 021, R8 and R28).

Wrangler runs with an environment made here and nothing else: the Pages token as
CLOUDFLARE_API_TOKEN, the account from the settings as CLOUDFLARE_ACCOUNT_ID, and an empty
home and config folder, so its own login and config are never read and no other account can
be reached. No R2 key is ever in its environment.
"""

import json
from dataclasses import dataclass
from pathlib import Path

from combo_publish.pages_api import PagesTarget
from combo_publish.proc import Tools, base_env, run

PRODUCTION_BRANCH = "main"
PREVIEW_BRANCH = "preview"


class DeployError(Exception):
    """A deployment failed. What was live before stays live."""


@dataclass(frozen=True)
class Deployment:
    id: str
    url: str
    alias: str | None
    environment: str


def env(settings: PagesTarget, token: str, work: Path) -> dict[str, str]:
    home = work / "wrangler-home"
    (home / "config").mkdir(parents=True, exist_ok=True)
    found = base_env()
    found.update(
        {
            "HOME": str(home),
            "XDG_CONFIG_HOME": str(home / "config"),
            "CLOUDFLARE_API_TOKEN": token,
            "CLOUDFLARE_ACCOUNT_ID": settings.account_id,
            "WRANGLER_SEND_METRICS": "false",
            "WRANGLER_OUTPUT_FILE_PATH": str(work / "wrangler-output.ndjson"),
            "NO_COLOR": "1",
        }
    )
    return found


def deploy(
    tools: Tools,
    settings: PagesTarget,
    token: str,
    site: Path,
    *,
    branch: str,
    commit: str,
    message: str,
    work: Path,
) -> Deployment:
    environment = env(settings, token, work)
    output = Path(environment["WRANGLER_OUTPUT_FILE_PATH"])
    output.unlink(missing_ok=True)
    try:
        run(
            [
                tools.wrangler,
                "pages",
                "deploy",
                str(site),
                "--project-name",
                settings.pages_project,
                "--branch",
                branch,
                "--commit-hash",
                commit,
                "--commit-message",
                message,
                "--commit-dirty=false",
            ],
            cwd=work,
            env=environment,
            what=f"wrangler pages deploy (branch {branch})",
        )
    except Exception as error:
        raise DeployError(str(error)) from error
    for line in output.read_text().splitlines() if output.is_file() else []:
        entry = json.loads(line)
        if entry.get("type") == "pages-deploy-detailed":
            return Deployment(
                id=str(entry["deployment_id"]),
                url=str(entry["url"]).rstrip("/"),
                alias=entry.get("alias"),
                environment=str(entry.get("environment", "")),
            )
    raise DeployError("wrangler reported no deployment")


def whoami(tools: Tools, settings: PagesTarget, token: str, work: Path) -> str:
    return run(
        [tools.wrangler, "whoami"], cwd=work, env=env(settings, token, work), what="wrangler whoami"
    ).decode(errors="replace")


def version(tools: Tools, work: Path) -> str:
    return run([tools.wrangler, "--version"], cwd=work, env=base_env()).decode().strip()
