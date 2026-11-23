"""Credentials, read from the macOS Keychain at run time and never printed, logged or written.

Each credential is a generic password item named by its service (a setting). The Pages token
is the token itself. An R2 token is `<access key id>:<secret access key>` in one item.
"""

import subprocess
from dataclasses import dataclass
from typing import Protocol

SECURITY = "/usr/bin/security"


class MissingCredential(Exception):
    """A Keychain item that is not there. The message has the service and the command to add
    it, never a value."""

    def __init__(self, service: str) -> None:
        self.service = service
        super().__init__(
            f"No Keychain item for {service}. Add it with:\n"
            f"  {add_command(service)}\n"
            "and type the value at the prompt, so it is never on a command line."
        )


def add_command(service: str) -> str:
    return f"security add-generic-password -U -s {service} -a combo-skin -w"


class Keychain(Protocol):
    def has(self, service: str) -> bool: ...

    def read(self, service: str) -> str: ...


@dataclass(frozen=True)
class R2Credentials:
    access_key_id: str
    secret_access_key: str

    def __repr__(self) -> str:
        return "R2Credentials(<hidden>)"


def r2_credentials(keychain: Keychain, service: str) -> R2Credentials:
    key_id, colon, secret = keychain.read(service).partition(":")
    if not colon or not key_id or not secret:
        raise MissingCredential(service)
    return R2Credentials(key_id.strip(), secret.strip())


class MacKeychain:
    """The login Keychain, through `security`. Output with values goes nowhere but the return
    value of `read`."""

    def has(self, service: str) -> bool:
        # Without -w, `security` prints the item's attributes, not its value; both are dropped.
        result = subprocess.run(  # noqa: S603
            [SECURITY, "find-generic-password", "-s", service],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        return result.returncode == 0

    def read(self, service: str) -> str:
        result = subprocess.run(  # noqa: S603
            [SECURITY, "find-generic-password", "-s", service, "-w"],
            capture_output=True,
            text=True,
            check=False,
        )
        value = result.stdout.rstrip("\n")
        if result.returncode != 0 or not value:
            raise MissingCredential(service)
        return value
