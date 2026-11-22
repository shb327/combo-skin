"""Everything the command prints goes through here, with every credential it has read
replaced by `***`, as a last guard: no code path prints one on purpose."""

from typing import TextIO


class Console:
    def __init__(self, out: TextIO, err: TextIO) -> None:
        self._out = out
        self._err = err
        self._secrets: set[str] = set()

    def secret(self, value: str) -> str:
        """Registers a credential, so it is never printed, and returns it."""
        if value:
            self._secrets.add(value)
        return value

    def redact(self, text: str) -> str:
        for value in sorted(self._secrets, key=len, reverse=True):
            text = text.replace(value, "***")
        return text

    def print(self, text: str = "") -> None:
        self._out.write(self.redact(text) + "\n")
        self._out.flush()

    def error(self, text: str) -> None:
        self._err.write(self.redact(text) + "\n")
        self._err.flush()
