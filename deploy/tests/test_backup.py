"""Criterion 21: `backup`, with a fake docker and bucket."""

import stat
from datetime import datetime, timedelta

from combo_publish.backup import remote_keep
from tests.support import BACKUP_KEY, BACKUP_SECRET, FakeBucket, World


def stamp(moment: datetime) -> str:
    return moment.strftime("%Y-%m-%d_%H%M%S") + ".dump"


def test_a_good_dump_is_kept_private_and_uploaded(world: World) -> None:
    result = world.run("backup")
    assert result.code == 0, result.err
    name = stamp(world.now)
    local = world.settings.backup_dir / name
    assert local.read_bytes() == b"PGDMP fake dump 1"
    assert stat.S_IMODE(local.stat().st_mode) == 0o600
    assert stat.S_IMODE(world.settings.backup_dir.stat().st_mode) == 0o700
    bucket = world.buckets.buckets["backups-test"]
    assert bucket.store[f"db/{name}"][0] == b"PGDMP fake dump 1"
    assert world.buckets.opened == [("0123456789abcdef0123456789abcdef", "backups-test")]
    assert result.out.splitlines()[-1] == "OK"
    assert "images-test" not in world.buckets.buckets
    for secret in (BACKUP_KEY, BACKUP_SECRET):
        assert secret not in result.out + result.err
    # The dump was made and checked inside the db container, with its own credentials.
    calls = [call["argv"] for call in world.calls("docker")]
    assert calls[0][:2] == ["ps", "-q"]
    assert "label=com.docker.compose.project=combo-skin" in calls[0]
    assert calls[1] == [
        "exec",
        "cid0",
        "sh",
        "-c",
        'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"',
    ]
    assert calls[2] == ["exec", "-i", "cid0", "pg_restore", "--list"]


def test_a_dump_that_does_not_read_back_is_not_kept(world: World) -> None:
    world.config["restore_fails"] = True
    world.write_config()
    result = world.run("backup")
    assert result.code == 1
    assert "does not read back" in result.err
    assert not world.settings.backup_dir.exists() or list(world.settings.backup_dir.iterdir()) == []
    assert "backups-test" not in world.buckets.buckets


def test_a_failed_upload_exits_non_zero_and_deletes_no_local_dump(world: World) -> None:
    folder = world.settings.backup_dir
    folder.mkdir(parents=True)
    old = [stamp(world.now - timedelta(days=day)) for day in range(1, 41)]
    for name in old:
        (folder / name).write_bytes(b"PGDMP old")
    world.buckets.buckets["backups-test"] = bucket = FakeBucket()
    bucket.fail_put = True
    result = world.run("backup")
    assert result.code == 1
    assert "Upload failed; the local dump is kept" in result.err
    assert result.err.startswith("2026-11-22T03:00:00 ")
    assert len(list(folder.glob("*.dump"))) == 41


def test_retention_keeps_30_local_and_30_daily_plus_12_monthly_remote(world: World) -> None:
    folder = world.settings.backup_dir
    folder.mkdir(parents=True)
    bucket = world.buckets(world.settings.account_id, "backups-test", None)  # type: ignore[arg-type]
    world.buckets.opened.clear()
    days = [world.now - timedelta(days=day) for day in range(1, 500)]
    for moment in days:
        bucket.store[f"db/{stamp(moment)}"] = (b"PGDMP", "application/octet-stream", None)
    # Locally, 40 old dumps, of which the oldest 5 have no copy in the bucket.
    for moment in days[:35]:
        (folder / stamp(moment)).write_bytes(b"PGDMP")
    lonely = [world.now - timedelta(days=1000 + day) for day in range(5)]
    for moment in lonely:
        (folder / stamp(moment)).write_bytes(b"PGDMP")
    (folder / "notes.txt").write_text("not a dump")

    assert world.run("backup").code == 0
    remote = sorted(bucket.store)
    newest = [f"db/{stamp(moment)}" for moment in [world.now, *days[:29]]]
    assert set(newest) <= set(remote)
    monthly = set(remote) - set(newest)
    assert len(monthly) == 11
    # Each one the first dump of its month, in the 12 newest months.
    for key in monthly:
        assert key == min(k for k in remote if k[3:10] == key[3:10])
    assert {key[3:10] for key in remote} == {
        f"{(world.now - timedelta(days=31 * m)):%Y-%m}" for m in range(12)
    }
    local = sorted(path.name for path in folder.glob("*.dump"))
    # The newest 30, plus the 5 that exist nowhere else.
    assert len(local) == 35
    assert {stamp(moment) for moment in lonely} <= set(local)
    assert (folder / "notes.txt").exists()


def test_remote_keep_takes_the_first_dump_of_each_of_12_months() -> None:
    first = datetime(2025, 1, 1, 3)
    keys = [f"db/{stamp(first + timedelta(days=day))}" for day in range(691)]
    assert keys[-1] == "db/2026-11-22_030000.dump"
    keep = remote_keep(keys)
    assert set(keys[-30:]) <= keep
    assert "db/2025-11-01_030000.dump" not in keep  # the 13th month back
    firsts = {
        f"db/{year}-{month:02d}-01_030000.dump"
        for year, month in [(2025, 12), *((2026, m) for m in range(1, 11))]
    }
    assert keep == set(keys[-30:]) | firsts
