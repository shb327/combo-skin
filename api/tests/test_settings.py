import pytest

from combo_api.main import create_app
from combo_api.settings import Settings, SettingsError, load_settings
from tests.support import API_DIR

SAMPLE_VALUE = "placeholder-db-credential"
REQUIRED = ["POSTGRES_HOST", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB"]


@pytest.fixture
def full_env(monkeypatch: pytest.MonkeyPatch) -> pytest.MonkeyPatch:
    monkeypatch.setenv("POSTGRES_HOST", "db")
    monkeypatch.setenv("POSTGRES_PORT", "5432")
    monkeypatch.setenv("POSTGRES_USER", "combo")
    monkeypatch.setenv("POSTGRES_PASSWORD", SAMPLE_VALUE)
    monkeypatch.setenv("POSTGRES_DB", "combo")
    return monkeypatch


def test_loads_from_environment(full_env: pytest.MonkeyPatch) -> None:
    settings = load_settings(env_file=None)
    assert settings.postgres_host == "db"
    assert settings.postgres_port == 5432
    assert settings.postgres_password.get_secret_value() == SAMPLE_VALUE
    assert settings.log_level == "info"
    assert settings.docs_enabled is True


@pytest.mark.parametrize("name", REQUIRED)
def test_missing_required_setting_names_it(full_env: pytest.MonkeyPatch, name: str) -> None:
    full_env.delenv(name)
    with pytest.raises(SettingsError) as error:
        load_settings(env_file=None)
    assert name in str(error.value)
    assert SAMPLE_VALUE not in str(error.value)


def test_invalid_setting_names_it_without_values(full_env: pytest.MonkeyPatch) -> None:
    full_env.setenv("POSTGRES_PORT", "not-a-port")
    with pytest.raises(SettingsError) as error:
        load_settings(env_file=None)
    assert "POSTGRES_PORT" in str(error.value)
    assert "not-a-port" not in str(error.value)
    assert SAMPLE_VALUE not in str(error.value)


def test_password_not_in_repr(full_env: pytest.MonkeyPatch) -> None:
    settings = load_settings(env_file=None)
    assert SAMPLE_VALUE not in repr(settings)
    assert SAMPLE_VALUE not in str(settings)
    assert SAMPLE_VALUE not in repr(settings.database_url())


@pytest.mark.anyio
async def test_startup_fails_without_settings(full_env: pytest.MonkeyPatch) -> None:
    full_env.delenv("POSTGRES_HOST")
    app = create_app(env_file=None)
    with pytest.raises(SettingsError) as error:
        async with app.router.lifespan_context(app):
            pass
    assert "POSTGRES_HOST" in str(error.value)
    assert SAMPLE_VALUE not in str(error.value)


def test_env_example_lists_every_setting() -> None:
    lines = (API_DIR / ".env.example").read_text().splitlines()
    keys = {line.split("=", 1)[0] for line in lines if line and not line.startswith("#")}
    assert keys == {name.upper() for name in Settings.model_fields}
