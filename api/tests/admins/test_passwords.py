import unicodedata

import pytest
from argon2 import PasswordHasher, profiles

from combo_api.admins import passwords

USERNAME = "placeholder"
GOOD = "correct horse battery staple"


def test_hasher_uses_the_rfc_9106_low_memory_profile() -> None:
    parameters = profiles.RFC_9106_LOW_MEMORY
    assert passwords.HASHER.time_cost >= parameters.time_cost
    assert passwords.HASHER.memory_cost >= parameters.memory_cost
    assert passwords.HASHER.parallelism >= parameters.parallelism
    assert passwords.hash_password(GOOD).startswith("$argon2id$")


def test_hash_verifies_and_is_not_the_password() -> None:
    stored = passwords.hash_password(GOOD)
    assert GOOD not in stored
    assert passwords.verify(stored, GOOD)
    assert not passwords.verify(stored, GOOD + "!")
    assert not passwords.verify("not-a-hash", GOOD)
    assert not passwords.verify(None, GOOD)


def test_equivalent_unicode_forms_verify() -> None:
    composed = "café au lait, s'il vous plaît"
    decomposed = unicodedata.normalize("NFD", composed)
    assert composed != decomposed
    assert passwords.verify(passwords.hash_password(composed), decomposed)


def test_weaker_hash_needs_rehash() -> None:
    weak = PasswordHasher.from_parameters(profiles.CHEAPEST).hash(GOOD)
    assert passwords.needs_rehash(weak)
    assert not passwords.needs_rehash(passwords.hash_password(GOOD))


def test_a_good_password_passes() -> None:
    assert passwords.password_problem(GOOD, USERNAME) is None
    assert passwords.password_problem("x" * 7 + " " + "y" * 248, USERNAME) is None


@pytest.mark.parametrize(
    ("password", "words"),
    [
        ("fourteen chars", "at least 15"),
        ("x" * 257, "at most 256"),
        ("iloveyouforever", "common"),
        ("ILoveYouForever", "common"),
        ("my placeholder is long", "username"),
        ("my PlaceHolder is long", "username"),
    ],
)
def test_bad_passwords_name_the_rule(password: str, words: str) -> None:
    problem = passwords.password_problem(password, USERNAME)
    assert problem is not None
    assert words in problem
    assert password not in problem


def test_length_is_counted_after_normalisation() -> None:
    # Each ligature normalises to two letters, so 8 of them are 16 characters.
    assert passwords.password_problem("ﬁ" * 8, USERNAME) is None
    assert passwords.password_problem("ﬁ" * 7, USERNAME) is not None


def test_common_list_meets_the_length_rule() -> None:
    entries = passwords.common_passwords()
    assert len(entries) > 10_000
    for entry in entries:
        assert passwords.MIN_LENGTH <= len(entry) <= passwords.MAX_LENGTH
        assert entry == unicodedata.normalize("NFKC", entry).casefold()
