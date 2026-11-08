"""Screenshot and screenshot state responses, built from rows."""

from datetime import datetime
from typing import Annotated, cast

from fastapi import Depends, Request

from combo_api.screenshots.keys import version_key
from combo_api.screenshots.models import ComboScreenshot, ScreenshotJob
from combo_api.screenshots.schemas import (
    AttemptReason,
    Screenshot,
    ScreenshotImage,
    ScreenshotState,
    State,
)


def screenshot_out(combo_id: str, shot: ComboScreenshot | None, base_url: str) -> Screenshot | None:
    """The public versions with full URLs, narrowest first. URLs are built at response time,
    so moving the bucket behind another domain changes one setting."""
    if shot is None:
        return None
    return Screenshot(
        width=shot.width,
        height=shot.height,
        images=[
            ScreenshotImage(
                url=f"{base_url}/{version_key(combo_id, shot.version_id, width)}",
                width=width,
                height=round(shot.height * width / shot.width),
                type="image/webp",
            )
            for width in sorted(shot.widths)
        ],
    )


def state_out(
    shot: ComboScreenshot | None,
    job: ScreenshotJob | None,
    state: str,
    attempts: int,
    now: datetime,
) -> ScreenshotState:
    lease = job.lease_expires_at if job else None
    return ScreenshotState(
        state=cast(State, state),
        rendering=lease is not None and lease > now,
        reason=cast(AttemptReason, job.last_reason) if job and attempts > 0 else None,
        attempts=attempts,
        made_at=shot.created_at if shot else None,
    )


def image_base_url(request: Request) -> str:
    base: str = request.app.state.settings.image_base_url
    return base


ImageBase = Annotated[str, Depends(image_base_url)]
