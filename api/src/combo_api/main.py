"""Application factory."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from importlib.metadata import version
from typing import Any

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import HTMLResponse
from fastapi.routing import APIRoute
from sqlalchemy.ext.asyncio import async_sessionmaker

from combo_api import health
from combo_api.db import create_engine, head_revision
from combo_api.settings import Settings, load_settings


def operation_id(route: APIRoute) -> str:
    """Each route's OpenAPI operationId is its function name."""
    return route.name


def create_app(settings: Settings | None = None, env_file: str | None = ".env") -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.settings = settings or load_settings(env_file)
        app.state.engine = create_engine(app.state.settings)
        app.state.sessionmaker = async_sessionmaker(app.state.engine, expire_on_commit=False)
        app.state.head_revision = head_revision()
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
        openapi_url=None,
        docs_url=None,
        redoc_url=None,
    )
    app.include_router(health.router)

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
