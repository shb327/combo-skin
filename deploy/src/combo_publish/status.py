"""`status`: the live production deployment, how far behind origin/main it is, and whether
the local published combos differ from its data (spec 021, R12). It changes nothing."""

import json

from combo_publish import pages_api
from combo_publish.app import Deps
from combo_publish.export import COUNTS_FILE, data_path, export
from combo_publish.git import MAIN, Git
from combo_publish.http import HttpError


def run(deps: Deps) -> None:
    settings = deps.settings()
    out = deps.console
    token = deps.secret(settings.pages_token_service)
    live = pages_api.live(deps.http, settings, token)
    out.print(
        f"Live: deployment {live.id}, commit {live.commit[:12] or 'unknown'}, {live.created_on}"
    )

    git = Git(deps.tools, deps.repo)
    git.fetch()
    try:
        behind = git.behind(live.commit, MAIN)
        out.print(f"Behind {MAIN}: {behind} commits")
    except Exception:
        out.print(f"Behind {MAIN}: unknown (commit {live.commit[:12]} is not in this repository)")
        return

    catalog = json.loads(git.show(live.commit, "website/src/data/catalog.json"))
    openapi = json.loads(git.show(live.commit, "api/openapi.json"))
    local = export(deps.http, settings, catalog, openapi)
    base = live.url or settings.site_origin

    def served(path: str) -> object:
        try:
            answer = deps.http.get(f"{base}/{path}")
        except HttpError:
            return None
        return json.loads(answer.body) if answer.status == 200 else None

    live_counts = served(COUNTS_FILE)
    finishes: set[tuple[str, str, str]] = set()
    for counts in (local.counts, live_counts if isinstance(live_counts, dict) else {}):
        for kind in ("gloves", "knives"):
            for type_id, by_finish in counts.get(kind, {}).items():
                finishes.update((kind, type_id, finish_id) for finish_id in by_finish)
    differ = 0 if live_counts == local.counts else 1
    for kind, type_id, finish_id in sorted(finishes):
        path = data_path(kind, type_id, finish_id)
        if served(path) != json.loads(local.files.get(path, b"[]")):
            differ += 1
    if differ:
        out.print(f"Data: {differ} data files differ from the live site; publish to update it")
    else:
        out.print("Data: the local published combos match the live site")
