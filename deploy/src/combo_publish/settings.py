"""The publish settings, from `deploy/publish.toml` (gitignored; `publish.example.toml` lists
every setting). None of them is a secret: credentials come from the Keychain (keychain.py).

There is deliberately no setting for the originals bucket: the command reads images only from
the local public bucket, anonymously, and can reach nothing else on the local storage service.
"""

import ipaddress
import re
import tomllib
from collections.abc import Mapping
from dataclasses import dataclass, fields
from pathlib import Path
from typing import Protocol
from urllib.parse import urlsplit

DEFAULT_STATE_DIR = "~/Library/Application Support/combo-skin/publish"
DEFAULT_BACKUP_DIR = "~/Library/Application Support/combo-skin/backups"


class SettingsError(Exception):
    """A missing, unknown or invalid setting. The message names the setting."""


def origin_of(base_url: str) -> str:
    parts = urlsplit(base_url)
    return f"{parts.scheme}://{parts.netloc}"


class SiteOrigins(Protocol):
    """What the site is built and served for: its origin, the image base URL and the viewer.
    The publish settings have them, and so does a data manifest (spec 026)."""

    @property
    def site_origin(self) -> str: ...

    @property
    def image_base_url(self) -> str: ...

    @property
    def image_origin(self) -> str: ...

    @property
    def viewer_origin(self) -> str: ...


@dataclass(frozen=True)
class Origins:
    site_origin: str
    image_base_url: str
    viewer_origin: str

    @property
    def image_origin(self) -> str:
        return origin_of(self.image_base_url)


@dataclass(frozen=True)
class Settings:
    account_id: str
    pages_project: str
    site_origin: str
    image_base_url: str
    viewer_origin: str
    public_bucket: str
    backup_bucket: str
    # The rest have defaults in DEFAULTS.
    local_api_url: str
    local_image_base_url: str
    state_dir: Path
    backup_dir: Path
    compose_project: str
    pages_token_service: str
    images_token_service: str
    backup_token_service: str

    @property
    def image_origin(self) -> str:
        return origin_of(self.image_base_url)

    @property
    def origins(self) -> Origins:
        return Origins(self.site_origin, self.image_base_url, self.viewer_origin)

    @property
    def local_urls(self) -> tuple[str, str]:
        """The back office's addresses, which nothing deployed may hold."""
        return (self.local_api_url, self.local_image_base_url)

    @property
    def keychain_services(self) -> tuple[str, str, str]:
        return (self.pages_token_service, self.images_token_service, self.backup_token_service)


NAME = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")
SERVICE = re.compile(r"^[A-Za-z0-9._-]{1,100}$")


def https_origin(name: str, value: str) -> str:
    parts = urlsplit(value)
    if (
        parts.scheme != "https"
        or not parts.hostname
        or parts.username
        or parts.password
        or f"https://{parts.netloc}" != value
    ):
        raise SettingsError(f"{name} must be an https origin such as https://example.com")
    return value


def https_base(name: str, value: str) -> str:
    parts = urlsplit(value)
    if parts.scheme != "https" or not parts.hostname or parts.username or parts.query:
        raise SettingsError(f"{name} must be an https URL such as https://images.example.com")
    if parts.fragment or "?" in value or "#" in value:
        raise SettingsError(f"{name} must have no query or fragment")
    return value.rstrip("/")


def _loopback(name: str, value: str) -> str:
    """The back office answers on loopback addresses only, over plain http."""
    parts = urlsplit(value)
    host = parts.hostname or ""
    try:
        loopback = host == "localhost" or ipaddress.ip_address(host).is_loopback
    except ValueError:
        loopback = False
    if parts.scheme != "http" or not loopback or parts.username or parts.query or parts.fragment:
        raise SettingsError(f"{name} must be a local http URL such as http://127.0.0.1:8000")
    return value.rstrip("/")


def parse(raw: Mapping[str, object]) -> Settings:
    known = {field.name for field in fields(Settings)}
    unknown = sorted(set(raw) - known)
    if unknown:
        raise SettingsError(f"Unknown settings: {', '.join(unknown)}")
    values: dict[str, object] = {}
    for field in fields(Settings):
        if field.name not in raw:
            continue
        value = raw[field.name]
        if not isinstance(value, str) or not value:
            raise SettingsError(f"{field.name} must be a non-empty string")
        values[field.name] = value
    required = [field.name for field in fields(Settings) if field.name not in DEFAULTS]
    missing = [name for name in required if name not in values]
    if missing:
        raise SettingsError(f"Missing settings: {', '.join(missing)}")

    def text(name: str) -> str:
        return str(values.get(name, DEFAULTS.get(name, "")))

    if not re.fullmatch(r"[0-9a-f]{32}", text("account_id")):
        raise SettingsError("account_id must be the 32-character account id")
    for name in ("pages_project", "public_bucket", "backup_bucket", "compose_project"):
        if not NAME.fullmatch(text(name)):
            raise SettingsError(f"{name} must be lower-case letters, digits and hyphens")
    if text("public_bucket") == text("backup_bucket"):
        raise SettingsError("public_bucket and backup_bucket must be different buckets")
    services = [text(name) for name in _SERVICES]
    for name, service in zip(_SERVICES, services, strict=True):
        if not SERVICE.fullmatch(service):
            raise SettingsError(f"{name} must be a Keychain service name")
    if len(set(services)) != len(services):
        raise SettingsError("The three Keychain service names must differ")
    return Settings(
        account_id=text("account_id"),
        pages_project=text("pages_project"),
        site_origin=https_origin("site_origin", text("site_origin")),
        image_base_url=https_base("image_base_url", text("image_base_url")),
        viewer_origin=https_origin("viewer_origin", text("viewer_origin")),
        public_bucket=text("public_bucket"),
        backup_bucket=text("backup_bucket"),
        local_api_url=_loopback("local_api_url", text("local_api_url")),
        local_image_base_url=_loopback("local_image_base_url", text("local_image_base_url")),
        state_dir=Path(text("state_dir")).expanduser(),
        backup_dir=Path(text("backup_dir")).expanduser(),
        compose_project=text("compose_project"),
        pages_token_service=text("pages_token_service"),
        images_token_service=text("images_token_service"),
        backup_token_service=text("backup_token_service"),
    )


_SERVICES = ("pages_token_service", "images_token_service", "backup_token_service")
DEFAULTS: dict[str, str] = {
    "local_api_url": "http://127.0.0.1:8000",
    "local_image_base_url": "http://localhost:9000/local-images",
    "state_dir": DEFAULT_STATE_DIR,
    "backup_dir": DEFAULT_BACKUP_DIR,
    "compose_project": "combo-skin",
    "pages_token_service": "combo-skin-pages",
    "images_token_service": "combo-skin-r2-images",
    "backup_token_service": "combo-skin-r2-backup",
}


def load(path: Path) -> Settings:
    if not path.is_file():
        raise SettingsError(
            f"No settings file at {path}: copy deploy/publish.example.toml to it and fill it in"
        )
    try:
        raw = tomllib.loads(path.read_text())
    except tomllib.TOMLDecodeError as error:
        raise SettingsError(f"{path} is not valid TOML: {error}") from error
    return parse(raw)
