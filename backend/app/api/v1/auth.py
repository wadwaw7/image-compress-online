from datetime import datetime, timedelta
from time import time
from typing import Optional
import json

from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from ...database import get_db
from ...models.user import User
from ...schemas.user import UserCreate, UserLogin, UserOut, UserOutAdmin, Token, Verify2FARequest
from ...schemas.password_reset import ForgotPasswordRequest, ResetPasswordRequest
from ...schemas.email_bind import BindEmailRequest
from ...utils.security import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_token,
    normalize_username,
    normalize_nickname,
    normalize_email,
    validate_password_strength,
)
from ...utils.login_limiter import LoginLimiter
from ...core.config import get_settings
from ...utils.email_sender import send_email, EmailSendError
from ...utils.tokens import new_token, minutes_from_now
from ...utils.email_utils import is_real_email, is_allowed_register_email, is_allowed_bind_email
from ...utils.email_codes import STORE, gen_code
from ...utils.audit import log_audit
from ...utils.ratelimit import limiter

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()

def _lc(s: Optional[str]) -> str:
    return (s or "").strip()

def _get_client_ip(request: Request) -> str:
    """获取真实客户端 IP，优先从代理头中提取（兼容 Cloudflare / nginx 代理）"""
    cf_ip = request.headers.get("CF-Connecting-IP")
    if cf_ip:
        return cf_ip.strip()
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    xri = request.headers.get("X-Real-IP")
    if xri:
        return xri.strip()
    return (request.client.host if request.client else "127.0.0.1")

def get_user_by_username_or_email(db: Session, identifier: str) -> Optional[User]:
    ident = _lc(identifier)
    if "@" in ident:
        return db.query(User).filter(func.lower(User.email) == ident.lower()).first()
    return db.query(User).filter(func.lower(User.username) == ident.lower()).first()

@router.post("/register", response_model=UserOut)
@limiter.limit("5/hour")
def register(request: Request, payload: UserCreate, db: Session = Depends(get_db)):
    username = normalize_username(_lc(payload.username))
    validate_password_strength(payload.password)
    raw_nickname = _lc(getattr(payload, "nickname", None)) if getattr(payload, "nickname", None) is not None else None
    nickname = normalize_nickname(raw_nickname)
    email_in = _lc(getattr(payload, "email", None)) or ""
    if not is_allowed_register_email(email_in):
        raise HTTPException(status_code=422, detail="邮箱格式不正确，仅允许 @qq.com 或不填")
    email = normalize_email(email_in) if email_in else f"{username}@local"
    if not username or not (payload.password or ""):
        raise HTTPException(status_code=422, detail="用户名和密码不能为空")
    if db.query(User).filter(func.lower(User.username) == username.lower()).first():
        raise HTTPException(status_code=409, detail="用户名已存在")
    if is_real_email(email):
        if db.query(User).filter(func.lower(User.email) == email.lower()).first():
            raise HTTPException(status_code=409, detail="邮箱已存在")
    if nickname:
        if db.query(User).filter(func.lower(User.nickname) == nickname.lower()).first():
            raise HTTPException(status_code=409, detail="昵称已存在")
    user = User(username=username, email=email, nickname=nickname, password_hash=get_password_hash(payload.password), status=1, is_active=True, is_email_verified=False)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="邮箱地址已被占用")
    db.refresh(user)
    log_audit(db, user.id, "register", "user", user.id, f"新用户注册: {username}", ip_address=_get_client_ip(request), user_agent=request.headers.get("User-Agent", ""))
    return user

