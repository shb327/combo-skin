"""The OpenAPI schema describes errors as they are sent: every code the API can put in
`detail`, and 422 bodies without the fields the handler leaves out."""

import ast
import re
from pathlib import Path
from typing import Any, get_args

from combo_api.errors import ErrorCode
from combo_api.main import create_app

SOURCE = Path(__file__).parents[1] / "src" / "combo_api"
# Where a code is the second argument, or the `detail` keyword.
RAISERS = {"refuse", "HTTPException"}


def raised_codes() -> set[str]:
    """Every literal code passed to `refuse` or `HTTPException` in the source."""
    codes: set[str] = set()
    for path in SOURCE.rglob("*.py"):
        for node in ast.walk(ast.parse(path.read_text())):
            if not isinstance(node, ast.Call):
                continue
            name = getattr(node.func, "id", getattr(node.func, "attr", None))
            if name not in RAISERS:
                continue
            values = node.args[1:2] + [k.value for k in node.keywords if k.arg == "detail"]
            codes |= {
                v.value for v in values if isinstance(v, ast.Constant) and isinstance(v.value, str)
            }
    return codes


def described_codes(schema: dict[str, Any]) -> set[str]:
    """Every code named in a response description, except 422's."""
    codes: set[str] = set()
    for operations in schema["paths"].values():
        for operation in operations.values():
            for status_code, response in operation.get("responses", {}).items():
                if status_code != "422":
                    codes |= set(re.findall(r"`([a-z_]+)`", response.get("description", "")))
    return codes


def test_every_code_is_in_the_enumeration() -> None:
    schema = create_app().openapi()
    enumeration = set(schema["components"]["schemas"]["Error"]["properties"]["detail"]["enum"])
    assert enumeration == set(get_args(ErrorCode))
    assert raised_codes() <= enumeration
    assert described_codes(schema) <= enumeration
    # And nothing listed that the API never sends.
    assert enumeration <= raised_codes() | described_codes(schema)


def test_validation_errors_are_described_as_sent() -> None:
    component = create_app().openapi()["components"]["schemas"]["ValidationError"]
    assert set(component["properties"]) == {"loc", "msg", "type"}
    assert set(component["required"]) == {"loc", "msg", "type"}
