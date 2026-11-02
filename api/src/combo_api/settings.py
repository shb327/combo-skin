"""Settings read from environment variables, with an optional .env file for local use."""

import re
from ipaddress import IPv4Network, IPv6Network, ip_network
from typing import Annotated, Any, Literal

from pydantic import Field, SecretStr, ValidationError, ValidationInfo, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from sqlalchemy import URL

# An exact origin: scheme, host and optional port, nothing else.
ORIGIN = re.compile(r"https?://([a-z0-9.-]+|\[[0-9a-f:]+\])(:[0-9]{1,5})?")


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
    admin_origins: Annotated[list[str], NoDecode] = []
    session_cookie_secure: bool = True
    session_max_hours: int = Field(default=12, ge=1, le=24)
    session_idle_minutes: int = Field(default=60, ge=5, le=1440)
    trusted_proxies: Annotated[list[IPv4Network | IPv6Network], NoDecode] = []

    @field_validator("admin_origins", "trusted_proxies", mode="before")
    @classmethod
    def split_commas(cls, value: Any) -> Any:
        if isinstance(value, str):
            return [part.strip() for part in value.split(",") if part.strip()]
        return value

    @field_validator("admin_origins")
    @classmethod
    def exact_origins(cls, origins: list[str]) -> list[str]:
        for origin in origins:
            if not ORIGIN.fullmatch(origin):
                raise ValueError("each origin must be scheme://host[:port]")
        return origins

    @field_validator("trusted_proxies", mode="before")
    @classmethod
    def networks(cls, value: Any) -> Any:
        if isinstance(value, list):
            return [
                ip_network(part, strict=False) if isinstance(part, str) else part for part in value
            ]
        return value

    @field_validator("session_idle_minutes")
    @classmethod
    def idle_within_absolute(cls, minutes: int, info: ValidationInfo) -> int:
        hours = info.data.get("session_max_hours")
        if hours is not None and minutes > hours * 60:
            raise ValueError("idle lifetime is longer than the absolute lifetime")
        return minutes

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
