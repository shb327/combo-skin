"""The website's static copy of the catalog, generated from the snapshot."""

import json
from typing import Any

from combo_api.catalog.snapshot import DisplayOrder, Kind, Snapshot, ordered_finishes, ordered_types
from combo_api.db import API_DIR

WEBSITE_EXPORT = API_DIR.parent / "website" / "src" / "data" / "catalog.json"
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
