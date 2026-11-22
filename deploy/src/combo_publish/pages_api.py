"""Reads the live production deployment from the Pages API, with the Pages token (`status`).
Wrangler lists deployments but not which one is live after a rollback; the project's
canonical deployment is."""

import json
from dataclasses import dataclass

from combo_publish.http import Http, HttpError
from combo_publish.settings import Settings

API = "https://api.cloudflare.com/client/v4"


class PagesError(Exception):
    pass


@dataclass(frozen=True)
class LiveDeployment:
    id: str
    url: str
    commit: str
    created_on: str


def live(http: Http, settings: Settings, token: str) -> LiveDeployment:
    url = f"{API}/accounts/{settings.account_id}/pages/projects/{settings.pages_project}"
    try:
        answer = http.get(url, {"Authorization": f"Bearer {token}"})
    except HttpError as error:
        raise PagesError(f"The Pages API did not answer: {error}") from error
    if answer.status != 200:
        raise PagesError(f"The Pages API answered {answer.status}")
    result = json.loads(answer.body).get("result") or {}
    canonical = result.get("canonical_deployment")
    if not canonical:
        raise PagesError("The project has no production deployment yet")
    return LiveDeployment(
        id=str(canonical["id"]),
        url=str(canonical.get("url", "")).rstrip("/"),
        commit=str(
            canonical.get("deployment_trigger", {}).get("metadata", {}).get("commit_hash", "")
        ),
        created_on=str(canonical.get("created_on", "")),
    )
