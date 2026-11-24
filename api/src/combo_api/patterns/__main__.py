"""Pattern group commands.

uv run python -m combo_api.patterns import           # load groups.json into the database
uv run python -m combo_api.patterns import --check   # check it, writing nothing
uv run python -m combo_api.patterns export-website [--check]   # the website's guide credits
"""

import argparse
import asyncio
import sys
from pathlib import Path

from sqlalchemy.ext.asyncio import async_sessionmaker

from combo_api.db import create_engine
from combo_api.patterns import export
from combo_api.patterns.data import PatternError, load_groups
from combo_api.patterns.importer import import_groups
from combo_api.settings import load_settings


async def run_import(check: bool) -> str:
    groups = load_groups()
    engine = create_engine(load_settings())
    try:
        async with async_sessionmaker(engine)() as session:
            counts = await import_groups(session, groups, check=check)
            if check:
                await session.rollback()
            else:
                await session.commit()
    finally:
        await engine.dispose()
    summary = (
        f"Pattern groups: {counts.inserted} inserted, {counts.updated} updated, "
        f"{counts.unchanged} unchanged"
    )
    return f"{summary} (check only: nothing written)" if check else summary


def import_(args: argparse.Namespace) -> int:
    try:
        print(asyncio.run(run_import(args.check)))
    except PatternError as error:
        print("The groups file was refused; nothing was written:", file=sys.stderr)
        for problem in error.problems:
            print(f"  {problem}", file=sys.stderr)
        return 1
    return 0


def export_website(args: argparse.Namespace) -> int:
    expected = export.render(load_groups())
    if args.check:
        current = args.output.read_text() if args.output.exists() else None
        if current != expected:
            print(
                f"{args.output.name} is out of date: run "
                "`uv run python -m combo_api.patterns export-website`",
                file=sys.stderr,
            )
            return 1
        return 0
    args.output.write_text(expected)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m combo_api.patterns")
    commands = parser.add_subparsers(required=True)
    importing = commands.add_parser("import", help="load groups.json into the database")
    importing.add_argument("--check", action="store_true", help="check only, write nothing")
    importing.set_defaults(run=import_)
    exporting = commands.add_parser("export-website", help="write the website's guide credits")
    exporting.add_argument("--check", action="store_true", help="fail if the copy is stale")
    exporting.add_argument("--output", type=Path, default=export.WEBSITE_EXPORT, help="file path")
    exporting.set_defaults(run=export_website)
    args = parser.parse_args(argv)
    result: int = args.run(args)
    return result


if __name__ == "__main__":
    sys.exit(main())