@router.post("/login")
@limiter.limit("5/minute")
@limiter.limit("30/hour")
def login(request: Request, payload: UserLogin, db: Session = Depends(get_db)):
    ident = _lc(payload.username_or_email)
    login_limiter = LoginLimiter(db)

    user = get_user_by_username_or_email(db, ident)
    if not user or not verify_password(payload.password, user.password_hash):
        if user:
            _, error_msg = login_limiter.record_failed_login(user)
            log_audit(db, user.id, "login_failed", "user", user.id, f"登录失败（密码错误）: {ident}", ip_address=_get_client_ip(request), user_agent=request.headers.get("User-Agent", ""), status="failure")
        else:
            error_msg = "用户名或密码错误"
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=error_msg)

    allowed, error_msg = login_limiter.check_login_allowed(user)
    if not allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=error_msg)

    if user.is_admin:
        client_ip = _get_client_ip(request)
        raw_trusted = user.trusted_ips or []

        # 过滤过期信任 IP（超过 7 天）
        now_ts = datetime.utcnow().isoformat()
        active_trusted = []
        trusted_ip_set = set()
        for entry in raw_trusted:
            if isinstance(entry, dict):
                ip = entry.get("ip", "")
                expires = entry.get("expires", "")
                if ip and expires and expires > now_ts:
                    active_trusted.append(entry)
                    trusted_ip_set.add(ip)
            elif isinstance(entry, str):
                # 兼容旧格式（无过期时间的纯 IP 字符串），迁移为新格式
                expires_new = (datetime.utcnow() + timedelta(days=7)).isoformat()
                active_trusted.append({"ip": entry, "expires": expires_new})
                trusted_ip_set.add(entry)

        if client_ip not in trusted_ip_set:
            session_id = new_token(32)
            code = gen_code(6)

            STORE.set(f"2fa_session", session_id, {"user_id": user.id, "code": code, "ip": client_ip}, ttl_seconds=300)

            html = f"<p>您的管理员账号正在从一个新 IP 地址 ({client_ip}) 登录。</p><p>请输入以下验证码以完成登录：<b>{code}</b></p><p>有效期 5 分钟，验证通过后该 IP 7 天内免验证。</p>"
            try:
                send_email(user.email, "【ImageCompress】管理员登录安全验证", html)
            except EmailSendError as e:
                raise HTTPException(status_code=500, detail=f"安全验证码发送失败: {e}")

            return {"2fa_required": True, "session_id": session_id, "requires_2fa": True, "challenge_id": session_id}
        else:
            user.trusted_ips = active_trusted
            db.add(user)
            db.commit()

    login_limiter.record_successful_login(user)
    log_audit(db, user.id, "login", "user", user.id, f"登录成功: {user.username}", ip_address=_get_client_ip(request), user_agent=request.headers.get("User-Agent", ""))
    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token, expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

@router.post("/verify-2fa", response_model=Token)
@limiter.limit("5/minute")
def verify_2fa(request: Request, payload: Verify2FARequest, db: Session = Depends(get_db)):
    session_data = STORE.get(f"2fa_session", payload.session_id)

    if not session_data or session_data.get("code") != payload.code:
        raise HTTPException(status_code=400, detail="验证码无效或已过期")

    user = db.query(User).get(session_data["user_id"])
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    new_ip = session_data["ip"]
    if new_ip:
        raw_trusted = user.trusted_ips or []
        # 过滤已过期的
        now_ts = datetime.utcnow().isoformat()
        active = []
        existing_ips = set()
        for entry in raw_trusted:
            if isinstance(entry, dict):
                ip = entry.get("ip", "")
                expires = entry.get("expires", "")
                if ip and expires and expires > now_ts:
                    active.append(entry)
                    existing_ips.add(ip)
            elif isinstance(entry, str):
                # 迁移旧格式
                expires_new = (datetime.utcnow() + timedelta(days=7)).isoformat()
                active.append({"ip": entry, "expires": expires_new})
                existing_ips.add(entry)

        if new_ip not in existing_ips:
            expires_at = (datetime.utcnow() + timedelta(days=7)).isoformat()
            active.append({"ip": new_ip, "expires": expires_at})

        user.trusted_ips = active
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=409, detail="数据冲突，请重试")

    STORE.delete(f"2fa_session", payload.session_id)

    login_limiter = LoginLimiter(db)
    login_limiter.record_successful_login(user)
    log_audit(db, user.id, "login_2fa", "user", user.id, f"2FA验证登录成功: {user.username}", ip_address=_get_client_ip(request), user_agent=request.headers.get("User-Agent", ""))
    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token, expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

# Other routes like /me, /me-admin, etc. remain the same
@router.get("/me", response_model=UserOut)
def me(token=Depends(get_current_token), db: Session = Depends(get_db)):
    uid = int(token.get("sub"))
    user = db.query(User).get(uid)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return user

@router.get("/me-admin", response_model=UserOutAdmin)
def me_admin(token=Depends(get_current_token), db: Session = Depends(get_db)):
    uid = int(token.get("sub"))
    user = db.query(User).get(uid)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return user


@router.delete("/me")
def delete_me(token=Depends(get_current_token), db: Session = Depends(get_db)):
    """注销并删除当前登录账号。"""
    uid = int(token.get("sub"))
    user = db.query(User).get(uid)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    try:
        db.delete(user)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="删除账号失败，请稍后重试")
    log_audit(db, uid, "delete_account", "user", uid, f"用户自行注销: {user.username}", ip_address=_get_client_ip(request), user_agent=request.headers.get("User-Agent", ""))
    return {"ok": True}


