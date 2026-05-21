from __future__ import annotations

import random
import time
from dataclasses import dataclass
from typing import Any


@dataclass
class CodeItem:
    value: Any
    expire_at: float


class EmailCodeStore:
    """Simple in-memory code/value store for single-instance deployments."""

    def __init__(self) -> None:
        self._data: dict[tuple[str, str], CodeItem] = {}

    def _key(self, purpose: str, subject: str) -> tuple[str, str]:
        return (purpose, (subject or "").strip().lower())

    def _get_valid_item(self, purpose: str, subject: str) -> CodeItem | None:
        key = self._key(purpose, subject)
        item = self._data.get(key)
        if not item:
            return None
        if time.time() > item.expire_at:
            self._data.pop(key, None)
            return None
        return item

    def set(self, purpose: str, subject: str, value: Any, ttl_seconds: int) -> None:
        self._data[self._key(purpose, subject)] = CodeItem(
            value=value,
            expire_at=time.time() + ttl_seconds,
        )

    def get(self, purpose: str, subject: str) -> Any | None:
        item = self._get_valid_item(purpose, subject)
        return item.value if item else None

    def delete(self, purpose: str, subject: str) -> None:
        self._data.pop(self._key(purpose, subject), None)

    def verify(self, purpose: str, subject: str, code: str) -> bool:
        key = self._key(purpose, subject)
        item = self._get_valid_item(purpose, subject)
        if not item:
            return False
        if (code or "").strip() != str(item.value):
            return False
        self._data.pop(key, None)
        return True


STORE = EmailCodeStore()


def gen_code(length: int = 6) -> str:
    length = max(4, min(8, int(length)))
    return "".join(str(random.randint(0, 9)) for _ in range(length))
