"""Child processes: git, npm, wrangler and docker. Each gets the environment it is given and
nothing else, so a credential reaches only the process that needs it."""

import os
import subprocess
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path


class ToolError(Exception):
    """A child process failed or could not start. The message has the end of its output."""


@dataclass(frozen=True)
class Tools:
    """The programs the command runs, by name on PATH or by path. Tests pass fakes."""

    git: str = "git"
    npm: str = "npm"
    node: str = "node"
    wrangler: str = "wrangler"
    docker: str = "docker"


def base_env(extra: Mapping[str, str] | None = None) -> dict[str, str]:
    """PATH, HOME, the locale and the temporary folder from this process, plus `extra`. Never
    the rest of the caller's environment, which may hold anything."""
    env = {
        name: os.environ[name] for name in ("PATH", "HOME", "LANG", "TMPDIR") if name in os.environ
    }
    env.update(extra or {})
    return env


def run(
    argv: Sequence[str],
    *,
    cwd: Path | None = None,
    env: Mapping[str, str] | None = None,
    stdin: bytes | None = None,
    what: str | None = None,
) -> bytes:
    """Runs a program and returns its stdout. A non-zero exit raises ToolError."""
    label = what or Path(argv[0]).name
    try:
        result = subprocess.run(  # noqa: S603
            list(argv),
            cwd=cwd,
            env=dict(env) if env is not None else base_env(),
            input=stdin if stdin is not None else b"",
            capture_output=True,
            check=False,
        )
    except OSError as error:
        raise ToolError(f"Could not run {label}: {error}") from error
    if result.returncode != 0:
        tail = (result.stderr or result.stdout).decode(errors="replace").strip()[-2000:]
        raise ToolError(f"{label} failed (exit {result.returncode}):\n{tail}")
    return result.stdout
