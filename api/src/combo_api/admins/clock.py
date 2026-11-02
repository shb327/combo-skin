"""The current time for sessions and rate limits, in one place so tests can move it."""

from datetime import UTC, datetime


def now() -> datetime:
    return datetime.now(UTC)
