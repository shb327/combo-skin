"""The Pages API, with the Pages token: the project's canonical (live) deployment, its
production deployments, and, for a merge deploy that lost a race with a publish, a rollback and
a delete (spec 021, R12; spec 026, R3 and R16). Wrangler lists deployments but not which one is
live after a rollback; the project's canonical deployment is."""

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol

from combo_publish.http import Http, HttpError, Response

API = "https://api.cloudflare.com/client/v4"
PER_PAGE = 25
# The words in a merge deploy's commit message that tell it from a publish (spec 026, R5).
MERGE_DEPLOY = "merge deploy"


class PagesError(Exception):
    pass


class PagesTarget(Protocol):
    @property
    def account_id(self) -> str: ...

    @property
    def pages_project(self) -> str: ...


@dataclass(frozen=True)
class Deployment:
    id: str
    url: str
    commit: str
    created_on: str
    message: str = ""
    environment: str = ""

    @property
    def merge_deploy(self) -> bool:
        return MERGE_DEPLOY in self.message

    @property
    def created(self) -> datetime:
        return datetime.fromisoformat(self.created_on)


def _project(target: PagesTarget) -> str:
    return f"{API}/accounts/{target.account_id}/pages/projects/{target.pages_project}"


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _json(answer: Response) -> Any:
    if answer.status != 200:
        raise PagesError(f"The Pages API answered {answer.status}")
    return json.loads(answer.body)


def _deployment(raw: Any) -> Deployment:
    metadata = (raw.get("deployment_trigger") or {}).get("metadata") or {}
    return Deployment(
        id=str(raw["id"]),
        url=str(raw.get("url", "")).rstrip("/"),
        commit=str(metadata.get("commit_hash") or ""),
        created_on=str(raw.get("created_on", "")),
        message=str(metadata.get("commit_message") or ""),
        environment=str(raw.get("environment", "")),
    )


def live_or_none(http: Http, target: PagesTarget, token: str) -> Deployment | None:
    """The live deployment, or None when the project has none yet."""
    try:
        answer = http.get(_project(target), _auth(token))
    except HttpError as error:
        raise PagesError(f"The Pages API did not answer: {error}") from error
    result = _json(answer).get("result") or {}
    canonical = result.get("canonical_deployment")
    return _deployment(canonical) if canonical else None


def live(http: Http, target: PagesTarget, token: str) -> Deployment:
    found = live_or_none(http, target, token)
    if found is None:
        raise PagesError("The project has no production deployment yet")
    return found


def production(http: Http, target: PagesTarget, token: str) -> list[Deployment]:
    """Every production deployment Pages still keeps, newest first."""
    found: list[Deployment] = []
    page = 1
    while True:
        url = f"{_project(target)}/deployments?env=production&page={page}&per_page={PER_PAGE}"
        try:
            body = _json(http.get(url, _auth(token)))
        except HttpError as error:
            raise PagesError(f"The Pages API did not answer: {error}") from error
        found += [_deployment(raw) for raw in body.get("result") or []]
        if page >= int((body.get("result_info") or {}).get("total_pages") or 1):
            break
        page += 1
    # The API doesn't promise an order.
    return sorted(found, key=lambda one: one.created, reverse=True)


def _send(http: Http, method: str, url: str, token: str, what: str) -> None:
    try:
        answer = http.send(method, url, _auth(token))
    except HttpError as error:
        raise PagesError(f"The Pages API did not answer the {what}: {error}") from error
    if answer.status != 200:
        raise PagesError(f"The Pages API refused the {what} ({answer.status})")


def rollback(http: Http, target: PagesTarget, token: str, deployment: str) -> None:
    _send(http, "POST", f"{_project(target)}/deployments/{deployment}/rollback", token, "rollback")


def delete(http: Http, target: PagesTarget, token: str, deployment: str) -> None:
    _send(http, "DELETE", f"{_project(target)}/deployments/{deployment}", token, "delete")
