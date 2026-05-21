from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone


def new_token(nbytes: int = 32) -> str:
    # urlsafe token
    return secrets.token_urlsafe(nbytes)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def minutes_from_now(minutes: int) -> datetime:
    return utcnow() + timedelta(minutes=minutes)

