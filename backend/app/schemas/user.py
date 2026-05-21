from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field  # pyright: ignore[reportMissingImports]


class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)
    nickname: Optional[str] = Field(default=None, max_length=64)
    email: Optional[str] = None  # 可选绑定邮箱


class UserLogin(BaseModel):
    username_or_email: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    nickname: Optional[str] = None
    email: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: Optional[datetime]
    last_login: Optional[datetime]
    is_admin: bool = False

    class Config:
        from_attributes = True


class UserOutAdmin(UserOut):
    is_active: bool = True
    failed_login_attempts: int = 0
    locked_until: Optional[datetime] = None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class TokenData(BaseModel):
    sub: Optional[str] = None


class Verify2FARequest(BaseModel):
    session_id: str
    code: str = Field(min_length=6, max_length=6)


class PasswordChange(BaseModel):
    old_password: str
    new_password: str = Field(min_length=8, max_length=128)
