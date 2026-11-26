"""`status`: the live production deployment and whether it is a publish or a merge deploy,
the data it serves, any rollback, how far behind origin/main it is, whether the next merge
deploy can go out, and whether the local published combos differ from its data (spec 021, R12;
spec 026, R14). It changes nothing."""

import json

from combo_publish import pages_api, state
from combo_publish.app import Deps
from combo_publish.export import COUNTS_FILE, data_path, export
from combo_publish.git import MAIN, Git
from combo_publish.http import HttpError
from combo_publish.manifest import Manifest, fetch
from combo_publish.pages_api import Deployment
from combo_publish.schema import schema_drift

STOP = "Merge deploys: the next one will stop: "


def run(deps: Deps) -> None:
    settings = deps.settings()
    out = deps.console
    token = deps.secret(settings.pages_token_service)
    live = pages_api.live(deps.http, settings, token)
    newest = next(iter(pages_api.production(deps.http, settings, token)), live)
    kind = "merge deploy" if live.merge_deploy else "publish"
    out.print(
        f"Live: deployment {live.id}, commit {live.commit[:12] or 'unknown'}, {live.created_on}, "
        f"{kind}"
    )
    data = fetch(deps.http, live.url) if live.url else None
    recorded = state.load(settings.state_dir)
    if data is None:
        out.print("Live data: no data manifest (published before merge deploys)")
    else:
        mine = recorded is not None and recorded.data_sha256 == data.data_version
        out.print(
            f"Live data: data {data.data_version[:12]}, exported {data.exported_at} with commit "
            f"{data.exported_with[:12]}, "
            + ("the data of" if mine else "not the data of")
            + " the last publish recorded here"
        )
    if newest.id == live.id:
        out.print("Rollback: none")
    else:
        out.print(
            f"Rollback: production is rolled back to deployment {live.id}; the newest production "
            f"deployment is {newest.id}"
        )

    git = Git(deps.tools, deps.repo)
    git.fetch()
    try:
        behind = git.behind(live.commit, MAIN)
        out.print(f"Behind {MAIN}: {behind} commits")
    except Exception:
        out.print(f"Behind {MAIN}: unknown (commit {live.commit[:12]} is not in this repository)")
        return
    out.print(_merge_deploys(deps, git, live, newest, data))

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


def _merge_deploys(
    deps: Deps, git: Git, live: Deployment, newest: Deployment, data: Manifest | None
) -> str:
    """What the next merge deploy will do, from what Pages and origin/main say now."""
    if data is None:
        return STOP + "the live deployment has no data manifest; publish once"
    if newest.id != live.id:
        newest_data = fetch(deps.http, newest.url) if newest.url else None
        if newest_data is None or newest_data.data_version != data.data_version:
            return STOP + "production is rolled back to older data; publish to resume"
        return (
            "Merge deploys: pushes are paused while production is rolled back; run the "
            "workflow by hand on main, or publish"
        )
    try:
        exported = json.loads(git.show(data.exported_with, "api/openapi.json"))
        merged = json.loads(git.show(MAIN, "api/openapi.json"))
    except Exception:
        return STOP + f"the live data's export commit {data.exported_with[:12]} is not here"
    differ = schema_drift(exported, merged)
    if differ:
        return (
            STOP + f"the public schemas of {MAIN} differ from the live data's "
            f"({', '.join(differ)}); publish from the Mac"
        )
    return "Merge deploys: can deploy on this data"
