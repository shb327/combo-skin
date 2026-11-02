import os
import subprocess
import sys
from collections.abc import Callable, Iterable
from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.admins import cli, passwords
from combo_api.admins.models import Admin
from combo_api.settings import Settings
from tests.admins.support import (
    OTHER_PASSWORD,
    OTHER_USERNAME,
    PASSWORD,
    USERNAME,
    ClientFactory,
    login,
)

pytestmark = pytest.mark.anyio

NEW_PASSWORD = "a brand new placeholder password"


def prompts(*entries: str) -> Callable[[str], str]:
    """A prompt that answers with the given entries, then behaves like Ctrl-D."""
    answers = iter(entries)

    def prompt(_: str) -> str:
        try:
            return next(answers)
        except StopIteration:
            raise EOFError from None

    return prompt


async def run(
    db_session: AsyncSession,
    test_settings: Settings,
    *argv: str,
    entries: Iterable[str] = (),
    interactive: bool = True,
) -> int:
    return await cli.run(
        list(argv),
        db_session,
        test_settings,
        prompt=prompts(*entries),
        interactive=lambda: interactive,
    )


async def stored(db_session: AsyncSession, username: str) -> Admin | None:
    row: Admin | None = await db_session.scalar(select(Admin).where(Admin.username == username))
    return row


async def test_create(
    db_session: AsyncSession, test_settings: Settings, capsys: pytest.CaptureFixture[str]
) -> None:
    code = await run(db_session, test_settings, "create", USERNAME, entries=[PASSWORD, PASSWORD])
    assert code == 0
    row = await stored(db_session, USERNAME)
    assert row is not None and row.active
    assert row.password_hash != PASSWORD
    assert passwords.verify(row.password_hash, PASSWORD)
    out = capsys.readouterr()
    assert USERNAME in out.out
    assert PASSWORD not in out.out + out.err
    assert row.password_hash not in out.out + out.err


@pytest.mark.parametrize(
    ("entries", "words"),
    [
        ([PASSWORD, PASSWORD + "x"], "do not match"),
        (["fourteen chars"] * 2, "at least 15"),
        (["IloveYouForever"] * 2, "common"),
        ([f"my {USERNAME} password"] * 2, "username"),
    ],
)
async def test_create_refuses_bad_passwords(
    db_session: AsyncSession,
    test_settings: Settings,
    capsys: pytest.CaptureFixture[str],
    entries: list[str],
    words: str,
) -> None:
    code = await run(db_session, test_settings, "create", USERNAME, entries=entries)
    assert code == 1
    assert await stored(db_session, USERNAME) is None
    out = capsys.readouterr()
    assert words in out.out + out.err
    for entry in entries:
        assert entry not in out.out + out.err


async def test_create_asks_again_after_a_refused_password(
    db_session: AsyncSession, test_settings: Settings
) -> None:
    entries = ["fourteen chars", "fourteen chars", PASSWORD, PASSWORD]
    assert await run(db_session, test_settings, "create", USERNAME, entries=entries) == 0
    row = await stored(db_session, USERNAME)
    assert row is not None and passwords.verify(row.password_hash, PASSWORD)


async def test_passwords_need_a_terminal(
    db_session: AsyncSession,
    test_settings: Settings,
    capsys: pytest.CaptureFixture[str],
    admin: int,
) -> None:
    before = await stored(db_session, USERNAME)
    assert before is not None
    old_hash = before.password_hash
    for argv in (["create", OTHER_USERNAME], ["set-password", USERNAME]):
        code = await run(
            db_session, test_settings, *argv, entries=[NEW_PASSWORD] * 2, interactive=False
        )
        assert code == 1
        assert "terminal" in capsys.readouterr().err
    assert await stored(db_session, OTHER_USERNAME) is None
    after = await stored(db_session, USERNAME)
    assert after is not None and after.password_hash == old_hash
    assert passwords.verify(after.password_hash, PASSWORD)


@pytest.mark.parametrize("command", ["create", "set-password"])
def test_real_pipe_is_refused(command: str, tmp_path: Path) -> None:
    env = {key: value for key, value in os.environ.items() if not key.startswith("POSTGRES_")}
    result = subprocess.run(  # noqa: S603
        [sys.executable, "-m", "combo_api.admins", command, USERNAME],
        input=f"{PASSWORD}\n{PASSWORD}\n",
        env=env,
        capture_output=True,
        text=True,
        check=False,
        cwd=tmp_path,
    )
    assert result.returncode == 1
    assert "terminal" in result.stderr
    assert PASSWORD not in result.stdout + result.stderr


