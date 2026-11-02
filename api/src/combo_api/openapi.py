"""Write or check the committed OpenAPI snapshot.

uv run python -m combo_api.openapi           # regenerate openapi.json
uv run python -m combo_api.openapi --check   # exit 1 if openapi.json is stale
"""

import argparse
import json
import sys
from pathlib import Path

from combo_api.db import API_DIR
from combo_api.main import create_app

SNAPSHOT = API_DIR / "openapi.json"


def render() -> str:
    return json.dumps(create_app().openapi(), indent=2, sort_keys=True) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail if the snapshot is stale")
    parser.add_argument("--output", type=Path, default=SNAPSHOT, help="snapshot path")
    args = parser.parse_args(argv)

    expected = render()
    if args.check:
        current = args.output.read_text() if args.output.exists() else ""
        if current != expected:
            print(
                f"{args.output.name} is out of date: run `uv run python -m combo_api.openapi`",
                file=sys.stderr,
            )
            return 1
        return 0
    args.output.write_text(expected)
    return 0


if __name__ == "__main__":
    sys.exit(main())
