"""管理员相关接口"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import func

from ...database import get_db
from ...models.user import User
from ...utils.audit import log_audit
from ...utils.login_limiter import LoginLimiter
from ...utils.security import get_current_token

router = APIRouter(prefix="/admin", tags=["admin"])


def _require_admin(token: dict, db: Session) -> User:
    current_user_id = int(token.get("sub"))
    current_user = db.query(User).get(current_user_id)
    if not current_user:
        raise HTTPException(status_code=404, detail="当前用户不存在")
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅管理员可操作")
    return current_user


@router.get("/users")
def list_users(
    q: str | None = Query(default=None, description="按用户名/邮箱/昵称模糊搜索"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    token=Depends(get_current_token),
    db: Session = Depends(get_db),
):
    """管理员：查询所有用户（分页+搜索）"""
    _require_admin(token, db)

    query = db.query(User)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (User.username.like(like))
            | (User.email.like(like))
            | (User.nickname.like(like))
        )

    total = query.count()
    items = (
        query.order_by(User.id.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "items": [
            {
                "id": u.id,
                "username": u.username,
                "nickname": u.nickname,
                "email": u.email,
                "is_admin": bool(getattr(u, "is_admin", False)),
                "is_active": bool(getattr(u, "is_active", True)),
                "failed_login_attempts": int(getattr(u, "failed_login_attempts", 0) or 0),
                "locked_until": getattr(u, "locked_until", None),
                "created_at": getattr(u, "created_at", None),
                "last_login": getattr(u, "last_login", None),
            }
            for u in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    request: Request,
    token=Depends(get_current_token),
    db: Session = Depends(get_db),
):
    """管理员：注销/删除指定用户（含关联数据）。

    注意：不可删除自己（避免误操作锁死后台）。
    """
    admin_user = _require_admin(token, db)
    if admin_user.id == user_id:
        raise HTTPException(status_code=400, detail="管理员不能删除自己")

    user = db.query(User).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 清理依赖数据
    from ...models.record import CompressTask, DownloadLog
    from ...models.image import Image as ImageModel

    try:
        db.query(DownloadLog).filter(DownloadLog.user_id == user_id).delete(synchronize_session=False)
        db.query(CompressTask).filter(CompressTask.user_id == user_id).delete(synchronize_session=False)
        db.query(ImageModel).filter(ImageModel.user_id == user_id).delete(synchronize_session=False)
        db.delete(user)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="删除用户失败")

    log_audit(db, admin_user.id, "admin_delete_user", "user", user_id, f"管理员 {admin_user.username} 删除了用户 {user.username}", ip_address=request.client.host if request.client else "", user_agent=request.headers.get("User-Agent", ""))
    return {"ok": True, "deleted_user_id": user_id}


@router.post("/users/{user_id}/lock")
def lock_user_account(
    user_id: int,
    request: Request,
    minutes: int = 30,
    token=Depends(get_current_token),
    db: Session = Depends(get_db),
):
    """锁定用户账户"""
    admin_user = _require_admin(token, db)

    user = db.query(User).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    limiter = LoginLimiter(db)
    limiter.lock_account(user, minutes)
    log_audit(db, admin_user.id, "admin_lock_user", "user", user_id, f"管理员 {admin_user.username} 锁定了用户 {user.username} ({minutes}分钟)", ip_address=request.client.host if request.client else "", user_agent=request.headers.get("User-Agent", ""))
    return {"message": f"用户 {user.username} 已被锁定 {minutes} 分钟"}


@router.post("/users/{user_id}/unlock")
def unlock_user_account(user_id: int, request: Request, token=Depends(get_current_token), db: Session = Depends(get_db)):
    """解锁用户账户"""
    admin_user = _require_admin(token, db)

    user = db.query(User).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    limiter = LoginLimiter(db)
    limiter.unlock_account(user)
    log_audit(db, admin_user.id, "admin_unlock_user", "user", user_id, f"管理员 {admin_user.username} 解锁了用户 {user.username}", ip_address=request.client.host if request.client else "", user_agent=request.headers.get("User-Agent", ""))
    return {"message": f"用户 {user.username} 已被解锁"}


@router.post("/users/{user_id}/activate")
def activate_user_account(user_id: int, request: Request, token=Depends(get_current_token), db: Session = Depends(get_db)):
    """激活用户账户"""
    admin_user = _require_admin(token, db)

    user = db.query(User).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    limiter = LoginLimiter(db)
    limiter.activate_account(user)
    log_audit(db, admin_user.id, "admin_activate_user", "user", user_id, f"管理员 {admin_user.username} 激活了用户 {user.username}", ip_address=request.client.host if request.client else "", user_agent=request.headers.get("User-Agent", ""))
    return {"message": f"用户 {user.username} 已被激活"}


@router.post("/users/{user_id}/deactivate")
def deactivate_user_account(user_id: int, request: Request, token=Depends(get_current_token), db: Session = Depends(get_db)):
    """停用用户账户"""
    admin_user = _require_admin(token, db)

    user = db.query(User).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    user.is_active = False
    db.add(user)
    db.commit()
    log_audit(db, admin_user.id, "admin_deactivate_user", "user", user_id, f"管理员 {admin_user.username} 停用了用户 {user.username}", ip_address=request.client.host if request.client else "", user_agent=request.headers.get("User-Agent", ""))
    return {"message": f"用户 {user.username} 已被停用"}


@router.get("/users/{user_id}/status")
def get_user_status(user_id: int, token=Depends(get_current_token), db: Session = Depends(get_db)):
    """获取用户账户状态"""
    _require_admin(token, db)

    user = db.query(User).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    return {
        "user_id": user.id,
        "username": user.username,
        "nickname": user.nickname,
        "email": user.email,
        "is_admin": bool(getattr(user, "is_admin", False)),
        "is_active": bool(getattr(user, "is_active", True)),
        "failed_login_attempts": user.failed_login_attempts,
        "locked_until": user.locked_until,
        "last_login": user.last_login,
        "created_at": user.created_at,
    }
