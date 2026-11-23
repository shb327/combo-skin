from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest

from combo_publish import bucket, http, keychain
from tests.support import World


def _refuse(*args: Any, **kwargs: Any) -> Any:
    raise AssertionError("A test reached the real Keychain, R2 or network")


@pytest.fixture(autouse=True)
def no_real_services(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """No test can read the real Keychain, open a real bucket or fetch a real URL: every one
    runs on fakes, so nothing can be uploaded, deployed or deleted by accident."""
    monkeypatch.setattr(keychain.MacKeychain, "has", _refuse)
    monkeypatch.setattr(keychain.MacKeychain, "read", _refuse)
    monkeypatch.setattr(bucket.R2Bucket, "__init__", _refuse)
    monkeypatch.setattr(http.UrlHttp, "get", _refuse)
    yield


@pytest.fixture
def world(tmp_path: Path) -> World:
    return World(tmp_path)
