"""Every code an error response can carry in `detail` (422 responses excepted: their `detail`
is a list of problems). `tests/test_error_codes.py` checks the list against the codes the
routes raise and declare."""

from typing import Literal

ErrorCode = Literal[
    "claim_expired",
    "combo_exists",
    "combo_not_found",
    "combo_published",
    "csrf_failed",
    "default_agent_missing",
    "inputs_changed",
    "internal_error",
    "invalid_credentials",
    "job_not_found",
    "not_authenticated",
    "origin_not_allowed",
    "too_large",
    "too_many_attempts",
    "unsupported_media_type",
    "version_conflict",
    "worker_exists",
    "worker_not_found",
]
