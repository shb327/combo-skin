"""Object keys. Upload and version ids are new for every upload and every rebuild, so a
changed image always has a new key and caches never serve an old one."""

from combo_api.combos.ids import new_public_id

new_id = new_public_id


def original_key(combo_id: str, upload_id: str) -> str:
    return f"combos/{combo_id}/{upload_id}.png"


def version_key(combo_id: str, version_id: str, width: int) -> str:
    return f"combos/{combo_id}/{version_id}/{width}.webp"


def version_keys(combo_id: str, version_id: str, widths: list[int]) -> list[str]:
    return [version_key(combo_id, version_id, width) for width in widths]
