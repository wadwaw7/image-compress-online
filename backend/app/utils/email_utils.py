from __future__ import annotations

import re
from typing import Optional

from ..core.config import get_settings

settings = get_settings()

# 邮箱本地部分：仅允许字母数字和常见符号
_email_local_re = re.compile(r"^[A-Za-z0-9]+[A-Za-z0-9._\-]*$")


def is_real_email(email: Optional[str]) -> bool:
    """是否为真实可投递邮箱（避免把 username@local 当成真实邮箱）。"""
    e = (email or "").strip().lower()
    return bool(e) and ("@" in e) and (not e.endswith("@local"))


def _allowed_domains() -> set[str]:
    raw = getattr(settings, "ALLOWED_EMAIL_DOMAINS", "@qq.com,@local")
    domains = {d.strip().lower() for d in (raw or "").split(",") if d.strip()}
    return domains or {"@qq.com", "@local"}


def _validate_email_local(email: str) -> bool:
    """验证邮箱本地部分不包含危险字符"""
    if "@" not in email:
        return True
    local = email.split("@")[0]
    if not local:
        return False
    if not _email_local_re.match(local):
        return False
    return True


def is_allowed_register_email(email: Optional[str]) -> bool:
    """注册时允许的邮箱域名。允许为空。且验证本地部分无 XSS。"""
    e = (email or "").strip().lower()
    if not e:
        return True
    if not _validate_email_local(e):
        return False
    domains = _allowed_domains()
    return any(e.endswith(d) for d in domains)


def is_allowed_bind_email(email: Optional[str]) -> bool:
    """绑定/修改邮箱允许的域名。要求必须提供邮箱。且验证本地部分无 XSS。"""
    e = (email or "").strip().lower()
    if not e:
        return False
    if not _validate_email_local(e):
        return False
    domains = _allowed_domains()
    return any(e.endswith(d) for d in domains)

