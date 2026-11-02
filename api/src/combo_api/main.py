"""Application factory."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy.ext.asyncio import async_sessionmaker

from combo_api import health
from combo_api.db import create_engine, head_revision
from combo_api.settings import Settings, load_settings


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

    app = FastAPI(title="Combo Skin API", lifespan=lifespan)
    app.include_router(health.router)
    return app


app = create_app()
