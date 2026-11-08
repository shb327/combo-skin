from combo_api.main import create_app

OPERATIONS = {
    ("/admin/screenshots/request", "post"): ("request_screenshots", "admin"),
    ("/admin/workers", "get"): ("list_workers", "admin"),
    ("/admin/workers", "post"): ("create_worker", "admin"),
    ("/admin/workers/{worker_id}/revoke", "post"): ("revoke_worker", "admin"),
    ("/worker/me", "get"): ("worker_me", "worker"),
    ("/worker/jobs/claim", "post"): ("claim_job", "worker"),
    ("/worker/jobs/{job_id}/screenshot", "put"): ("put_screenshot", "worker"),
    ("/worker/jobs/{job_id}/fail", "post"): ("fail_job", "worker"),
    ("/worker/jobs/{job_id}/release", "post"): ("release_job", "worker"),
}


def test_screenshot_operations_in_schema() -> None:
    schema = create_app().openapi()
    found = {
        (path, method): (operation["operationId"], operation["tags"])
        for path, methods in schema["paths"].items()
        for method, operation in methods.items()
        if path.startswith(("/worker/", "/admin/workers", "/admin/screenshots/"))
    }
    assert found == {key: (op, [tag]) for key, (op, tag) in OPERATIONS.items()}
    for (path, method), _ in OPERATIONS.items():
        assert {"401", "403"} <= set(schema["paths"][path][method]["responses"]), path
    upload = schema["paths"]["/worker/jobs/{job_id}/screenshot"]["put"]
    assert list(upload["requestBody"]["content"]) == ["image/png"]
    assert {"201", "404", "409", "413", "415", "422"} <= set(upload["responses"])
    assert "204" in schema["paths"]["/worker/jobs/claim"]["post"]["responses"]
    created = schema["paths"]["/admin/workers"]["post"]["responses"]
    assert {"201", "409"} <= set(created)


def test_screenshot_fields_in_schema() -> None:
    schemas = create_app().openapi()["components"]["schemas"]
    assert "screenshot" in schemas["PublicCombo"]["properties"]
    assert "screenshot_state" not in schemas["PublicCombo"]["properties"]
    assert {"screenshot", "screenshot_state"} <= set(schemas["AdminCombo"]["properties"])
    assert set(schemas["Screenshot"]["properties"]) == {"width", "height", "images"}
    assert set(schemas["ScreenshotImage"]["properties"]) == {"url", "width", "height", "type"}
    assert set(schemas["ScreenshotState"]["properties"]) == {
        "state",
        "rendering",
        "reason",
        "attempts",
        "made_at",
    }
    assert "requeued" in schemas["ScreenshotSettingsChanged"]["properties"]
    assert set(schemas["Job"]["properties"]) == {
        "job_id",
        "lease_expires_at",
        "combo_id",
        "image",
        "glove",
        "knife",
        "agent",
        "render_revision",
    }
