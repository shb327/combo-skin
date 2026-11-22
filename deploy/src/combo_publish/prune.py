"""`prune-images`: deletes public images no production publish has used for 30 days, or one
combo's images at once with `--now` (spec 021, R17). It is the only way to delete images
besides a successful production publish."""

from combo_publish import images, state
from combo_publish.app import Deps

CACHE_NOTE = (
    "Cloudflare's cache may keep serving these images until they are purged: Cloudflare "
    "dashboard > the zone > Caching > Configuration > Purge Cache > Custom Purge, with each URL "
    "(deploy/README.md, Removing content now)."
)


def run(deps: Deps, *, dry_run: bool = False, now: str | None = None) -> None:
    settings = deps.settings()
    out = deps.console
    command = "prune-images" + (" --dry-run" if dry_run else "") + (f" --now {now}" if now else "")
    with state.Lock(settings.state_dir, command):
        bucket = deps.bucket(settings, settings.public_bucket, settings.images_token_service)
        listing = images.managed(bucket.objects())
        current = state.load(settings.state_dir)
        if now is not None:
            keys = images.combo_keys(listing, now)
        else:
            if current is None:
                out.print("No state yet: every listed image is marked as used today.")
            current = current or state.State()
            keys = images.due(current, listing, deps.today())
        verb = "Would delete" if dry_run else "Deleting"
        out.print(f"{verb} {len(keys)} images")
        for key in keys:
            out.print(f"  {settings.image_base_url}/{key}")
        if dry_run:
            return
        if keys:
            bucket.delete(keys)
        if current is not None:
            images.forget(current, keys)
            state.save(settings.state_dir, current)
        if now is not None and keys:
            out.print(CACHE_NOTE)
