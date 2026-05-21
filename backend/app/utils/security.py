from datetime import datetime, timedelta, timezone
from typing import Optional
from passlib.context import CryptContext
from jose import jwt, JWTError
from fastapi import HTTPException, status, Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from sqlalchemy import func
import re
import html

from ..core.config import get_settings
from ..database import get_db
from ..models.user import User

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)
settings = get_settings()

ALGORITHM = "HS256"

# 黑名单：检测 HTML 标签、JS 事件处理器、危险的协议
_html_tag_re = re.compile(r"<\s*/?\s*[a-zA-Z]+[^>]*/?\s*>", re.IGNORECASE)
_html_event_re = re.compile(r"\bon\w+\s*=", re.IGNORECASE)  # onerror, onload, onfocus 等
_js_protocol_re = re.compile(r"javascript\s*:", re.IGNORECASE)
_special_char_re = re.compile(r"[<>\"'`]", re.IGNORECASE)

_username_re = re.compile(r"^[A-Za-z0-9_\-]+$")
_nickname_re = re.compile(r"^[A-Za-z0-9_\-一-鿿぀-ゟ゠-ヿ가-힯\s\.]{1,64}$")


def _is_xss_dangerous(value: str) -> bool:
    """检测字符串是否包含 XSS 危险内容"""
    v = value or ""
    if _html_tag_re.search(v):
        return True
    if _html_event_re.search(v):
        return True
    if _js_protocol_re.search(v):
        return True
    return False


def _validate_text_safe(value: str, field_name: str, max_length: int = 128, allow_html: bool = False) -> str:
    """通用文本安全校验：长度限制 + XSS 检测"""
    v = (value or "").strip()
    if not v:
        raise HTTPException(status_code=422, detail=f"{field_name}不能为空")
    if len(v) > max_length:
        raise HTTPException(status_code=422, detail=f"{field_name}不能超过{max_length}个字符")
    if _special_char_re.search(v) and not allow_html:
        raise HTTPException(status_code=422, detail=f"{field_name}包含非法字符")
    if _is_xss_dangerous(v):
        raise HTTPException(status_code=422, detail=f"{field_name}包含非法内容")
    return v


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_minutes: Optional[int] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


def get_current_token(token: Optional[str] = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> dict:
    """严格模式：必须携带有效 Bearer Token"""
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    return decode_token(token)


_username_re = re.compile(r"^[A-Za-z0-9_\-]+$")


def normalize_username(username: str, min_length: int = 3, max_length: int = 32) -> str:
    u = (username or "").strip()
    if len(u) < min_length:
        raise HTTPException(status_code=422, detail=f"用户名至少{min_length}个字符")
    if len(u) > max_length:
        raise HTTPException(status_code=422, detail=f"用户名不能超过{max_length}个字符")
    if not _username_re.fullmatch(u):
        raise HTTPException(status_code=422, detail="用户名仅允许字母、数字、下划线、连接符")
    if _is_xss_dangerous(u):
        raise HTTPException(status_code=422, detail="用户名包含非法内容")
    return u.lower()


def normalize_nickname(nickname: Optional[str]) -> Optional[str]:
    """校验昵称：长度 1-64，不允许 HTML/JS"""
    if nickname is None:
        return None
    v = (nickname or "").strip()
    if not v:
        return None
    if len(v) > 64:
        raise HTTPException(status_code=422, detail="昵称不能超过64个字符")
    if _is_xss_dangerous(v):
        raise HTTPException(status_code=422, detail="昵称包含非法内容")
    if _special_char_re.search(v):
        raise HTTPException(status_code=422, detail="昵称包含非法字符")
    return v


def normalize_email(email: str) -> str:
    """校验邮箱：去除 XSS 危险字符，长度限制"""
    e = (email or "").strip().lower()
    if not e:
        return e
    if len(e) > 128:
        raise HTTPException(status_code=422, detail="邮箱地址过长")
    if _is_xss_dangerous(e):
        raise HTTPException(status_code=422, detail="邮箱地址包含非法内容")
    if _special_char_re.search(e.split("@")[0] if "@" in e else e):
        raise HTTPException(status_code=422, detail="邮箱地址包含非法字符")
    return e


def validate_password_strength(pw: str):
    pw = pw or ""
    if len(pw) < 8:
        raise HTTPException(status_code=422, detail="密码至少8位")
    if len(pw) > 128:
        raise HTTPException(status_code=422, detail="密码不能超过128个字符")
    classes = 0
    if re.search(r"[a-z]", pw):
        classes += 1
    if re.search(r"[A-Z]", pw):
        classes += 1
    if re.search(r"\d", pw):
        classes += 1
    if re.search(r"[^A-Za-z0-9]", pw):
        classes += 1
    if classes < 2:
        raise HTTPException(status_code=422, detail="密码需包含至少两类字符（大小写/数字/符号任意两类）")
