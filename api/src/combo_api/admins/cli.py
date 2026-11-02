"""Admin accounts, managed from the command line only.

uv run python -m combo_api.admins create <username>         # prompts for a password
uv run python -m combo_api.admins set-password <username>   # prompts; ends all its sessions
uv run python -m combo_api.admins disable <username>        # ends all its sessions
uv run python -m combo_api.admins enable <username>
uv run python -m combo_api.admins list
"""

import argparse
import asyncio
import getpass
import logging
import sys
from collections.abc import Callable
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from combo_api.admins import accounts, passwords
from combo_api.admins.accounts import AccountError
from combo_api.db import create_engine
from combo_api.settings import Settings, SettingsError, load_settings

PASSWORD_COMMANDS = ("create", "set-password")
ATTEMPTS = 3

Prompt = Callable[[str], str]


def parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m combo_api.admins", description=(__doc__ or "").splitlines()[0]
    )
    commands = parser.add_subparsers(dest="command", required=True)
    for name, text in (
        ("create", "create an admin; asks for its password"),
        ("set-password", "give an admin a new password; ends all its sessions"),
        ("disable", "disable an admin; ends all its sessions"),
        ("enable", "enable a disabled admin"),
    ):
        commands.add_parser(name, help=text).add_argument("username")
    commands.add_parser("list", help="list admins")
    return parser


def ask_password(prompt: Prompt, username: str) -> str:
    """Ask twice, at a hidden prompt, until a password follows the rules."""
    for _ in range(ATTEMPTS):
        password = prompt("New password: ")
        if prompt("Repeat the password: ") != password:
            print("The passwords do not match.")
            continue
        problem = passwords.password_problem(password, username)
        if problem:
            print(problem)
            continue
        return password
    raise AccountError("No password was set.")


def when(moment: datetime | None) -> str:
    return moment.strftime("%Y-%m-%dT%H:%MZ") if moment else "never"


async def run(
    argv: list[str],
    db: AsyncSession,
    settings: Settings,
    *,
    prompt: Prompt = getpass.getpass,
    interactive: Callable[[], bool] = sys.stdin.isatty,
) -> int:
    args = parser().parse_args(argv)
    if args.command in PASSWORD_COMMANDS and not interactive():
        print("Passwords are only read from an interactive terminal.", file=sys.stderr)
        return 1
    try:
        if args.command == "create":
            username = accounts.check_username(args.username.lower())
            if await accounts.find(db, username) is not None:
                raise AccountError(f"An admin called {username!r} already exists.")
            await accounts.create(db, username, ask_password(prompt, username))
            print(f"Created admin {username}.")
        elif args.command == "set-password":
            admin = await accounts.get(db, args.username)
            ended = await accounts.set_password(
                db, admin, ask_password(prompt, admin.username), settings
            )
            print(f"New password set for {admin.username}; {ended} sessions ended.")
        elif args.command == "disable":
            admin = await accounts.get(db, args.username)
            ended = await accounts.disable(db, admin, settings)
            print(f"Disabled {admin.username}; {ended} sessions ended.")
        elif args.command == "enable":
            admin = await accounts.get(db, args.username)
            await accounts.enable(db, admin)
            print(f"Enabled {admin.username}.")
        else:
            rows = [("username", "enabled", "created", "last login", "sessions")]
            rows += [
                (
                    s.username,
                    "yes" if s.active else "no",
                    when(s.created_at),
                    when(s.last_login_at),
                    str(s.live_sessions),
                )
                for s in await accounts.summaries(db, settings)
            ]
            widths = [max(len(row[i]) for row in rows) for i in range(len(rows[0]))]
            for row in rows:
                print("  ".join(cell.ljust(width) for cell, width in zip(row, widths, strict=True)))
    except AccountError as error:
        print(error, file=sys.stderr)
        return 1
    except EOFError, KeyboardInterrupt:
        print("\nCancelled. Nothing was changed.", file=sys.stderr)
        return 1
    return 0


async def run_with_database(argv: list[str], settings: Settings) -> int:
    engine = create_engine(settings)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            return await run(argv, db, settings)
    finally:
        await engine.dispose()


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    args = parser().parse_args(argv)
    if args.command in PASSWORD_COMMANDS and not sys.stdin.isatty():
        print("Passwords are only read from an interactive terminal.", file=sys.stderr)
        return 1
    try:
        settings = load_settings()
    except SettingsError as error:
        print(error, file=sys.stderr)
        return 1
    logging.basicConfig(
        level=settings.log_level.upper(), format="%(asctime)s %(levelname)s %(name)s %(message)s"
    )
    return asyncio.run(run_with_database(argv, settings))
