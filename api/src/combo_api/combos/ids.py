"""Public combo ids: what URLs and responses use instead of the table's own key."""

import secrets
import string

ALPHABET = string.digits + string.ascii_lowercase
LENGTH = 12


def new_public_id() -> str:
    """12 characters from `0-9a-z`, about 62 bits from the operating system's secure random
    generator. The table's unique constraint backs it."""
    return "".join(secrets.choice(ALPHABET) for _ in range(LENGTH))
