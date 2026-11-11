"""The local Compose stack gives each container only the settings it uses: the API's
containers all of `api/.env`, the database and the storage service only their own."""

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

import pytest

from tests.support import API_DIR

REPO = API_DIR.parent
POSTGRES = {"POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB"}
STORAGE = {"RUSTFS_ACCESS_KEY", "RUSTFS_SECRET_KEY"}

DOCKER = shutil.which("docker")

pytestmark = pytest.mark.skipif(DOCKER is None, reason="needs docker compose")


def config(tmp_path: Path, env: str) -> Any:
    """`docker compose config` of a copy of the Compose files with this `api/.env`."""
    for name in ("compose.yaml", "compose.services.yaml"):
        shutil.copy(REPO / name, tmp_path / name)
    (tmp_path / "api").mkdir()
    (tmp_path / "api" / ".env").write_text(env)
    # Compose takes variables from its own environment before api/.env (CI sets the API's
    # settings there), so leave them out: only the file under test may supply them.
    settings = keys(example())
    environment = {k: v for k, v in os.environ.items() if k not in settings}
    # Fixed arguments; only the temporary directory varies.
    return subprocess.run(  # noqa: S603
        [
            str(DOCKER),
            "compose",
            "--project-directory",
            str(tmp_path),
            "config",
            "--format",
            "json",
        ],
        cwd=tmp_path,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )


def example() -> str:
    return (API_DIR / ".env.example").read_text()


def keys(env: str) -> set[str]:
    return {line.split("=", 1)[0] for line in env.splitlines() if "=" in line and line[0] != "#"}


def test_each_container_gets_only_its_settings(tmp_path: Path) -> None:
    result = config(tmp_path, example())
    assert result.returncode == 0, result.stderr
    services = json.loads(result.stdout)["services"]
    assert set(services["db"]["environment"]) == POSTGRES
    assert set(services["storage"]["environment"]) == STORAGE
    for name in ("migrate", "catalog", "storage-init", "api"):
        assert keys(example()) <= set(services[name]["environment"]), name


def test_storage_credentials_come_from_api_env(tmp_path: Path) -> None:
    env = example()
    result = config(tmp_path, env)
    storage = json.loads(result.stdout)["services"]["storage"]["environment"]
    values = dict(line.split("=", 1) for line in env.splitlines() if "=" in line and line[0] != "#")
    assert storage["RUSTFS_ACCESS_KEY"] == values["STORAGE_ACCESS_KEY_ID"]
    assert storage["RUSTFS_SECRET_KEY"] == values["STORAGE_SECRET_ACCESS_KEY"]


@pytest.mark.parametrize("missing", ["POSTGRES_PASSWORD", "STORAGE_SECRET_ACCESS_KEY"])
def test_a_missing_value_stops_compose_naming_it(tmp_path: Path, missing: str) -> None:
    env = "\n".join(line for line in example().splitlines() if not line.startswith(f"{missing}="))
    result = config(tmp_path, env)
    assert result.returncode != 0
    assert missing in result.stderr
