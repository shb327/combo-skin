from typing import Any

from combo_api.main import create_app

OPERATIONS = {
    ("/admin/combos", "get"): ("list_combos", "admin"),
    ("/admin/combos", "post"): ("create_combo", "admin"),
    ("/admin/combos/{combo_id}", "get"): ("get_combo", "admin"),
    ("/admin/combos/{combo_id}", "put"): ("update_combo", "admin"),
    ("/admin/combos/{combo_id}", "delete"): ("remove_combo", "admin"),
    ("/admin/combos/publish", "post"): ("publish_combos", "admin"),
    ("/admin/combos/unpublish", "post"): ("unpublish_combos", "admin"),
    ("/admin/batches/finishes", "get"): ("list_batch_finishes", "admin"),
    ("/admin/batches/candidates", "get"): ("get_batch_candidates", "admin"),
    ("/admin/batches", "post"): ("save_batch", "admin"),
    ("/admin/knife-order", "get"): ("get_knife_order", "admin"),
    ("/admin/knife-order", "put"): ("replace_knife_order", "admin"),
    ("/gloves/{type_slug}/{finish_slug}/combos", "get"): ("list_glove_finish_combos", "combos"),
    ("/knives/{type_slug}/{finish_slug}/combos", "get"): ("list_knife_finish_combos", "combos"),
    ("/combo-counts", "get"): ("get_combo_counts", "combos"),
}


def test_combo_operations_in_schema() -> None:
    schema = create_app().openapi()
    found = {
        (path, method): (operation["operationId"], operation["tags"])
        for path, methods in schema["paths"].items()
        for method, operation in methods.items()
        if "combo" in path or "batches" in path or "knife-order" in path
    }
    assert found == {key: (op, [tag]) for key, (op, tag) in OPERATIONS.items()}
    for (path, method), (_, tag) in OPERATIONS.items():
        responses = schema["paths"][path][method]["responses"]
        if tag == "admin":
            assert {"401", "403"} <= set(responses), path
        else:
            # A 404 only for an unknown finish in the path.
            assert "401" not in responses, path
            assert ("404" in responses) == ("{finish_slug}" in path), path


def number(schema: dict[str, Any], model: str, field: str) -> bool:
    prop = schema["components"]["schemas"][model]["properties"][field]
    options = prop.get("anyOf", [prop])
    return {o["type"] for o in options} <= {"number", "null"} and "number" in {
        o["type"] for o in options
    }


def test_numbers_are_numbers() -> None:
    schema = create_app().openapi()
    for model in ("ComboIn", "ComboUpdate", "AdminCombo", "PublicCombo", "Existing"):
        assert number(schema, model, "rating"), model
    for model in ("Conditions", "ItemIn", "Item"):
        assert number(schema, model, "float_from"), model
        assert number(schema, model, "float_to"), model


AGENT_OPERATIONS = {
    ("/admin/agents", "get"): "list_agents",
    ("/admin/screenshot-settings", "get"): "get_screenshot_settings",
    ("/admin/screenshot-settings", "put"): "replace_screenshot_settings",
}


def test_agent_operations_in_schema() -> None:
    schema = create_app().openapi()
    for (path, method), operation_id in AGENT_OPERATIONS.items():
        operation = schema["paths"][path][method]
        assert (operation["operationId"], operation["tags"]) == (operation_id, ["admin"])
        assert {"401", "403"} <= set(operation["responses"]), path
        assert ("503" in operation["responses"]) == ("settings" in path), path
    schemas = schema["components"]["schemas"]
    assert set(schemas["Agent"]["properties"]) == {
        "def_index",
        "name",
        "team",
        "image_url",
        "fallback_image_url",
        "rarity",
        "active",
    }
    assert "screenshot_agent" in schemas["AdminCombo"]["required"]
    assert "screenshot_agent" in schemas["ComboUpdate"]["required"]
    assert "screenshot_agent" not in schemas["ComboIn"].get("required", [])
    assert "screenshot_agent" in schemas["BatchCreate"]["properties"]
    assert "screenshot_agent" not in schemas["PublicCombo"]["properties"]
