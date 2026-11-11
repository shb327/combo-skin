"""Application factory."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from importlib.metadata import version
from typing import Any

import anyio
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.routing import APIRoute
from sqlalchemy.ext.asyncio import async_sessionmaker
from starlette.datastructures import MutableHeaders
from starlette.middleware.cors import CORSMiddleware
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from combo_api import health
from combo_api.admins import passwords
from combo_api.admins import routes as admins
from combo_api.admins.deps import CSRF_HEADER, NO_STORE, error_response
from combo_api.catalog import routes as catalog
from combo_api.combos import admin_routes as combos_admin
from combo_api.combos import agents as combos_agents
from combo_api.combos import public_routes as combos_public
from combo_api.db import create_engine, head_revision
from combo_api.screenshots import admin_routes as screenshots_admin
from combo_api.screenshots import worker_routes as screenshots_worker
from combo_api.screenshots.storage import S3Storage, Storage
from combo_api.screenshots.workers import check_request, is_worker_path
from combo_api.settings import Settings, load_settings

# LOG_LEVEL applies to the API's own logs and to uvicorn's error and access logs.
LOGGERS = ("combo_api", "uvicorn", "uvicorn.error", "uvicorn.access")
# Password hashes computed at once; each takes tens of MiB of memory.
HASH_SLOTS = 2
# Screenshots processed at once: about a second and a few hundred MiB each.
IMAGE_SLOTS = 1
# Routes with these tags serve public data that any origin may read (PublicCors).
PUBLIC_TAGS = {"catalog", "combos"}

logger = logging.getLogger("combo_api.admins")
errors_logger = logging.getLogger("combo_api.errors")
# Uvicorn configures only its own loggers; without this, the API's info lines are dropped.
LOG_HANDLER = logging.StreamHandler()
LOG_HANDLER.setFormatter(logging.Formatter("%(levelname)s:     %(name)s %(message)s"))


def operation_id(route: APIRoute) -> str:
    """Each route's OpenAPI operationId is its function name."""
    return route.name


class AdminCors:
    """CORS for the admin origins in settings, which are only known once the app has started.

    Requests from any other origin skip CORS entirely and get no CORS headers, and so do
    worker routes, which no browser page may use.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self.cors: dict[tuple[str, ...], ASGIApp] = {}

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and not is_worker_path(scope["path"]):
            origins = tuple(scope["app"].state.settings.admin_origins)
            origin = dict(scope["headers"]).get(b"origin", b"").decode("latin-1")
            if origin in origins:
                if origins not in self.cors:
                    self.cors[origins] = CORSMiddleware(
                        self.app,
                        allow_origins=list(origins),
                        allow_credentials=True,
                        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
                        allow_headers=["Content-Type", CSRF_HEADER],
                        expose_headers=["Retry-After"],
                        max_age=600,
                    )
                await self.cors[origins](scope, receive, send)
                return
        await self.app(scope, receive, send)


class InternalErrors:
    """500 `internal_error` for an exception no handler took, answered inside the CORS
    middlewares so the response carries the CORS headers its route would have had.

    Starlette's own error middleware answers outside every user middleware, so a browser saw
    such a 500 without CORS headers, as a network error. The traceback goes to the log only;
    the body is a fixed code and the response is never cached.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = False

        async def tracked(message: Message) -> None:
            nonlocal started
            started = started or message["type"] == "http.response.start"
            await send(message)

        try:
            await self.app(scope, receive, tracked)
        except Exception:
            errors_logger.exception(
                "unhandled error method=%s path=%s", scope["method"], scope["path"]
            )
            if started:
                raise
            response = JSONResponse(
                {"detail": "internal_error"}, status_code=500, headers=dict(NO_STORE)
            )
            await response(scope, receive, send)


