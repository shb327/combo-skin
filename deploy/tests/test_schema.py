"""The public schema: which schemas count, drift between the running API and the built commit,
and validation of data files."""

import copy
import json
from pathlib import Path
from typing import Any

from combo_publish.schema import PublicSchema, public_schemas, schema_drift

OPENAPI = Path(__file__).parents[2] / "api" / "openapi.json"


def openapi() -> dict[str, Any]:
    loaded: dict[str, Any] = json.loads(OPENAPI.read_text())
    return loaded


def test_public_schemas_are_the_two_roots_and_what_they_reference() -> None:
    names = set(public_schemas(openapi()))
    assert {"PublicCombo", "ComboCounts", "Item", "Screenshot", "ScreenshotImage"} <= names
    assert {"Rarity", "PatternGroupRef"} <= names
    # Admin and worker schemas are not public.
    assert not names & {"AdminCombo", "ComboIn", "Job", "WorkerOut"}


def test_the_same_schemas_do_not_drift() -> None:
    assert schema_drift(openapi(), openapi()) == []


def test_titles_and_descriptions_are_not_drift() -> None:
    running = openapi()
    running["components"]["schemas"]["PublicCombo"]["description"] = "Reworded."
    running["components"]["schemas"]["Item"]["properties"]["active"]["title"] = "Is active"
    assert schema_drift(running, openapi()) == []


def test_a_changed_field_names_its_schema() -> None:
    running = openapi()
    running["components"]["schemas"]["Item"]["properties"]["seeds"] = {"type": "string"}
    assert schema_drift(running, openapi()) == ["Item"]


def test_a_new_field_and_a_missing_schema_are_drift() -> None:
    running = openapi()
    schemas = running["components"]["schemas"]
    schemas["Screenshot"]["properties"]["blur"] = {"type": "string"}
    del schemas["PatternGroupRef"]
    assert schema_drift(running, openapi()) == ["PatternGroupRef", "Screenshot"]


def test_admin_schema_changes_are_not_drift() -> None:
    running = openapi()
    running["components"]["schemas"]["AdminCombo"]["properties"]["new"] = {"type": "string"}
    assert schema_drift(running, openapi()) == []


def combo() -> dict[str, Any]:
    item = {
        "type_slug": "specialist",
        "type_name": "Specialist Gloves",
        "finish_slug": "mogul",
        "display_name": "Mogul",
        "def_index": 5034,
        "paint_index": 10006,
        "image_url": "https://img.combo.skin/catalog/x.png",
        "fallback_image_url": "https://community.akamai.steamstatic.com/economy/image/x",
        "rarity": {"code": "rarity_ancient", "name": "Extraordinary", "color": "#eb4b4b"},
        "active": True,
        "float_min": 0.06,
        "float_max": 0.8,
        "float_from": None,
        "float_to": None,
        "seeds": [],
        "pattern_group": {"slug": "blue", "name": "Blue gem"},
    }
    return {
        "id": "c1",
        "rating": 9.5,
        "description": None,
        "glove": item,
        "knife": copy.deepcopy(item),
        "screenshot": {
            "width": 1920,
            "height": 1080,
            "images": [
                {
                    "url": "https://img.combo.skin/a.webp",
                    "width": 640,
                    "height": 360,
                    "type": "image/webp",
                }
            ],
        },
    }


def test_a_public_combo_is_valid() -> None:
    schema = PublicSchema(openapi())
    assert schema.combo_errors(combo()) == []
    assert schema.counts_errors({"gloves": {"specialist": {"mogul": 2}}, "knives": {}}) == []


def test_fields_the_schema_does_not_list_are_refused() -> None:
    schema = PublicSchema(openapi())
    extra = combo()
    extra["status"] = "draft"
    extra["glove"]["screenshot_agent"] = 4613
    assert sorted(schema.combo_errors(extra)) == [
        "combo.glove: field screenshot_agent is not in the public schema",
        "combo: field status is not in the public schema",
    ]


def test_wrong_types_and_missing_fields_are_refused() -> None:
    schema = PublicSchema(openapi())
    broken = combo()
    del broken["rating"]
    broken["screenshot"]["images"][0]["type"] = "image/png"
    broken["knife"]["seeds"] = "1,2"
    errors = schema.combo_errors(broken)
    assert "combo: missing field rating" in errors
    assert any(error.startswith("combo.screenshot.images[0].type") for error in errors)
    assert any(error.startswith("combo.knife.seeds") for error in errors)
    assert schema.counts_errors({"gloves": {"specialist": {"mogul": "2"}}, "knives": {}}) != []
