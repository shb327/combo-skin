import logging
from ipaddress import ip_network

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.admins.models import LoginFailure
from combo_api.main import create_app
from combo_api.settings import Settings
from tests.admins.conftest import API_URL
from tests.admins.support import USERNAME, login
from tests.support import ADMIN_ORIGIN, API_DIR

pytestmark = pytest.mark.anyio


def attributes(set_cookie: str) -> tuple[str, dict[str, str]]:
    pair, *parts = (part.strip() for part in set_cookie.split(";"))
    name = pair.split("=", 1)[0]
    found = {}
    for part in parts:
        key, _, value = part.partition("=")
        found[key.lower()] = value
    return name, found


async def test_secure_cookie(admin_client: AsyncClient, admin: int) -> None:
    response = await login(admin_client)
    name, found = attributes(response.headers["set-cookie"])
    assert name.startswith("__Host-")
    assert set(found) == {"httponly", "secure", "samesite", "path"}
    assert found["samesite"].lower() == "strict"
    assert found["path"] == "/"


class TestInsecureCookie:
    @pytest.fixture
    def admin_settings(self, test_settings: Settings) -> Settings:
        return test_settings.model_copy(update={"session_cookie_secure": False})

    async def test_plain_http_cookie(self, app: FastAPI, admin: int) -> None:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://api.example.test"
        ) as client:
            response = await login(client)
            name, found = attributes(response.headers["set-cookie"])
            assert not name.startswith("__Host-")
            assert "secure" not in found
            assert {"httponly", "samesite", "path"} <= set(found)
            assert (await client.get("/admin/me")).status_code == 200

    async def test_startup_warns(
        self, admin_settings: Settings, caplog: pytest.LogCaptureFixture
    ) -> None:
        caplog.set_level(logging.WARNING, logger="combo_api.admins")
        app = create_app(settings=admin_settings)
        async with app.router.lifespan_context(app):
            pass
        assert any("SESSION_COOKIE_SECURE" in r.getMessage() for r in caplog.records)


async def preflight(client: AsyncClient, origin: str) -> dict[str, str]:
    response = await client.options(
        "/admin/login",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-csrf-token",
        },
    )
    return {k: v for k, v in response.headers.items() if k.startswith("access-control-")}


async def test_cors_allows_only_listed_origins(admin_client: AsyncClient, admin: int) -> None:
    allowed = await preflight(admin_client, ADMIN_ORIGIN)
    assert allowed["access-control-allow-origin"] == ADMIN_ORIGIN
    assert allowed["access-control-allow-credentials"] == "true"
    assert "x-csrf-token" in allowed["access-control-allow-headers"].lower()

    for origin in ("https://evil.example.test", "http://localhost:5175", "null"):
        assert await preflight(admin_client, origin) == {}

    response = await login(admin_client)
    assert response.headers["access-control-allow-origin"] == ADMIN_ORIGIN
    assert "retry-after" in response.headers["access-control-expose-headers"].lower()
    other = await admin_client.get("/admin/me", headers={"Origin": "http://localhost:5175"})
    assert not [k for k in other.headers if k.startswith("access-control-")]


class TestNoOrigins:
    @pytest.fixture
    def admin_settings(self, test_settings: Settings) -> Settings:
        return test_settings.model_copy(update={"admin_origins": []})

    async def test_no_origin_gets_cors_headers(self, admin_client: AsyncClient) -> None:
        assert await preflight(admin_client, ADMIN_ORIGIN) == {}


async def failure_ips(db_session: AsyncSession) -> list[str]:
    return [str(ip) for ip in await db_session.scalars(select(LoginFailure.client_ip))]


async def failed_login(app: FastAPI, peer: str, forwarded: str | None) -> None:
    headers = {"X-Forwarded-For": forwarded} if forwarded else {}
    async with AsyncClient(
        transport=ASGITransport(app=app, client=(peer, 40000)), base_url=API_URL
    ) as client:
        response = await login(client, USERNAME, "wrong password", **headers)
        assert response.status_code == 401


async def test_forwarded_header_ignored_without_trusted_proxies(
    app: FastAPI, admin: int, db_session: AsyncSession
) -> None:
    await failed_login(app, "10.0.0.5", "203.0.113.7")
    assert await failure_ips(db_session) == ["10.0.0.5"]


class TestTrustedProxy:
    @pytest.fixture
    def admin_settings(self, test_settings: Settings) -> Settings:
        proxies = [ip_network("10.0.0.5"), ip_network("10.1.0.0/16")]
        return test_settings.model_copy(update={"trusted_proxies": proxies})

    @pytest.mark.parametrize(
        ("peer", "forwarded", "expected"),
        [
            ("10.0.0.5", "203.0.113.7", "203.0.113.7"),
            ("10.0.0.5", "198.51.100.1, 203.0.113.7", "203.0.113.7"),
            ("10.0.0.5", "203.0.113.7, 10.1.2.3", "203.0.113.7"),
            ("10.0.0.5", "not-an-ip", "10.0.0.5"),
            ("10.0.0.9", "203.0.113.7", "10.0.0.9"),
        ],
    )
    async def test_right_most_untrusted_address(
        self,
        app: FastAPI,
        admin: int,
        db_session: AsyncSession,
        peer: str,
        forwarded: str,
        expected: str,
    ) -> None:
        await failed_login(app, peer, forwarded)
        assert await failure_ips(db_session) == [expected]


def test_uvicorn_proxy_headers_are_off() -> None:
    dockerfile = (API_DIR / "Dockerfile").read_text()
    assert '"--no-proxy-headers"' in dockerfile
    readme = (API_DIR / "README.md").read_text()
    commands = [line for line in readme.splitlines() if "uvicorn combo_api.main:app" in line]
    assert commands
    assert all("--no-proxy-headers" in line for line in commands)