class PublicCors:
    """`Access-Control-Allow-Origin: *` on GET responses of the public read routes.

    Covers requests without an admin origin, so a website on any origin can read the catalog
    and published combos. No credentials are allowed and no preflight is answered: the
    website's GET requests are simple requests. Admin origins are left to `AdminCors`.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] != "GET":
            await self.app(scope, receive, send)
            return
        origin = dict(scope["headers"]).get(b"origin", b"").decode("latin-1")
        public = origin not in scope["app"].state.settings.admin_origins

        async def send_with_cors(message: Message) -> None:
            # The router has set the matched route on the scope by the time a response starts.
            route = scope.get("route")
            if (
                message["type"] == "http.response.start"
                and isinstance(route, APIRoute)
                and PUBLIC_TAGS & set(route.tags)
            ):
                headers = MutableHeaders(scope=message)
                if public:
                    headers["Access-Control-Allow-Origin"] = "*"
                # AdminCors has already added it for admin origins; add_vary_header would repeat it.
                varies = {
                    v.strip().lower() for line in headers.getlist("vary") for v in line.split(",")
                }
                if "origin" not in varies:
                    headers.add_vary_header("Origin")
            await send(message)

        await self.app(scope, receive, send_with_cors)


async def validation_error(request: Request, error: Exception) -> JSONResponse:
    """422 without the submitted values, which on login can be a password.

    FastAPI decodes a JSON body before running route dependencies, so login's Origin and
    content type checks, and a worker route's Origin and token form checks, run here too: a
    malformed body never skips them.
    """
    if not isinstance(error, RequestValidationError):
        raise error
    headers = dict(NO_STORE)
    try:
        if request.scope.get("route") is admin_login_route():
            admins.check_login_request(request)
        elif is_worker_path(request.url.path):
            check_request(request)
    except HTTPException as refused:
        return JSONResponse(
            {"detail": refused.detail},
            status_code=refused.status_code,
            headers={**headers, **(refused.headers or {})},
        )
    errors = [{"loc": e["loc"], "msg": e["msg"], "type": e["type"]} for e in error.errors()]
    return JSONResponse({"detail": jsonable_encoder(errors)}, status_code=422, headers=headers)


# Fields of FastAPI's ValidationError that `validation_error` leaves out of 422 bodies.
UNSENT_PROBLEM_FIELDS = ("input", "ctx")


def admin_login_route() -> APIRoute:
    return next(
        r for r in admins.router.routes if isinstance(r, APIRoute) and r.name == "admin_login"
    )


def create_app(
    settings: Settings | None = None,
    env_file: str | None = ".env",
    storage: Storage | None = None,
) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.settings = settings or load_settings(env_file)
        level = app.state.settings.log_level.upper()
        for name in LOGGERS:
            logging.getLogger(name).setLevel(level)
        if LOG_HANDLER not in logging.getLogger("combo_api").handlers:
            logging.getLogger("combo_api").addHandler(LOG_HANDLER)
        app.state.engine = create_engine(app.state.settings)
        app.state.sessionmaker = async_sessionmaker(app.state.engine, expire_on_commit=False)
        app.state.head_revision = head_revision()
        app.state.hash_limiter = anyio.CapacityLimiter(HASH_SLOTS)
        app.state.image_limiter = anyio.CapacityLimiter(IMAGE_SLOTS)
        app.state.storage = storage or S3Storage(app.state.settings)
        await anyio.to_thread.run_sync(passwords.prepare)
        if not app.state.settings.session_cookie_secure:
            logger.warning(
                "SESSION_COOKIE_SECURE is false: the session cookie is sent over plain http"
            )
        try:
            yield
        finally:
            await app.state.engine.dispose()

    # Docs routes are added below so DOCS_ENABLED can be read at request time.
    app = FastAPI(
        title="Combo Skin API",
        version=version("combo-api"),
        lifespan=lifespan,
        generate_unique_id_function=operation_id,
        # Any route can fail unexpectedly; InternalErrors answers it.
        responses={status.HTTP_500_INTERNAL_SERVER_ERROR: error_response("`internal_error`")},
        openapi_url=None,
        docs_url=None,
        redoc_url=None,
    )
    app.include_router(health.router)
    app.include_router(catalog.router)
    app.include_router(admins.router)
    app.include_router(combos_admin.router)
    app.include_router(combos_agents.router)
    app.include_router(combos_public.router)
    app.include_router(screenshots_admin.router)
    app.include_router(screenshots_worker.router)
    # Innermost first: errors become responses before the CORS layers see them.
    app.add_middleware(InternalErrors)
    app.add_middleware(AdminCors)
    app.add_middleware(PublicCors)
    app.add_exception_handler(RequestValidationError, validation_error)

    generated = app.openapi

    def openapi() -> dict[str, Any]:
        """FastAPI's schema, with 422 problems described as `validation_error` sends them."""
        schema = generated()
        problem = schema["components"]["schemas"]["ValidationError"]
        for field in UNSENT_PROBLEM_FIELDS:
            problem["properties"].pop(field, None)
        problem["required"] = [f for f in problem["required"] if f not in UNSENT_PROBLEM_FIELDS]
        return schema

    app.openapi = openapi  # type: ignore[method-assign]

    def require_docs(request: Request) -> None:
        if not request.app.state.settings.docs_enabled:
            raise HTTPException(status.HTTP_404_NOT_FOUND)

    @app.get("/openapi.json", include_in_schema=False)
    async def openapi_schema(request: Request) -> dict[str, Any]:
        require_docs(request)
        return app.openapi()

    @app.get("/docs", include_in_schema=False)
    async def swagger_ui(request: Request) -> HTMLResponse:
        require_docs(request)
        return get_swagger_ui_html(openapi_url="/openapi.json", title=app.title)

    return app


app = create_app()
