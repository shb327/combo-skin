"""Small group files for import tests. Seeds and sources here are made up."""

from typing import Any

from combo_api.patterns.data import GroupsFile

SOURCE = {
    "title": "A guide",
    "author": "Someone",
    "url": "https://example.com/guide",
    "checked": "2026-11-17",
}


def group(slug: str = "blue-gem", **fields: Any) -> dict[str, Any]:
    return {
        "slug": slug,
        "name": "Blue Gem",
        "kind": "knife",
        "finish": "case-hardened",
        "seeds": {"karambit": 387, "m9-bayonet": 601},
        "sources": [SOURCE],
        **fields,
    }


def groups_file(*groups: dict[str, Any]) -> GroupsFile:
    return GroupsFile.model_validate({"groups": list(groups) or [group()]})
