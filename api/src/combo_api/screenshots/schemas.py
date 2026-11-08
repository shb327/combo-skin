"""Request and response models for screenshots and workers."""

import builtins
import unicodedata
from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, Field
from pydantic_core import PydanticCustomError

from combo_api.screenshots.models import NAME_MAX

State = Literal["none", "waiting", "done", "failed"]
FailReason = Literal["render_failed", "asset_missing", "timeout"]
ReleaseReason = Literal["shutting_down", "gpu_unavailable"]
# Every reason an attempt can fail with: a worker's report or an expired lease.
AttemptReason = Literal["render_failed", "asset_missing", "timeout", "lease_expired"]
DETAIL_MAX = 300


def clean_name(value: str) -> str:
    name = value.strip()
    if any(unicodedata.category(c) in {"Cc", "Cf", "Zl", "Zp"} for c in name):
        raise PydanticCustomError("value_error", "Value error, control characters are refused")
    if not 1 <= len(name) <= NAME_MAX:
        raise PydanticCustomError(
            "string_too_long" if name else "string_too_short",
            "Name should have 1 to {max_length} characters",
            {"max_length": NAME_MAX},
        )
    return name


WorkerName = Annotated[str, Field(max_length=4 * NAME_MAX), AfterValidator(clean_name)]


class WorkerIn(BaseModel):
    name: WorkerName


class WorkerOut(BaseModel):
    id: int
    name: str
    created_at: datetime
    # The admin who created it.
    created_by: str
    last_seen_at: datetime | None
    revoked_at: datetime | None


class WorkerCreated(BaseModel):
    worker: WorkerOut
    # Shown once: the API keeps only its digest.
    token: str


class WorkerMe(BaseModel):
    name: str


class ScreenshotImage(BaseModel):
    url: str
    width: int
    height: int
    type: Literal["image/webp"]


class Screenshot(BaseModel):
    """A screenshot's public versions, narrowest first, and the original's size."""

    width: int
    height: int
    images: list[ScreenshotImage]


class ScreenshotState(BaseModel):
    """`none`: no screenshot yet. `waiting`: an older screenshot is shown, a new one is due.
    `done`. `failed`: three failed attempts for the current render inputs."""

    state: State
    # A worker holds a live claim on the combo.
    rendering: bool
    # The last failed attempt's reason, while attempts count.
    reason: AttemptReason | None
    attempts: int
    # When the current screenshot was stored.
    made_at: datetime | None


class ScreenshotRequest(BaseModel):
    ids: Annotated[
        list[Annotated[str, Field(min_length=1, max_length=64)]],
        Field(min_length=1, max_length=500),
    ]


class JobImage(BaseModel):
    width: int
    height: int
    type: Literal["image/png"]


class JobItem(BaseModel):
    """An item as the viewer identifies it, the float and seed to draw it with, and the
    combo's full conditions."""

    def_index: int
    codename: str
    paint_index: int
    paint_codename: str | None
    name: str
    float: builtins.float | None
    seed: int | None
    float_from: builtins.float | None
    float_to: builtins.float | None
    seeds: list[int]


class JobAgent(BaseModel):
    def_index: int
    codename: str
    name: str
    team: Literal["ct", "t"]
    # The combo has no agent of its own and uses the default.
    default: bool


class Job(BaseModel):
    job_id: str
    lease_expires_at: datetime
    combo_id: str
    image: JobImage
    glove: JobItem
    knife: JobItem
    agent: JobAgent
    render_revision: int


class Stored(BaseModel):
    combo_id: str
    screenshot: Screenshot


class FailReport(BaseModel):
    reason: FailReason
    # Logged, never stored or shown.
    detail: Annotated[str, Field(max_length=DETAIL_MAX)] | None = None


class Release(BaseModel):
    reason: ReleaseReason
