import logging

import pytest

from combo_api.main import create_app
from combo_api.settings import Settings, SettingsError, load_settings
from tests.support import API_DIR

SAMPLE_VALUE = "placeholder-db-credential"
STORAGE_SECRET = "placeholder-storage-credential"
REQUIRED = [
    "POSTGRES_HOST",
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "POSTGRES_DB",
    "STORAGE_ENDPOINT_URL",
    "STORAGE_ACCESS_KEY_ID",
    "STORAGE_SECRET_ACCESS_KEY",
    "STORAGE_ORIGINALS_BUCKET",
    "STORAGE_PUBLIC_BUCKET",
    "IMAGE_BASE_URL",
]


@pytest.fixture
def full_env(monkeypatch: pytest.MonkeyPatch) -> pytest.MonkeyPatch:
    monkeypatch.setenv("POSTGRES_HOST", "db")
    monkeypatch.setenv("POSTGRES_PORT", "5432")
    monkeypatch.setenv("POSTGRES_USER", "combo")
    monkeypatch.setenv("POSTGRES_PASSWORD", SAMPLE_VALUE)
    monkeypatch.setenv("POSTGRES_DB", "combo")
    monkeypatch.setenv("STORAGE_ENDPOINT_URL", "http://storage:9000")
    monkeypatch.setenv("STORAGE_ACCESS_KEY_ID", "placeholder-key")
    monkeypatch.setenv("STORAGE_SECRET_ACCESS_KEY", STORAGE_SECRET)
    monkeypatch.setenv("STORAGE_ORIGINALS_BUCKET", "local-originals")
    monkeypatch.setenv("STORAGE_PUBLIC_BUCKET", "local-images")
    monkeypatch.setenv("IMAGE_BASE_URL", "http://localhost:9000/local-images")
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
    assert STORAGE_SECRET not in str(error.value)


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
@pytest.mark.parametrize("name", REQUIRED)
async def test_startup_fails_without_settings(full_env: pytest.MonkeyPatch, name: str) -> None:
    full_env.delenv(name)
    app = create_app(env_file=None)
    with pytest.raises(SettingsError) as error:
        async with app.router.lifespan_context(app):
            pass
    assert name in str(error.value)
    assert SAMPLE_VALUE not in str(error.value)


def test_env_example_lists_every_setting() -> None:
    lines = (API_DIR / ".env.example").read_text().splitlines()
    keys = {line.split("=", 1)[0] for line in lines if line and not line.startswith("#")}
    assert keys == {name.upper() for name in Settings.model_fields}


@pytest.mark.anyio
async def test_log_level_applies_to_app_and_uvicorn_loggers(full_env: pytest.MonkeyPatch) -> None:
    full_env.setenv("LOG_LEVEL", "warning")
    app = create_app(env_file=None)
    async with app.router.lifespan_context(app):
        for name in ("combo_api", "uvicorn", "uvicorn.error", "uvicorn.access"):
            assert logging.getLogger(name).level == logging.WARNING, name


def test_admin_defaults(full_env: pytest.MonkeyPatch) -> None:
    settings = load_settings(env_file=None)
    assert settings.admin_origins == []
    assert settings.session_cookie_secure is True
    assert settings.session_idle_minutes == 60
    assert settings.session_max_hours == 12
    assert settings.trusted_proxies == []


def test_admin_lists_are_comma_separated(full_env: pytest.MonkeyPatch) -> None:
    full_env.setenv("ADMIN_ORIGINS", "https://admin.example.test, http://localhost:5174")
    full_env.setenv("TRUSTED_PROXIES", "10.0.0.1, 172.16.0.0/12, ::1")
    settings = load_settings(env_file=None)
    assert settings.admin_origins == ["https://admin.example.test", "http://localhost:5174"]
    assert [str(network) for network in settings.trusted_proxies] == [
        "10.0.0.1/32",
        "172.16.0.0/12",
        "::1/128",
    ]


@pytest.mark.parametrize(
    "value",
    [
        "*",
        "http://localhost:5174/",
        "http://localhost:5174/admin",
        "localhost:5174",
        "ftp://localhost",
        "http://localhost:5174, *",
    ],
)
def test_invalid_admin_origins_are_refused(full_env: pytest.MonkeyPatch, value: str) -> None:
    full_env.setenv("ADMIN_ORIGINS", value)
    with pytest.raises(SettingsError) as error:
        load_settings(env_file=None)
    assert "ADMIN_ORIGINS" in str(error.value)


