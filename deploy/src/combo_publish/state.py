"""The state folder, outside the repository: the last production deployment, the data files
it holds, and when each image key was last used by a production publish. And the lock that
lets one publish or prune run at a time. Nothing here is a credential."""

import fcntl
import json
import os
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from types import TracebackType
from typing import IO, Any

STATE = "state.json"
LOCK = "publish.lock"


@dataclass
class Live:
    deployment: str
    commit: str
    at: str
    # The image keys this deployment references, which are never pruned while it is live.
    images: list[str] = field(default_factory=list)


@dataclass
class State:
    live: Live | None = None
    data_sha256: str | None = None
    # Each data file's path in the deploy and its SHA-256, to count changed files.
    data_files: dict[str, str] = field(default_factory=dict)
    # Each public image key and the date (YYYY-MM-DD) of the last production publish using it.
    images: dict[str, str] = field(default_factory=dict)


def load(state_dir: Path) -> State | None:
    """The state, or None when there is none yet (or it was lost)."""
    path = state_dir / STATE
    if not path.is_file():
        return None
    raw: dict[str, Any] = json.loads(path.read_text())
    live = raw.get("live")
    return State(
        live=Live(**live) if live else None,
        data_sha256=raw.get("data_sha256"),
        data_files=dict(raw.get("data_files", {})),
        images=dict(raw.get("images", {})),
    )


def save(state_dir: Path, state: State) -> None:
    state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    path = state_dir / STATE
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(asdict(state), indent=2, sort_keys=True) + "\n")
    temporary.chmod(0o600)
    os.replace(temporary, path)


class Busy(Exception):
    """Another publish or prune holds the lock."""


class Lock:
    """An exclusive lock on the state folder, released when the process ends in any way."""

    def __init__(self, state_dir: Path, command: str) -> None:
        self._path = state_dir / LOCK
        self._command = command
        self._file: IO[str] | None = None
        state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)

    def __enter__(self) -> Lock:
        handle = self._path.open("a+")
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            handle.seek(0)
            running = handle.read().strip() or "another run"
            handle.close()
            raise Busy(f"Another run is in progress: {running}. Wait for it to finish.") from None
        handle.seek(0)
        handle.truncate()
        started = datetime.now().astimezone().isoformat(timespec="seconds")
        handle.write(f"{self._command} (pid {os.getpid()}, started {started})")
        handle.flush()
        self._file = handle
        return self

    def __exit__(
        self,
        kind: type[BaseException] | None,
        error: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        if self._file is not None:
            self._file.seek(0)
            self._file.truncate()
            fcntl.flock(self._file, fcntl.LOCK_UN)
            self._file.close()
            self._file = None
