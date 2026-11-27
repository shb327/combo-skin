"""`publish`: the published combos and the website from one commit, deployed together, with
only missing images uploaded (spec 021, R2 to R11)."""

import json
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from combo_publish import images, manifest, pages_api, site, state, wrangler
from combo_publish.app import CommandError, Deps, megabytes
from combo_publish.bucket import ObjectInfo
from combo_publish.export import Export, export
from combo_publish.git import MAIN, Git
from combo_publish.headers import generate
from combo_publish.keychain import MissingCredential
from combo_publish.schema import PublicSchema, schema_drift
from combo_publish.settings import Settings
from combo_publish.smoke import smoke_test

REBUILD = "docker compose up -d --wait --build"
RACED = "A merge deploy went live during this publish; run it again."
ROLLBACK = (
    "Roll back: Pages dashboard > {project} > Deployments > an earlier production deployment > "
    "Rollback to this deployment (deploy/README.md, Rollback)"
)


def check_drift(deps: Deps, settings: Settings, built: Any) -> None:
    """Stops when the running API's public schemas differ from the built commit's: the stack
    was not rebuilt since a merge changed them."""
    running = deps.local_json(settings, "/openapi.json")
    differ = schema_drift(running, built)
    if differ:
        raise CommandError(
            "The running API's public schemas differ from the built commit's "
            f"({', '.join(differ)}). Rebuild the stack first: {REBUILD}"
        )


def _read(source: Path, path: str) -> Any:
    return json.loads((source / path).read_text())


def run(
    deps: Deps,
    *,
    preview: bool = False,
    ref: str | None = None,
    dry_run: bool = False,
    verify_images: bool = False,
) -> None:
    settings = deps.settings()
    if ref is not None and not preview:
        raise CommandError(
            "A production publish always uses the tip of origin/main; --ref is only for --preview"
        )
    command = "publish" + (" --preview" if preview else "") + (" --dry-run" if dry_run else "")
    with state.Lock(settings.state_dir, command):
        _publish(deps, settings, preview=preview, ref=ref, dry_run=dry_run, verify=verify_images)


def _publish(
    deps: Deps, settings: Settings, *, preview: bool, ref: str | None, dry_run: bool, verify: bool
) -> None:
    out = deps.console
    git = Git(deps.tools, deps.repo)
    git.fetch()
    try:
        commit = git.commit(ref or MAIN)
    except Exception as error:
        raise CommandError(f"No commit named {ref or MAIN}") from error
    if not preview and not git.is_ancestor(commit, MAIN):
        raise CommandError(f"{commit[:12]} is not on {MAIN}; production publishes only {MAIN}")
    target = "preview" if preview else "production"
    named = ref or MAIN
    named = "--ref" if commit.startswith(named) else named
    out.print(
        f"Commit {commit[:12]} ({named}) to {target}{', dry run' if dry_run else ''}: "
        f"{git.subject(commit)}"
    )
    # A merge deploy can go live while this runs; production must not overwrite it unseen.
    token = None if preview or dry_run else deps.secret(settings.pages_token_service)
    live_before = _live_id(deps, settings, token)

    with deps.workdir() as work:
        source = work / "source"
        git.archive(commit, source)
        openapi = _read(source, "api/openapi.json")
        catalog = _read(source, "website/src/data/catalog.json")
        agents = _read(source, "website/src/data/agents.json")
        check_drift(deps, settings, openapi)

        result = export(deps.http, settings, catalog, openapi)
        out.print(
            f"Combos: {result.combos} published; {result.glove_finishes} glove finishes and "
            f"{result.knife_finishes} knife finishes with combos"
        )
        previous = state.load(settings.state_dir)
        out.print(
            f"Data files: {len(result.files)} written, {_changed(result, previous)} changed "
            "since the last production publish"
        )

        data_manifest = manifest.make(
            result.files,
            data_version=result.sha256,
            exported_at=deps.now().isoformat(timespec="seconds"),
            exported_with=commit,
            origins=settings,
        ).encode()
        dist = site.build_website(deps.tools, source, settings)
        folder = work / "site"
        site.assemble(
            dist,
            folder,
            {**result.files, manifest.MANIFEST_FILE: data_manifest},
            generate(settings),
        )
        summary = site.check(folder, settings.local_urls, PublicSchema(openapi))

        referenced = (
            result.screenshot_keys | result.picture_keys | images.picture_keys(catalog, agents)
        )
        try:
            bucket = deps.bucket(settings, settings.public_bucket, settings.images_token_service)
        except MissingCredential:
            if not dry_run:
                raise
            bucket = None
        listing = images.managed(bucket.objects()) if bucket is not None else None
        plan = images.plan(referenced, listing)
        if verify and listing is not None:
            plan.missing = sorted(
                {*plan.missing, *images.changed(deps.http, settings, listing, referenced)}
            )

        if dry_run:
            sizes = images.local_sizes(deps.http, settings, plan.missing)
            there = (
                "bucket not checked (no image token yet)"
                if listing is None
                else (
                    f"{plan.already_there} already there, {len(plan.unused)} waiting to be pruned"
                )
            )
            out.print(
                f"Images: {len(referenced)} referenced, {sizes.count} to upload "
                f"({megabytes(sizes.size)}), {there}{_skipped(sizes.skipped)}"
            )
            out.print(f"Pages: {summary.files} files ({megabytes(summary.size)}), not deployed")
            out.print("Dry run: nothing was uploaded or deployed.")
            return

        if bucket is None or listing is None:
            raise CommandError("No image bucket to upload to")
        token = token or deps.secret(settings.pages_token_service)
        uploaded = images.upload(deps.http, settings, bucket, plan.missing)
        out.print(
            f"Images: {len(referenced)} referenced, {uploaded.count} uploaded "
            f"({megabytes(uploaded.size)}), {plan.already_there} already there, "
            f"{len(plan.unused)} waiting to be pruned{_skipped(uploaded.skipped)}"
        )

        message = f"Combo Skin {commit[:12]}"
        first = wrangler.deploy(
            deps.tools,
            settings,
            token,
            folder,
            branch=wrangler.PREVIEW_BRANCH,
            commit=commit,
            message=message,
            work=work,
        )
        smoke_test(
            deps.http,
            settings,
            first.url,
            result,
            manifest=data_manifest,
            noindex=True,
            sleep=deps.sleep,
        )
        out.print(f"Pages: {summary.files} files; preview {first.url} checked")
        if preview:
            out.print(f"Preview: {first.alias or first.url}, deployment {first.id}")
            return

        if _live_id(deps, settings, token) != live_before:
            raise CommandError(RACED)
        live = wrangler.deploy(
            deps.tools,
            settings,
            token,
            folder,
            branch=wrangler.PRODUCTION_BRANCH,
            commit=commit,
            message=message,
            work=work,
        )
        today = deps.today()
        current = previous or state.State()
        current.live = state.Live(
            live.id, commit, deps.now().isoformat(timespec="seconds"), sorted(referenced)
        )
        current.data_files = result.digests
        current.data_sha256 = result.sha256
        images.mark_used(current, referenced, today)
        after = {**listing, **{key: ObjectInfo(0, "") for key in plan.missing}}
        due = images.due(current, after, today)
        state.save(settings.state_dir, current)
        out.print(_live_line(deps, settings, token, live))
        out.print(ROLLBACK.format(project=settings.pages_project))
        overwritten = _merge_deploy_over(deps, settings, token, live.id)
        if overwritten:
            out.print(overwritten)
        if due:
            bucket.delete(due)
            images.forget(current, due)
            state.save(settings.state_dir, current)
        out.print(
            f"Pruned: {len(due)} images unused by production for {images.PRUNE_AFTER_DAYS} days"
        )


