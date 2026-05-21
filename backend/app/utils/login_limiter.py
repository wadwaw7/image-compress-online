"""
登录限制服务
处理账户锁定、失败次数计数等功能
"""
from datetime import datetime, timedelta
from typing import Tuple
from sqlalchemy.orm import Session
from ..models.user import User
from ..core.config import get_settings


class LoginLimiter:
    """登录限制管理器"""
    
    def __init__(self, db: Session):
        self.db = db
        self.settings = get_settings()
    
    def check_login_allowed(self, user: User) -> Tuple[bool, str]:
        """
        检查用户是否可以登录
        
        返回: (是否允许登录, 错误信息)
        """
        # 检查账户是否激活
        if not user.is_active:
            return False, "账户已被禁用"
        
        # 检查账户是否被锁定
        if user.locked_until:
            now = datetime.utcnow()
            if now < user.locked_until:
                remaining_minutes = int((user.locked_until - now).total_seconds() / 60)
                return False, f"账户已被锁定，请在 {remaining_minutes} 分钟后重试"
            else:
                # 锁定时间已过期，解锁账户
                self.unlock_account(user)
        
        return True, ""
    
    def record_failed_login(self, user: User) -> Tuple[bool, str]:
        """
        记录登录失败
        
        返回: (是否继续锁定, 错误信息)
        """
        user.failed_login_attempts += 1
        
        # 如果达到最大尝试次数，锁定账户
        if user.failed_login_attempts >= self.settings.MAX_LOGIN_ATTEMPTS:
            lock_until = datetime.utcnow() + timedelta(minutes=self.settings.LOGIN_LOCK_MINUTES)
            user.locked_until = lock_until
            self.db.add(user)
            self.db.commit()
            return True, f"登录失败次数过多，账户已被锁定 {self.settings.LOGIN_LOCK_MINUTES} 分钟"
        
        remaining_attempts = self.settings.MAX_LOGIN_ATTEMPTS - user.failed_login_attempts
        self.db.add(user)
        self.db.commit()
        return False, f"用户名或密码错误，还有 {remaining_attempts} 次尝试机会"
    
    def record_successful_login(self, user: User) -> None:
        """
        记录登录成功，重置失败计数
        """
        user.failed_login_attempts = 0
        user.locked_until = None
        user.last_login = datetime.utcnow()
        self.db.add(user)
        self.db.commit()
    
    def unlock_account(self, user: User) -> None:
        """
        解锁账户
        """
        user.failed_login_attempts = 0
        user.locked_until = None
        self.db.add(user)
        self.db.commit()
    
    def lock_account(self, user: User, minutes: int = None) -> None:
        """
        手动锁定账户
        
        Args:
            user: 用户对象
            minutes: 锁定时长（分钟），默认使用配置值
        """
        if minutes is None:
            minutes = self.settings.LOGIN_LOCK_MINUTES
        
        user.locked_until = datetime.utcnow() + timedelta(minutes=minutes)
        user.is_active = False
        self.db.add(user)
        self.db.commit()
    
    def activate_account(self, user: User) -> None:
        """
        激活账户
        """
        user.is_active = True
        user.failed_login_attempts = 0
        user.locked_until = None
        self.db.add(user)
        self.db.commit()

