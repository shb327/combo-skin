import json
from pathlib import Path

from combo_api.patterns import export
from combo_api.patterns.__main__ import main
from combo_api.patterns.data import load_groups
from tests.patterns.support import SOURCE, group, groups_file

OTHER = {
    **SOURCE,
    "title": "Another guide",
    "author": "Someone else",
    "url": "https://example.com/b",
}


def test_export_is_up_to_date() -> None:
    assert main(["export-website", "--check"]) == 0


def test_check_fails_on_stale_export(tmp_path: Path) -> None:
    stale = tmp_path / "pattern-guides.json"
    stale.write_text("{}\n")
    assert main(["export-website", "--check", "--output", str(stale)]) == 1
    assert main(["export-website", "--output", str(stale)]) == 0
    assert main(["export-website", "--check", "--output", str(stale)]) == 0
    assert stale.read_text() == export.WEBSITE_EXPORT.read_text()


def test_a_new_group_adds_its_guide() -> None:
    groups = groups_file(group(), group("gold-gem", name="Gold Gem", sources=[OTHER]))
    assert json.loads(export.render(groups)) == {
        "guides": [
            {
                "title": "A guide",
                "author": "Someone",
                "url": "https://example.com/guide",
                "groups": ["Blue Gem"],
            },
            {
                "title": "Another guide",
                "author": "Someone else",
                "url": "https://example.com/b",
                "groups": ["Gold Gem"],
            },
        ]
    }


def test_a_shared_guide_is_listed_once_with_all_its_groups() -> None:
    groups = groups_file(
        group(sources=[OTHER, SOURCE]),
        group("gold-gem", name="Gold Gem"),
        group("black-gem", name="Black Gem", sources=[SOURCE]),
    )
    guides = json.loads(export.render(groups))["guides"]
    assert [guide["url"] for guide in guides] == ["https://example.com/b", SOURCE["url"]]
    assert guides[1]["groups"] == ["Blue Gem", "Gold Gem", "Black Gem"]


def test_a_group_without_sources_adds_nothing() -> None:
    groups = groups_file(group(), group("piss-and-ice", name="Piss & Ice", sources=[]))
    guides = json.loads(export.render(groups))["guides"]
    assert [guide["groups"] for guide in guides] == [["Blue Gem"]]


def test_the_committed_file_credits_every_source() -> None:
    data = json.loads(export.WEBSITE_EXPORT.read_text())
    urls = {guide["url"] for guide in data["guides"]}
    sources = {source.url for g in load_groups().groups for source in g.sources}
    assert urls == sources
    assert all(guide["url"].startswith("https://") for guide in data["guides"])
