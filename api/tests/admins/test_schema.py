from combo_api.main import create_app


def test_admin_routes_in_schema() -> None:
    paths = create_app().openapi()["paths"]
    expected = {
        # 500 is declared on every route (`internal_error`).
        ("/admin/login", "post", "admin_login"): {"200", "401", "403", "415", "422", "429", "500"},
        ("/admin/me", "get", "admin_me"): {"200", "401", "500"},
        ("/admin/logout", "post", "admin_logout"): {"204", "403", "500"},
    }
    for (path, method, operation_id), statuses in expected.items():
        operation = paths[path][method]
        assert operation["operationId"] == operation_id
        assert operation["tags"] == ["admin"]
        assert set(operation["responses"]) == statuses
    login = paths["/admin/login"]["post"]
    body = login["requestBody"]["content"]["application/json"]["schema"]
    assert body == {"$ref": "#/components/schemas/Credentials"}
    ok = login["responses"]["200"]["content"]["application/json"]["schema"]
    assert ok == {"$ref": "#/components/schemas/AdminSession"}
    for status in ("401", "403", "415", "429"):
        error = login["responses"][status]["content"]["application/json"]["schema"]
        assert error == {"$ref": "#/components/schemas/Error"}