@pytest.mark.parametrize("value", ["proxy", "10.0.0.300", "10.0.0.0/33"])
def test_invalid_trusted_proxies_are_refused(full_env: pytest.MonkeyPatch, value: str) -> None:
    full_env.setenv("TRUSTED_PROXIES", value)
    with pytest.raises(SettingsError) as error:
        load_settings(env_file=None)
    assert "TRUSTED_PROXIES" in str(error.value)


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("SESSION_IDLE_MINUTES", "4"),
        ("SESSION_IDLE_MINUTES", "1441"),
        ("SESSION_MAX_HOURS", "0"),
        ("SESSION_MAX_HOURS", "25"),
    ],
)
def test_session_lifetimes_are_bounded(full_env: pytest.MonkeyPatch, name: str, value: str) -> None:
    full_env.setenv(name, value)
    with pytest.raises(SettingsError) as error:
        load_settings(env_file=None)
    assert name in str(error.value)


def test_idle_lifetime_cannot_exceed_absolute(full_env: pytest.MonkeyPatch) -> None:
    full_env.setenv("SESSION_MAX_HOURS", "1")
    full_env.setenv("SESSION_IDLE_MINUTES", "61")
    with pytest.raises(SettingsError) as error:
        load_settings(env_file=None)
    assert "SESSION_IDLE_MINUTES" in str(error.value)


@pytest.mark.anyio
async def test_app_logs_reach_standard_error(full_env: pytest.MonkeyPatch) -> None:
    app = create_app(env_file=None)
    async with app.router.lifespan_context(app):
        handlers = logging.getLogger("combo_api").handlers
        assert [h for h in handlers if isinstance(h, logging.StreamHandler)]
    async with app.router.lifespan_context(app):
        assert logging.getLogger("combo_api").handlers == handlers


def test_storage_settings(full_env: pytest.MonkeyPatch) -> None:
    settings = load_settings(env_file=None)
    assert settings.storage_endpoint_url == "http://storage:9000"
    assert settings.storage_region == "auto"
    assert settings.storage_secret_access_key.get_secret_value() == STORAGE_SECRET
    assert STORAGE_SECRET not in repr(settings)
    assert settings.image_base_url == "http://localhost:9000/local-images"


@pytest.mark.parametrize(
    ("value", "stored"),
    [
        ("https://images.example.com", "https://images.example.com"),
        ("https://images.example.com/", "https://images.example.com"),
        ("https://example.com/images/", "https://example.com/images"),
        ("http://localhost:9000/local-images", "http://localhost:9000/local-images"),
        ("http://127.0.0.1:9000", "http://127.0.0.1:9000"),
    ],
)
def test_image_base_url(full_env: pytest.MonkeyPatch, value: str, stored: str) -> None:
    full_env.setenv("IMAGE_BASE_URL", value)
    assert load_settings(env_file=None).image_base_url == stored


@pytest.mark.parametrize(
    "value",
    [
        "http://images.example.com",
        "ftp://images.example.com",
        "images.example.com",
        "https://images.example.com?x=1",
        "https://images.example.com/#top",
        "https://user@images.example.com",
    ],
)
def test_invalid_image_base_url(full_env: pytest.MonkeyPatch, value: str) -> None:
    full_env.setenv("IMAGE_BASE_URL", value)
    with pytest.raises(SettingsError) as error:
        load_settings(env_file=None)
    assert "IMAGE_BASE_URL" in str(error.value)


@pytest.mark.parametrize("value", ["storage:9000", "ftp://storage", "http://storage:9000/path"])
def test_invalid_storage_endpoint(full_env: pytest.MonkeyPatch, value: str) -> None:
    full_env.setenv("STORAGE_ENDPOINT_URL", value)
    with pytest.raises(SettingsError) as error:
        load_settings(env_file=None)
    assert "STORAGE_ENDPOINT_URL" in str(error.value)


def test_buckets_must_differ(full_env: pytest.MonkeyPatch) -> None:
    full_env.setenv("STORAGE_PUBLIC_BUCKET", "local-originals")
    with pytest.raises(SettingsError) as error:
        load_settings(env_file=None)
    assert "STORAGE_PUBLIC_BUCKET" in str(error.value)
