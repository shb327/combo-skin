"""The website's copy of the pattern guides, for its Credits page (spec 023), generated from the
groups file."""

import json
from typing import Any

from combo_api.db import API_DIR
from combo_api.patterns.data import GroupsFile

WEBSITE_EXPORT = API_DIR.parent / "website" / "src" / "data" / "pattern-guides.json"


def render(groups: GroupsFile) -> str:
    """Every distinct guide, by URL, in the order it first appears, with the names of the groups
    it informs. Groups without sources are the owner's picks and add nothing."""
    guides: dict[str, dict[str, Any]] = {}
    for group in groups.groups:
        for source in group.sources:
            guide = guides.setdefault(
                source.url,
                {"title": source.title, "author": source.author, "url": source.url, "groups": []},
            )
            if group.name not in guide["groups"]:
                guide["groups"].append(group.name)
    return json.dumps({"guides": list(guides.values())}, indent=2, ensure_ascii=False) + "\n"
