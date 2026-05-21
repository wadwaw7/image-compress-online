from sqlalchemy import Column, Integer, String, DateTime, SmallInteger, Boolean, Float, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base


class User(Base):
    __tablename__ = "users"

    # 注意：为兼容 SQLite 自增，主键必须是 Integer 且 primary_key=True
    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    username = Column(String(64), unique=True, nullable=False, index=True)
    email = Column(String(128), unique=True, nullable=False, index=True)
    password_hash = Column(String(128), nullable=False)
    nickname = Column(String(64))
    avatar_url = Column(String(256))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_login = Column(DateTime(timezone=True))
    status = Column(SmallInteger, server_default="1")

    # 登录限制相关字段
    is_active = Column(Boolean, server_default="1", nullable=False)  # 账户是否激活
    failed_login_attempts = Column(Integer, server_default="0", nullable=False)  # 失败登录次数
    locked_until = Column(DateTime(timezone=True))  # 账户锁定截止时间

    # 管理员标识
    is_admin = Column(Boolean, server_default="0", nullable=False)  # 0 普通用户 1 管理员

    # 邮箱验证
    is_email_verified = Column(Boolean, server_default="0", nullable=False)
    email_verification_token = Column(String(128), unique=True, index=True)
    email_verification_token_expires_at = Column(DateTime(timezone=True))

    # 2FA: trusted IPs (no server_default for MySQL compatibility; default applied in code)
    trusted_ips = Column(JSON, nullable=True)

    # 关系
    quota = relationship("UserQuota", back_populates="user", uselist=False, cascade="all, delete-orphan")


class UserQuota(Base):
    """用户配额管理"""

    __tablename__ = "user_quotas"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False, index=True)

    # 存储配额（单位：MB）
    total_storage_mb = Column(Float, server_default="1024", nullable=False)  # 总存储空间
    used_storage_mb = Column(Float, server_default="0", nullable=False)  # 已使用存储空间

    # 每月压缩次数限制
    monthly_compression_limit = Column(Integer, server_default="1000", nullable=False)  # 每月压缩次数限制
    monthly_compression_used = Column(Integer, server_default="0", nullable=False)  # 本月已使用次数

    # 每月重置日期
    quota_reset_date = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # 高级功能
    is_premium = Column(Boolean, server_default="0", nullable=False)  # 是否为高级用户
    premium_until = Column(DateTime(timezone=True))  # 高级会员到期时间

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # 关系
    user = relationship("User", back_populates="quota")


class APIKey(Base):
    """API密钥管理"""

    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # 密钥信息
    key_name = Column(String(128), nullable=False)  # 密钥名称
    key_hash = Column(String(128), unique=True, nullable=False, index=True)  # 密钥哈希值
    key_prefix = Column(String(16), nullable=False)  # 密钥前缀（用于显示）

    # 权限和限制
    is_active = Column(Boolean, server_default="1", nullable=False)  # 是否激活
    rate_limit = Column(Integer, server_default="100")  # 每小时请求限制

    # 使用统计
    last_used_at = Column(DateTime(timezone=True))  # 最后使用时间
    total_requests = Column(Integer, server_default="0", nullable=False)  # 总请求数

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True))  # 过期时间


class AuditLog(Base):
    """审计日志"""

    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # 操作信息
    action = Column(String(64), nullable=False, index=True)  # 操作类型
    resource_type = Column(String(64), nullable=False)  # 资源类型
    resource_id = Column(Integer)  # 资源ID

    # 详情
    description = Column(Text)  # 操作描述
    ip_address = Column(String(45))  # IP地址
    user_agent = Column(String(512))  # User Agent

    # 结果
    status = Column(String(32), nullable=False)  # success, failure
    error_message = Column(Text)  # 错误信息

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)


class SystemConfig(Base):
    """系统配置"""

    __tablename__ = "system_configs"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)

    # 配置键值
    config_key = Column(String(128), unique=True, nullable=False, index=True)
    config_value = Column(Text, nullable=False)

    # 描述
    description = Column(String(256))

    # 类型
    value_type = Column(String(32), server_default="string")  # string, integer, boolean, json

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