def _live_line(deps: Deps, settings: Settings, token: str, live: wrangler.Deployment) -> str:
    """Where production is served: the site, once its domain is attached to the Pages
    project; until then, the project's own `pages.dev` address (spec 021, Deviations, 16)."""
    project = pages_api.project(deps.http, settings, token)
    host = (urlsplit(settings.site_origin).hostname or "").lower()
    if host in project.domains:
        return f"Live: {settings.site_origin}, deployment {live.id}"
    where = f"https://{project.subdomain}" if project.subdomain else live.url
    return f"Live: {where}, deployment {live.id}; {host} is not attached to this project yet"


def _live_id(deps: Deps, settings: Settings, token: str | None) -> str | None:
    if token is None:
        return None
    found = pages_api.live_or_none(deps.http, settings, token)
    return found.id if found else None


def _merge_deploy_over(deps: Deps, settings: Settings, token: str, ours: str) -> str | None:
    """A merge deploy that went live after this publish's production deploy carries older data:
    its own check after production can miss this publish while the Pages API's list lags. Roll
    production back to this publish and delete it (spec 026, Audit)."""
    own = None
    for attempt in range(5):
        own = next(
            (one for one in pages_api.production(deps.http, settings, token) if one.id == ours),
            None,
        )
        if own is not None:
            break
        if attempt < 4:
            deps.sleep(3.0)
    canonical = pages_api.live_or_none(deps.http, settings, token)
    if (
        own is None
        or canonical is None
        or canonical.id == ours
        or not canonical.merge_deploy
        or canonical.created <= own.created
    ):
        return None
    try:
        pages_api.rollback(deps.http, settings, token, ours)
    except pages_api.PagesError as error:
        raise CommandError(
            f"Merge deploy {canonical.id} went live over this publish with older data. Roll back "
            f"to this publish (deployment {ours}) in the Pages dashboard now (Deployments > "
            f"{ours} > Rollback to this deployment); the automatic rollback failed: {error}"
        ) from error
    note = f"{canonical.id} was deleted"
    try:
        pages_api.delete(deps.http, settings, token, canonical.id)
    except pages_api.PagesError as error:
        note = f"{canonical.id} could not be deleted ({error}); delete it in the dashboard"
    return (
        f"Merge deploy {canonical.id} went live over this publish with older data: production was "
        f"rolled back to this publish and {note}. Run the deploy workflow by hand on main to put "
        "the newer code live."
    )


def _changed(result: Export, previous: state.State | None) -> int:
    before = previous.data_files if previous else {}
    return sum(1 for path, digest in result.digests.items() if before.get(path) != digest)


def _skipped(keys: list[str]) -> str:
    return (
        f"; {len(keys)} catalog copies missing locally (the site shows the game's)" if keys else ""
    )
