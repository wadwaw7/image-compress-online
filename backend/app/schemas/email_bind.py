from __future__ import annotations

from pydantic import BaseModel, Field


class SendEmailCodeRequest(BaseModel):
    """发送邮箱验证码（用于修改当前已绑定的邮箱）。
    
    后端会自动从当前登录用户获取邮箱地址，因此无需 payload。
    """
    pass


class BindEmailRequest(BaseModel):
    """绑定/修改邮箱

    - 首次绑定（当前邮箱为 @local 占位）不强制 code
    - 修改真实邮箱必须提供 code
    """

    email: str = Field(min_length=3, max_length=255)
    code: str | None = Field(default=None, min_length=4, max_length=12)
