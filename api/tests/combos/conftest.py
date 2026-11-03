import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from combo_api.catalog.importer import import_snapshot
from combo_api.catalog.snapshot import load_display_order, load_snapshot

# The admin app, clients and accounts, shared with the admin tests.
from tests.admins.conftest import (  # noqa: F401
    admin,
    admin_client,
    admin_settings,
    app,
    clients,
    fake_clock,
    other_admin,
)

SNAPSHOT = load_snapshot()
ORDER = load_display_order()


@pytest.fixture
async def catalog(db_session: AsyncSession) -> AsyncSession:
    await import_snapshot(db_session, SNAPSHOT, ORDER)
    return db_session
