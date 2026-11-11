"""Catalog commands.

uv run python -m combo_api.catalog refresh --commit <sha>    # rewrite snapshot.json
uv run python -m combo_api.catalog import                   # load snapshot.json into the database
uv run python -m combo_api.catalog export-website [--check] # write or check the website's copies
uv run python -m combo_api.catalog copy-images [--check]    # copy the pictures to our bucket
"""

import argparse
import asyncio
import sys
from pathlib import Path

from sqlalchemy.ext.asyncio import async_sessionmaker

from combo_api.catalog import export, images, source
from combo_api.catalog.importer import import_snapshot
from combo_api.catalog.snapshot import (
    DISPLAY_ORDER,
    SLUG_OVERRIDES,
    SNAPSHOT,
    CatalogError,
    DisplayOrder,
    Snapshot,
    dump_snapshot,
    load_display_order,
    load_slug_overrides,
    load_snapshot,
    unlisted,
)
from combo_api.catalog.validate import validate
from combo_api.db import create_engine
from combo_api.screenshots.storage import S3Storage
from combo_api.settings import SettingsError, load_settings


def report_unlisted(snapshot: Snapshot, order: DisplayOrder) -> None:
    names = unlisted(snapshot, order)
    if names:
        print(f"Not placed in {DISPLAY_ORDER.name} yet, shown last:", file=sys.stderr)
        for name in names:
            print(f"  {name}", file=sys.stderr)


def refresh(args: argparse.Namespace) -> int:
    order = load_display_order(args.display_order)
    previous = load_snapshot(args.snapshot) if args.snapshot.exists() else None
    raw = source.download(args.commit)
    raw_agents = source.download(args.commit, source.AGENTS_FILE)
    snapshot = source.normalise(
        raw, raw_agents, args.commit, previous, load_slug_overrides(SLUG_OVERRIDES)
    )
    validate(snapshot, order)
    args.snapshot.write_text(dump_snapshot(snapshot))
    types = len(snapshot.item_types)
    finishes = sum(len(t.finishes) for t in snapshot.item_types)
    agents = len(snapshot.agents)
    print(f"Wrote {args.snapshot.name}: {types} types, {finishes} finishes, {agents} agents")
    if previous is not None:
        retired, back = source.retirement_changes(previous, snapshot)
        since = previous.source.commit[:12]
        for heading, names in (
            (f"Retired since {since}:", retired),
            (f"Back since {since}:", back),
        ):
            if names:
                print(heading, file=sys.stderr)
                for name in names:
                    print(f"  {name}", file=sys.stderr)
    report_unlisted(snapshot, order)
    return 0


async def run_import() -> str:
    snapshot, order = load_snapshot(), load_display_order()
    engine = create_engine(load_settings())
    try:
        async with async_sessionmaker(engine)() as session, session.begin():
            counts = await import_snapshot(session, snapshot, order)
    finally:
        await engine.dispose()
    return (
        f"Catalog {snapshot.source.commit[:12]}: {counts.inserted} inserted, "
        f"{counts.updated} updated, {counts.deactivated} deactivated, "
        f"{counts.unchanged} unchanged"
    )


def import_(_: argparse.Namespace) -> int:
    print(asyncio.run(run_import()))
    return 0


def export_website(args: argparse.Namespace) -> int:
    snapshot, order = load_snapshot(args.snapshot), load_display_order()
    validate(snapshot, order)
    files = [
        (args.output, export.render(snapshot, order)),
        (args.agents_output, export.render_agents(snapshot)),
    ]
    report_unlisted(snapshot, order)
    if args.check:
        stale = [path for path, expected in files if read(path) != expected]
        for path in stale:
            print(
                f"{path.name} is out of date: run "
                "`uv run python -m combo_api.catalog export-website`",
                file=sys.stderr,
            )
        return 1 if stale else 0
    for path, expected in files:
        path.write_text(expected)
    return 0


def copy_images(args: argparse.Namespace) -> int:
    try:
        storage = S3Storage(load_settings())
    except SettingsError as error:
        print(error, file=sys.stderr)
        return 1
    return asyncio.run(images.copy(load_snapshot(), storage, check=args.check))


def read(path: Path) -> str:
    return path.read_text() if path.exists() else ""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    commands = parser.add_subparsers(required=True)

    command = commands.add_parser("refresh", help="rewrite the snapshot from the source dataset")
    command.add_argument("--commit", required=True, help="full commit SHA of the source dataset")
    command.add_argument("--snapshot", type=Path, default=SNAPSHOT, help=argparse.SUPPRESS)
    command.add_argument(
        "--display-order", type=Path, default=DISPLAY_ORDER, help=argparse.SUPPRESS
    )
    command.set_defaults(run=refresh)

    command = commands.add_parser("import", help="load the snapshot into the database")
    command.set_defaults(run=import_)

    command = commands.add_parser("export-website", help="write the website's copies")
    command.add_argument("--check", action="store_true", help="fail if the copy is stale")
    command.add_argument("--output", type=Path, default=export.WEBSITE_EXPORT, help="file path")
    command.add_argument(
        "--agents-output", type=Path, default=export.AGENTS_EXPORT, help="agents file path"
    )
    command.add_argument("--snapshot", type=Path, default=SNAPSHOT, help=argparse.SUPPRESS)
    command.set_defaults(run=export_website)

    command = commands.add_parser(
        "copy-images", help="copy every finish's and agent's picture to the public bucket"
    )
    command.add_argument("--check", action="store_true", help="only report missing copies")
    command.set_defaults(run=copy_images)

    args = parser.parse_args(argv)
    try:
        code: int = args.run(args)
    except CatalogError as error:
        print(error, file=sys.stderr)
        return 1
    return code


if __name__ == "__main__":
    sys.exit(main())
