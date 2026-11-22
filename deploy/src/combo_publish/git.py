"""The git commands the publish command needs. None of them changes the checkout's files,
branch, index or stash: `fetch` updates remote refs only."""

import io
import tarfile
from pathlib import Path

from combo_publish.app import CommandError
from combo_publish.proc import Tools, run

MAIN = "origin/main"


class Git:
    def __init__(self, tools: Tools, repo: Path) -> None:
        self._git = tools.git
        self.repo = repo

    def _run(self, *args: str) -> bytes:
        return run([self._git, "-C", str(self.repo), *args], what=f"git {args[0]}")

    def fetch(self) -> None:
        self._run("fetch", "--quiet", "origin")

    def commit(self, ref: str) -> str:
        """The full id of the commit `ref` names."""
        return self._run("rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}").decode().strip()

    def is_ancestor(self, commit: str, of: str) -> bool:
        try:
            self._run("merge-base", "--is-ancestor", commit, of)
        except Exception:
            return False
        return True

    def behind(self, commit: str, ref: str = MAIN) -> int:
        """How many commits `ref` has that `commit` does not."""
        return int(self._run("rev-list", "--count", f"{commit}..{ref}").decode().strip())

    def subject(self, commit: str) -> str:
        return self._run("log", "-1", "--format=%s", commit).decode().strip()

    def show(self, commit: str, path: str) -> bytes:
        return self._run("show", f"{commit}:{path}")

    def archive(self, commit: str, dest: Path) -> None:
        """Writes the commit's files into `dest`, which must be outside the repository."""
        if dest.resolve().is_relative_to(self.repo.resolve()):
            raise CommandError("The build folder must be outside the repository")
        data = self._run("archive", "--format=tar", commit)
        with tarfile.open(fileobj=io.BytesIO(data)) as tar:
            tar.extractall(dest, filter="data")
