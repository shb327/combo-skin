"""Criterion 1: `check`."""

from tests.support import PAGES_TOKEN, SECRETS, World


def test_everything_present_is_ready(world: World) -> None:
    result = world.run("check")
    assert result.code == 0, result.out + result.err
    lines = result.out.splitlines()
    assert lines and all(line.strip().startswith("ready") for line in lines)
    for item in (
        "settings",
        "Keychain item combo-skin-pages",
        "Keychain item combo-skin-r2-images",
        "Keychain item combo-skin-r2-backup",
        "local API",
        "local image bucket",
        "public schemas match",
        "node",
        "npm",
        "wrangler",
        "wrangler sees the account",
    ):
        assert item in result.out
    # Only `whoami` saw the token, through its environment.
    assert [call["argv"] for call in world.calls("wrangler")] == [["--version"], ["whoami"]]
    assert world.calls("wrangler")[1]["env"]["CLOUDFLARE_API_TOKEN"] == PAGES_TOKEN


def test_a_missing_keychain_item_names_the_service_and_command_but_no_value(world: World) -> None:
    del world.keychain.values["combo-skin-r2-backup"]
    result = world.run("check")
    assert result.code == 1
    assert "MISSING  Keychain item combo-skin-r2-backup" in result.out
    assert "security add-generic-password -U -s combo-skin-r2-backup -a combo-skin -w" in result.out
    for secret in SECRETS:
        assert secret not in result.out + result.err


def test_missing_keychain_items_and_no_api_are_reported(world: World) -> None:
    world.keychain.values.clear()
    world.api_down = True
    result = world.run("check")
    assert result.code == 1
    assert "MISSING  local API" in result.out
    assert "MISSING  wrangler sees the account: needs the Pages token first" in result.out
    # Without a token, wrangler never runs with one.
    assert [call["argv"] for call in world.calls("wrangler")] == [["--version"]]


def test_a_wrong_wrangler_version_or_account_is_reported(world: World) -> None:
    world.config.update(version="4.0.0", account="f" * 32)
    world.write_config()
    result = world.run("check")
    assert result.code == 1
    assert "MISSING  wrangler: " in result.out
    assert "MISSING  wrangler sees the account" in result.out


def test_schema_drift_is_reported(world: World) -> None:
    world.api.openapi["components"]["schemas"]["Item"]["properties"]["seeds"] = {"type": "string"}
    result = world.run("check")
    assert result.code == 1
    assert "MISSING  public schemas match origin/main (as last fetched): Item differ" in result.out
    assert "rebuild the stack first" in result.out


def test_bad_settings_stop_the_check(world: World) -> None:
    world.settings_path.write_text('account_id = "x"\n')
    result = world.run("check")
    assert result.code == 1
    assert "MISSING  settings" in result.out
