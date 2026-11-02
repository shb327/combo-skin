"""Settings read from environment variables, with an optional .env file for local use."""

from typing import Literal

from pydantic import SecretStr, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL


class SettingsError(RuntimeError):
    """Raised when settings are missing or invalid. Never includes setting values."""


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    postgres_host: str
    postgres_port: int = 5432
    postgres_user: str
    postgres_password: SecretStr
    postgres_db: str
    log_level: Literal["debug", "info", "warning", "error"] = "info"
    docs_enabled: bool = True

    def database_url(self, database: str | None = None) -> URL:
        return URL.create(
            "postgresql+psycopg",
            username=self.postgres_user,
            password=self.postgres_password.get_secret_value(),
            host=self.postgres_host,
            port=self.postgres_port,
            database=database or self.postgres_db,
        )


def load_settings(env_file: str | None = ".env") -> Settings:
    """Load settings, reporting problems by variable name only."""
    try:
        return Settings(_env_file=env_file)
    except ValidationError as error:
        problems = [
            f"{'.'.join(str(part) for part in e['loc']).upper()} ({e['type']})"
            for e in error.errors()
        ]
        raise SettingsError("Invalid settings: " + ", ".join(problems)) from None
