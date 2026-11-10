"""The website's static copies of the catalog and the agents, generated from the snapshot."""

import json
from typing import Any

from combo_api.catalog.snapshot import (
    DisplayOrder,
    Kind,
    Snapshot,
    ordered_agents,
    ordered_finishes,
    ordered_types,
)
from combo_api.db import API_DIR

WEBSITE_DATA = API_DIR.parent / "website" / "src" / "data"
WEBSITE_EXPORT = WEBSITE_DATA / "catalog.json"
# Loaded by the website only with its 3D window: who a visitor can choose to see a combo on.
AGENTS_EXPORT = WEBSITE_DATA / "agents.json"
GROUPS: dict[str, Kind] = {"gloves": "glove", "knives": "knife"}


def render(snapshot: Snapshot, order: DisplayOrder) -> str:
    data: dict[str, Any] = {"source": {"commit": snapshot.source.commit}}
    for group, kind in GROUPS.items():
        data[group] = [
            {
                "id": item_type.slug,
                "name": item_type.name,
                "finishes": [
                    {"id": finish.slug, "name": finish.display_name, "image": finish.image_url}
                    for finish in ordered_finishes(item_type, order)
                ],
            }
            for item_type in ordered_types(snapshot, order, kind)
        ]
    return json.dumps(data, indent=2, ensure_ascii=False) + "\n"


def render_agents(snapshot: Snapshot) -> str:
    """The agents still in the game, Counter-Terrorists first, then Terrorists, each by name."""
    data = {
        "source": {"commit": snapshot.source.commit},
        "agents": [
            {
                "def_index": agent.def_index,
                "name": agent.name,
                "team": agent.team,
                "image": agent.image_url,
            }
            for agent in ordered_agents(snapshot)
        ],
    }
    return json.dumps(data, indent=2, ensure_ascii=False) + "\n"
