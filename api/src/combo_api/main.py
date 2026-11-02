"""Application factory."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from combo_api.settings import load_settings


def create_app(env_file: str | None = ".env") -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.settings = load_settings(env_file)
        yield

    return FastAPI(title="Combo Skin API", lifespan=lifespan)


app = create_app()