@router.post("/send-email-code")
@limiter.limit("5/minute")
def send_email_code(
    request: Request,
    payload: BindEmailRequest,
    token=Depends(get_current_token),
):
    """
    发送邮箱验证码（用于绑定/修改邮箱）。
    前端调用：POST /api/v1/auth/send-email-code
    Body: { "email": "xxx@qq.com" }
    """
    uid = int(token.get("sub"))
    email = _lc(payload.email)

    # 绑定/换绑邮箱规则（仅允许 @qq.com 或 @local）
    if not is_allowed_bind_email(email):
        raise HTTPException(status_code=422, detail="邮箱格式不正确，仅允许 @qq.com 或 @local")

    code = gen_code(6)
    # key 按用户维度存，5分钟有效
    STORE.set("bind_email", str(uid), {"email": email, "code": code}, ttl_seconds=300)

    html = f"<p>您正在绑定/修改邮箱。</p><p>验证码：<b>{code}</b></p><p>有效期 5 分钟。</p>"
    try:
        send_email(email, "【ImageCompress】邮箱验证码", html)
    except EmailSendError as e:
        raise HTTPException(status_code=500, detail=f"验证码发送失败: {e}")

    return {"ok": True}


@router.post("/bind-email")
@limiter.limit("5/minute")
def bind_email(
    request: Request,
    payload: BindEmailRequest,
    code: Optional[str] = Query(None, min_length=6, max_length=6),
    token=Depends(get_current_token),
    db: Session = Depends(get_db),
):
                                                                                                                                                                                                                                                                          
    uid = int(token.get("sub"))
    email = _lc(payload.email)

    if not is_allowed_bind_email(email):
        raise HTTPException(status_code=422, detail="邮箱格式不正确，仅允许 @qq.com 或 @local")

    user = db.query(User).get(uid)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 无论是否首次绑定，都要求验证码
    if not code:
        raise HTTPException(status_code=400, detail="绑定/修改邮箱需要提供验证码")

    data = STORE.get("bind_email", str(uid))
    if not data or data.get("email") != email or data.get("code") != code:
        raise HTTPException(status_code=400, detail="验证码无效或已过期")

    # 检查新邮箱是否已被其他用户占用
    existing_user = db.query(User).filter(func.lower(User.email) == email.lower(), User.id != uid).first()
    if existing_user:
        raise HTTPException(status_code=409, detail="邮箱地址已被占用")

    user.email = email
    if hasattr(user, "is_email_verified"):
        user.is_email_verified = True

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="邮箱地址已被占用")
    
    STORE.delete("bind_email", str(uid))
    return {"ok": True, "email": email}


@router.post("/forgot-password")
@limiter.limit("3/minute")
@limiter.limit("10/hour")
def forgot_password(request: Request, payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    email = _lc(payload.email)
    if not is_real_email(email):
        return {"ok": True}

    user = db.query(User).filter(func.lower(User.email) == email.lower()).first()
    if not user:
        return {"ok": True}

    token = new_token(32)
    user.email_verification_token = token
    user.email_verification_token_expires_at = minutes_from_now(30).replace(tzinfo=None)
    db.add(user)
    db.commit()

    reset_link = settings.FRONTEND_URL.rstrip("/") + "/reset-password.html?token=" + token

    html = f"""
    <div style='font-family:Arial,sans-serif;font-size:14px;line-height:1.7'>
      <h3>重置密码</h3>
      <p>你好，{user.username}：</p>
      <p>我们收到了你的密码重置请求，请点击下面链接设置新密码（30分钟内有效）：</p>
      <p><a href='{reset_link}' target='_blank'>{reset_link}</a></p>
      <p>如果不是你本人操作，请忽略此邮件。</p>
    </div>
    """

    try:
        send_email(user.email, "【ImageCompress】重置密码", html)
    except EmailSendError:
        return {"ok": True}

    return {"ok": True}


@router.post("/reset-password")
@limiter.limit("5/minute")
def reset_password(request: Request, payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    token = _lc(payload.token)
    if not token:
        raise HTTPException(status_code=422, detail="token 不能为空")

    validate_password_strength(payload.new_password)

    user = db.query(User).filter(User.email_verification_token == token).first()
    if not user:
        raise HTTPException(status_code=400, detail="链接无效或已过期")

    exp = user.email_verification_token_expires_at
    if not exp or exp < datetime.utcnow():
        raise HTTPException(status_code=400, detail="链接无效或已过期")

    user.password_hash = get_password_hash(payload.new_password)
    user.email_verification_token = None
    user.email_verification_token_expires_at = None
    db.add(user)
    db.commit()
    log_audit(db, user.id, "reset_password", "user", user.id, f"密码重置: {user.username}", ip_address=_get_client_ip(request), user_agent=request.headers.get("User-Agent", ""))

    return {"ok": True}
