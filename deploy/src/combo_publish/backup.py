"""`backup`: the nightly database dump, checked, kept on the Mac and copied to the private
backup bucket (spec 021, R30). Dumps hold admin password hashes and sessions: mode 600 on
disk, and only ever in the backup bucket."""

import hashlib
import os
import re
from datetime import datetime
from pathlib import Path

from combo_publish.app import CommandError, Deps
from combo_publish.bucket import Bucket
from combo_publish.proc import ToolError, base_env
from combo_publish.proc import run as run_tool

KEEP_LOCAL = 30
KEEP_DAILY = 30
KEEP_MONTHLY = 12
PREFIX = "db/"
NAME = re.compile(r"^\d{4}-\d{2}-\d{2}_\d{6}\.dump$")
DUMP = 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"'


def container(deps: Deps, project: str) -> str:
    found = (
        run_tool(
            [
                deps.tools.docker,
                "ps",
                "-q",
                "--filter",
                f"label=com.docker.compose.project={project}",
                "--filter",
                "label=com.docker.compose.service=db",
            ],
            env=base_env(),
            what="docker ps",
        )
        .decode()
        .split()
    )
    if len(found) != 1:
        raise CommandError(f"Expected one running db container in the Compose project {project}")
    return found[0]


def dump(deps: Deps, project: str) -> bytes:
    """A custom-format dump, made inside the db container with its own credentials, and listed
    with pg_restore there to check it reads."""
    db = container(deps, project)
    body = run_tool(
        [deps.tools.docker, "exec", db, "sh", "-c", DUMP], env=base_env(), what="pg_dump"
    )
    try:
        listing = run_tool(
            [deps.tools.docker, "exec", "-i", db, "pg_restore", "--list"],
            env=base_env(),
            stdin=body,
            what="pg_restore --list",
        )
    except ToolError as error:
        raise CommandError(f"The dump does not read back, so it was not kept: {error}") from error
    if not body or not listing.strip():
        raise CommandError("The dump is empty, so it was not kept")
    return body


def write_private(path: Path, body: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "wb") as handle:
        handle.write(body)


def remote_keep(keys: list[str]) -> set[str]:
    """The newest 30 dumps, and the first dump of each of the 12 newest months."""
    ordered = sorted(keys)
    keep = set(ordered[-KEEP_DAILY:])
    first_of_month: dict[str, str] = {}
    for key in ordered:
        first_of_month.setdefault(key.removeprefix(PREFIX)[:7], key)
    for month in sorted(first_of_month)[-KEEP_MONTHLY:]:
        keep.add(first_of_month[month])
    return keep


def local_dumps(folder: Path) -> list[Path]:
    return sorted(path for path in folder.glob("*.dump") if NAME.fullmatch(path.name))


def run(deps: Deps) -> None:
    settings = deps.settings()
    out = deps.console
    started: datetime = deps.now()
    body = dump(deps, settings.compose_project)
    name = started.strftime("%Y-%m-%d_%H%M%S") + ".dump"
    write_private(settings.backup_dir / name, body)
    out.print(f"Dump: {name} ({len(body)} bytes), checked with pg_restore --list")

    try:
        bucket = deps.bucket(settings, settings.backup_bucket, settings.backup_token_service)
        etag = bucket.put(PREFIX + name, body, "application/octet-stream", None)
        if etag != hashlib.md5(body, usedforsecurity=False).hexdigest():
            raise CommandError("The bucket stored the dump with an ETag that does not match it")
        remote = [key for key in bucket.objects(PREFIX) if NAME.fullmatch(key.removeprefix(PREFIX))]
    except Exception as error:
        raise CommandError(f"Upload failed; the local dump is kept: {error}") from error
    out.print(f"Uploaded: {PREFIX}{name}")
    _retain(bucket, remote, settings.backup_dir, deps)
    out.print("OK")


def _retain(bucket: Bucket, remote: list[str], folder: Path, deps: Deps) -> None:
    keep = remote_keep(remote)
    gone = sorted(set(remote) - keep)
    if gone:
        bucket.delete(gone)
    copied = {key.removeprefix(PREFIX) for key in remote}
    old = local_dumps(folder)[:-KEEP_LOCAL]
    for path in old:
        # Never the only copy of a dump.
        if path.name in copied:
            path.unlink()
    deps.console.print(
        f"Kept: {len(keep)} in the bucket ({len(gone)} removed), "
        f"{len(local_dumps(folder))} on this Mac"
    )
