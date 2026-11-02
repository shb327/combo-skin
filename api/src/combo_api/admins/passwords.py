"""Password hashing with Argon2id, and the rules a new password must follow."""

import secrets
import unicodedata
from functools import cache
from importlib.resources import files

from argon2 import PasswordHasher, profiles
from argon2.exceptions import InvalidHashError, VerificationError

MIN_LENGTH = 15
MAX_LENGTH = 256
COMMON_PASSWORDS = "common_passwords.txt"

HASHER = PasswordHasher.from_parameters(profiles.RFC_9106_LOW_MEMORY)

_dummy_hash: str | None = None


def normalise(password: str) -> str:
    """The form that is measured and hashed: Unicode NFKC."""
    return unicodedata.normalize("NFKC", password)


def hash_password(password: str) -> str:
    return HASHER.hash(normalise(password))


def dummy_hash() -> str:
    global _dummy_hash
    if _dummy_hash is None:
        _dummy_hash = HASHER.hash(secrets.token_urlsafe(32))
    return _dummy_hash


def prepare() -> None:
    """Make the dummy hash now, so the first unknown-username login takes no longer than others."""
    dummy_hash()


def verify(stored_hash: str | None, password: str) -> bool:
    """Check a password against a stored hash, or against a dummy hash when there is none.

    Either way exactly one Argon2 verification runs, so an unknown username takes as long
    as a wrong password.
    """
    if stored_hash is None:
        stored_hash = dummy_hash()
        known = False
    else:
        known = True
    try:
        HASHER.verify(stored_hash, normalise(password))
    except VerificationError, InvalidHashError:
        return False
    return known


def needs_rehash(stored_hash: str) -> bool:
    return HASHER.check_needs_rehash(stored_hash)


@cache
def common_passwords() -> frozenset[str]:
    text = files(__package__).joinpath(COMMON_PASSWORDS).read_text(encoding="utf-8")
    return frozenset(text.splitlines())


def password_problem(password: str, username: str) -> str | None:
    """Why a new password is refused, or None. Never repeats the password."""
    normalised = normalise(password)
    if len(normalised) < MIN_LENGTH:
        return f"The password must have at least {MIN_LENGTH} characters."
    if len(normalised) > MAX_LENGTH:
        return f"The password must have at most {MAX_LENGTH} characters."
    folded = normalised.casefold()
    if folded in common_passwords():
        return "The password is on the list of common passwords."
    if username.casefold() in folded:
        return "The password must not contain the username."
    return None