def test_help_has_no_password_option() -> None:
    result = subprocess.run(
        [sys.executable, "-m", "combo_api.admins", "create", "--help"],
        capture_output=True,
        text=True,
        check=True,
    )
    assert "password" not in result.stdout.replace("set-password", "").lower()


async def test_commands_never_print_secrets(
    db_session: AsyncSession, test_settings: Settings, capsys: pytest.CaptureFixture[str]
) -> None:
    hashes = []
    assert await run(db_session, test_settings, "create", USERNAME, entries=[PASSWORD] * 2) == 0
    row = await stored(db_session, USERNAME)
    assert row is not None
    hashes.append(row.password_hash)
    code = await run(
        db_session, test_settings, "set-password", USERNAME, entries=[NEW_PASSWORD] * 2
    )
    assert code == 0
    hashes.append(row.password_hash)
    assert hashes[0] != hashes[1]
    for argv in (["disable", USERNAME], ["enable", USERNAME], ["list"]):
        assert await run(db_session, test_settings, *argv) == 0
    out = capsys.readouterr()
    for secret in (PASSWORD, NEW_PASSWORD, *hashes):
        assert secret not in out.out + out.err


@pytest.mark.parametrize(
    "argv",
    [
        ["create", USERNAME],
        ["set-password", "nobody-here"],
        ["disable", "nobody-here"],
        ["enable", "nobody-here"],
        ["create", "Not Valid"],
    ],
)
async def test_unknown_or_duplicate_usernames_fail(
    db_session: AsyncSession, test_settings: Settings, admin: int, argv: list[str]
) -> None:
    assert await run(db_session, test_settings, *argv, entries=[OTHER_PASSWORD] * 2) == 1


async def two_sessions(clients: ClientFactory) -> list[AsyncClient]:
    sessions = [clients("127.0.0.1"), clients("127.0.0.2")]
    for client in sessions:
        assert (await login(client)).status_code == 200
        assert (await client.get("/admin/me")).status_code == 200
    return sessions


async def test_disable_and_enable(
    db_session: AsyncSession,
    test_settings: Settings,
    clients: ClientFactory,
    admin: int,
    capsys: pytest.CaptureFixture[str],
) -> None:
    sessions = await two_sessions(clients)
    assert await run(db_session, test_settings, "disable", USERNAME) == 0
    assert "2 sessions ended" in capsys.readouterr().out
    for client in sessions:
        assert (await client.get("/admin/me")).status_code == 401
    refused = await login(clients("127.0.0.3"))
    assert refused.status_code == 401
    assert refused.json() == {"detail": "invalid_credentials"}

    assert await run(db_session, test_settings, "enable", USERNAME) == 0
    assert (await login(clients("127.0.0.4"))).status_code == 200
    for client in sessions:
        assert (await client.get("/admin/me")).status_code == 401


async def test_set_password_ends_sessions(
    db_session: AsyncSession, test_settings: Settings, clients: ClientFactory, admin: int
) -> None:
    sessions = await two_sessions(clients)
    code = await run(
        db_session, test_settings, "set-password", USERNAME, entries=[NEW_PASSWORD] * 2
    )
    assert code == 0
    for client in sessions:
        assert (await client.get("/admin/me")).status_code == 401
    assert (await login(clients("127.0.0.3"))).status_code == 401
    assert (await login(clients("127.0.0.4"), password=NEW_PASSWORD)).status_code == 200


async def test_list(
    db_session: AsyncSession,
    test_settings: Settings,
    clients: ClientFactory,
    admin: int,
    other_admin: int,
    capsys: pytest.CaptureFixture[str],
) -> None:
    await two_sessions(clients)
    await run(db_session, test_settings, "disable", OTHER_USERNAME)
    capsys.readouterr()
    assert await run(db_session, test_settings, "list") == 0
    lines = capsys.readouterr().out.splitlines()
    assert lines[0].split() == ["username", "enabled", "created", "last", "login", "sessions"]
    rows = {
        admin: await db_session.get(Admin, admin),
        other_admin: await db_session.get(Admin, other_admin),
    }
    first_row, second_row = rows[admin], rows[other_admin]
    assert first_row is not None and second_row is not None
    assert first_row.last_login_at is not None
    assert lines[1].split() == [
        USERNAME,
        "yes",
        first_row.created_at.strftime("%Y-%m-%dT%H:%MZ"),
        first_row.last_login_at.strftime("%Y-%m-%dT%H:%MZ"),
        "2",
    ]
    assert lines[2].split() == [
        OTHER_USERNAME,
        "no",
        second_row.created_at.strftime("%Y-%m-%dT%H:%MZ"),
        "never",
        "0",
    ]
