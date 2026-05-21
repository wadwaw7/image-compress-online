"""审计日志工具 — 记录关键操作到 audit_logs 表"""

from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy.orm import Session

from ..models.user import AuditLog

logger = logging.getLogger(__name__)


def log_audit(
    db: Session,
    user_id: int,
    action: str,
    resource_type: str,
    resource_id: Optional[int] = None,
    description: str = "",
    ip_address: str = "",
    user_agent: str = "",
    status: str = "success",
    error_message: Optional[str] = None,
) -> None:
    """写入一条审计日志。失败不抛异常，仅记录 warning。"""
    try:
        entry = AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            description=description,
            ip_address=ip_address,
            user_agent=user_agent,
            status=status,
            error_message=error_message,
        )
        db.add(entry)
        db.commit()
    except Exception:
        db.rollback()
        logger.warning("Failed to write audit log: action=%s user=%s", action, user_id)
