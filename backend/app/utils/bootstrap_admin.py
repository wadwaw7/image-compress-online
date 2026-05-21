from __future__ import annotations

import os
import logging
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from .security import get_password_hash

logger = logging.getLogger(__name__)


DEFAULT_ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "")
DEFAULT_ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "")
DEFAULT_ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
DEFAULT_ADMIN_NICKNAME = os.getenv("ADMIN_NICKNAME", "管理员")


def ensure_default_admin(engine: Engine) -> None:
    """确保存在一个默认管理员账号（开发/演示用）。

    - 若 users 表不存在/缺少关键列，则直接返回
    - 若管理员用户已存在，则确保 is_admin=1
    - 若不存在，则创建：username=152563, password=152563

    注意：此函数设计为“幂等”，可在每次启动时调用。
    """

    if not DEFAULT_ADMIN_USERNAME or not DEFAULT_ADMIN_PASSWORD:
        logger.warning("ADMIN_USERNAME or ADMIN_PASSWORD not set — skipping admin bootstrap")
        return

    try:
        inspector = inspect(engine)
        if "users" not in inspector.get_table_names():
            return

        cols = {c["name"] for c in inspector.get_columns("users")}
        required = {"username", "email", "password_hash", "is_admin"}
        if not required.issubset(cols):
            return

        with engine.begin() as conn:
            # 是否存在 admin 用户
            row = conn.execute(
                text("SELECT id, is_admin FROM users WHERE lower(username)=lower(:u) LIMIT 1"),
                {"u": DEFAULT_ADMIN_USERNAME},
            ).fetchone()

            if row:
                # 确保是管理员
                conn.execute(
                    text("UPDATE users SET is_admin=1 WHERE id=:id"),
                    {"id": row[0]},
                )
                return

            # 创建 admin 用户
            pwd_hash = get_password_hash(DEFAULT_ADMIN_PASSWORD)
            conn.execute(
                text(
                    """
                    INSERT INTO users (username, email, password_hash, nickname, status, is_active, failed_login_attempts, is_admin)
                    VALUES (:username, :email, :password_hash, :nickname, 1, 1, 0, 1)
                    """
                ),
                {
                    "username": DEFAULT_ADMIN_USERNAME,
                    "email": DEFAULT_ADMIN_EMAIL,
                    "password_hash": pwd_hash,
                    "nickname": DEFAULT_ADMIN_NICKNAME,
                },
            )

    except Exception:
        # 启动兜底：不要因为创建管理员失败阻断应用启动
        return

