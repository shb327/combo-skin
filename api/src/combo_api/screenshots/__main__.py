"""Screenshot storage commands.

uv run python -m combo_api.screenshots init [--check]   # create the buckets; --check only checks
uv run python -m combo_api.screenshots rebuild          # remake every public version
uv run python -m combo_api.screenshots sweep [--dry-run] # delete unreferenced objects
"""

import argparse
import asyncio
import sys

from sqlalchemy.ext.asyncio import async_sessionmaker

from combo_api.db import create_engine
from combo_api.screenshots import commands
from combo_api.screenshots.storage import S3Storage
from combo_api.settings import SettingsError, load_settings


async def run(args: argparse.Namespace) -> int:
    settings = load_settings()
    storage = S3Storage(settings)
    if args.command == "init":
        return await commands.init(storage, check=args.check)
    engine = create_engine(settings)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            if args.command == "rebuild":
                return await commands.rebuild(db, storage)
            return await commands.sweep(db, storage, dry_run=args.dry_run)
    finally:
        await engine.dispose()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m combo_api.screenshots", description=(__doc__ or "").splitlines()[0]
    )
    subcommands = parser.add_subparsers(dest="command", required=True)
    command = subcommands.add_parser("init", help="create both buckets; the public one readable")
    command.add_argument("--check", action="store_true", help="only check that both exist")
    subcommands.add_parser("rebuild", help="remake every public version from its original")
    command = subcommands.add_parser("sweep", help="delete objects no row refers to")
    command.add_argument("--dry-run", action="store_true", help="list them, delete nothing")
    args = parser.parse_args(argv)
    try:
        return asyncio.run(run(args))
    except SettingsError as error:
        print(error, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
