"""What every command runs with. `cli.py` builds the real one; tests build one of fakes."""

import json
import tempfile
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any

from combo_publish.bucket import Bucket, BucketFactory
from combo_publish.console import Console
from combo_publish.http import Http, HttpError
from combo_publish.keychain import Keychain, R2Credentials, r2_credentials
from combo_publish.proc import Tools
from combo_publish.settings import Settings, load


class CommandError(Exception):
    """A command stops with this message and exit code 1."""


@dataclass
class Deps:
    repo: Path
    settings_path: Path
    http: Http
    keychain: Keychain
    buckets: BucketFactory
    tools: Tools
    console: Console
    today: Callable[[], date]
    now: Callable[[], datetime]
    sleep: Callable[[float], None]
    # Where temporary build folders go; the system's temporary folder by default.
    temp_root: Path | None = None

    def settings(self) -> Settings:
        return load(self.settings_path)

    def secret(self, service: str) -> str:
        return self.console.secret(self.keychain.read(service))

    def r2(self, service: str) -> R2Credentials:
        credentials = r2_credentials(self.keychain, service)
        self.console.secret(credentials.access_key_id)
        self.console.secret(credentials.secret_access_key)
        return credentials

    def bucket(self, settings: Settings, name: str, service: str) -> Bucket:
        return self.buckets(settings.account_id, name, self.r2(service))

    @contextmanager
    def workdir(self) -> Iterator[Path]:
        with tempfile.TemporaryDirectory(prefix="combo-publish-", dir=self.temp_root) as path:
            yield Path(path)

    def local_json(self, settings: Settings, path: str) -> Any:
        url = settings.local_api_url + path
        try:
            answer = self.http.get(url)
        except HttpError as error:
            raise CommandError(f"The local API did not answer: {error}") from error
        if answer.status != 200:
            raise CommandError(f"The local API answered {path} with {answer.status}")
        return json.loads(answer.body)


def megabytes(size: int) -> str:
    return f"{size / 1_000_000:.1f} MB"
