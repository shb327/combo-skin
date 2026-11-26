"""Criterion 14: `status`."""

from tests.support import PAGES_TOKEN, SECRETS, World, combo, git


def publish_and_point_canonical(world: World) -> str:
    world.add(combo("a", ("specialist", "mogul"), ("karambit", "fade")))
    assert world.run("publish").code == 0
    return git(world.repo, "rev-parse", "origin/main")


def test_status_prints_the_live_deployment_and_that_nothing_changed(world: World) -> None:
    commit = publish_and_point_canonical(world)
    deploys = len(world.deploys())
    seen = len(world.http.requests)
    result = world.run("status")
    assert result.code == 0, result.err
    assert result.out.splitlines() == [
        f"Live: deployment dep2, commit {commit[:12]}, 2026-11-22T03:00:02.000000Z",
        "Behind origin/main: 0 commits",
        "Data: the local published combos match the live site",
    ]
    # It changes nothing, and asked the Pages API with the token in a header only.
    assert len(world.deploys()) == deploys
    api = [
        (url, headers) for url, headers in world.http.requests[seen:] if "api.cloudflare.com" in url
    ]
    assert api == [
        (
            "https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef"
            "/pages/projects/combo-test",
            {"Authorization": f"Bearer {PAGES_TOKEN}"},
        )
    ]
    for secret in SECRETS:
        assert secret not in result.out + result.err


def test_status_counts_commits_behind_and_changed_data(world: World) -> None:
    publish_and_point_canonical(world)
    world.commit_on_main("README.md", "one\n")
    world.commit_on_main("README.md", "two\n")
    world.add(combo("b", ("specialist", "mogul"), ("bayonet", "lore")))
    result = world.run("status")
    assert result.code == 0, result.err
    assert "Behind origin/main: 2 commits" in result.out
    # The counts, the mogul file and the new lore file.
    assert "Data: 3 data files differ from the live site; publish to update it" in result.out


def test_status_after_a_rollback_reads_the_rolled_back_deployment(world: World) -> None:
    publish_and_point_canonical(world)
    world.add(combo("b", ("specialist", "mogul"), ("bayonet", "lore")))
    assert world.run("publish").code == 0
    assert world.state()["live"]["deployment"] == "dep4"
    world.roll_back("dep2")
    # Rolled back to the first publish (dep2), whose data lacks combo b.
    result = world.run("status")
    assert "Live: deployment dep2" in result.out
    assert "Data: 3 data files differ from the live site" in result.out


def test_status_without_the_pages_token_says_how_to_add_it(world: World) -> None:
    del world.keychain.values["combo-skin-pages"]
    result = world.run("status")
    assert result.code == 1
    assert "security add-generic-password -U -s combo-skin-pages" in result.err
