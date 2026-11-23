"""Criterion 15: `_headers` from the example settings, and the settings themselves."""

import dataclasses
import re
import subprocess
from pathlib import Path

import pytest

from combo_publish.headers import generate, rule_count
from combo_publish.settings import Settings, SettingsError, load, parse

DEPLOY = Path(__file__).parents[1]
EXAMPLE = DEPLOY / "publish.example.toml"
GOLDEN = Path(__file__).parent / "golden" / "_headers"


def test_headers_from_the_example_settings_equal_the_golden_file() -> None:
    assert generate(load(EXAMPLE)) == GOLDEN.read_text()


def test_the_golden_file_holds_r18_to_r20_exactly() -> None:
    text = GOLDEN.read_text()
    assert (
        "  Content-Security-Policy: default-src 'none'; script-src 'self' "
        "https://static.cloudflareinsights.com; style-src 'self'; img-src 'self' "
        "https://img.combo.skin https://community.akamai.steamstatic.com; font-src 'self'; "
        "connect-src 'self' https://cloudflareinsights.com; frame-src https://view.combo.skin; "
        "manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; "
        "frame-ancestors 'none'\n"
    ) in text
    for line in (
        "  Strict-Transport-Security: max-age=31536000\n",
        "  X-Content-Type-Options: nosniff\n",
        "  Referrer-Policy: strict-origin-when-cross-origin\n",
        "  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), "
        "fullscreen=(self)\n",
        "  Cross-Origin-Opener-Policy: same-origin\n",
        "/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n",
        "/fonts/*\n  Cache-Control: public, max-age=31536000, immutable\n",
        "https://:project.pages.dev/*\n  X-Robots-Tag: noindex\n",
        "https://:version.:project.pages.dev/*\n  X-Robots-Tag: noindex\n",
    ):
        assert line in text
    # Only pages.dev addresses get noindex; combo.skin does not.
    assert text.count("X-Robots-Tag") == 2
    assert rule_count(text) == 5


def test_the_example_has_every_setting_and_only_placeholders() -> None:
    text = EXAMPLE.read_text()
    for field in dataclasses.fields(Settings):
        assert re.search(rf"^#? ?{field.name} = ", text, re.M), field.name
    assert 'account_id = "00000000000000000000000000000000"' in text
    assert "/Users/" not in text


def test_the_settings_have_no_originals_bucket() -> None:
    names = {field.name for field in dataclasses.fields(Settings)}
    assert not {name for name in names if "original" in name}
    found = subprocess.run(
        ["grep", "-rniE", "original", str(DEPLOY / "src")],
        capture_output=True,
        text=True,
        check=False,
    ).stdout
    # Only the docstring that says there is no such setting.
    assert [line for line in found.splitlines() if "no setting for the originals" not in line] == []


VALID = {
    "account_id": "0" * 32,
    "pages_project": "project",
    "site_origin": "https://combo.skin",
    "image_base_url": "https://img.combo.skin",
    "viewer_origin": "https://view.combo.skin",
    "public_bucket": "images",
    "backup_bucket": "backups",
}


def test_defaults_fill_the_optional_settings() -> None:
    settings = parse(VALID)
    assert settings.local_api_url == "http://127.0.0.1:8000"
    assert settings.local_image_base_url == "http://localhost:9000/local-images"
    assert settings.compose_project == "combo-skin"


@pytest.mark.parametrize(
    ("change", "message"),
    [
        ({"account_id": "abc"}, "account_id"),
        ({"site_origin": "http://combo.skin"}, "site_origin"),
        ({"site_origin": "https://combo.skin/"}, "site_origin"),
        ({"viewer_origin": "https://view.combo.skin/x"}, "viewer_origin"),
        ({"image_base_url": "http://img.combo.skin"}, "image_base_url"),
        ({"local_api_url": "http://192.168.1.2:8000"}, "local_api_url"),
        ({"local_api_url": "https://api.example.com"}, "local_api_url"),
        ({"local_image_base_url": "http://storage.example.com/x"}, "local_image_base_url"),
        ({"backup_bucket": "images"}, "different buckets"),
        ({"public_bucket": "Images_1"}, "public_bucket"),
        ({"pages_token_service": "combo-skin-r2-images"}, "must differ"),
        ({"originals_bucket": "x"}, "Unknown settings: originals_bucket"),
        ({"account_id": 1}, "account_id must be a non-empty string"),
    ],
)
def test_bad_settings_name_the_setting(change: dict[str, object], message: str) -> None:
    with pytest.raises(SettingsError, match=message):
        parse({**VALID, **change})


def test_a_missing_setting_is_named() -> None:
    raw = dict(VALID)
    del raw["backup_bucket"]
    with pytest.raises(SettingsError, match="Missing settings: backup_bucket"):
        parse(raw)
