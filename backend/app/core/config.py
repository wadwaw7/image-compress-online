import os
import secrets
import logging
from pathlib import Path
from functools import lru_cache
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Load both legacy backend/.env and current app/.env.
# Process-level environment variables should win over file values.
BACKEND_ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
APP_ENV_PATH = Path(__file__).resolve().parents[3] / ".env"

for env_path in (APP_ENV_PATH, BACKEND_ENV_PATH):
    if env_path.exists():
        load_dotenv(dotenv_path=env_path, override=False)

# Repo root: .../image-compressor
REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = Path(__file__).resolve().parents[2]

# Default directories (relative to repo root)
DEFAULT_UPLOAD_DIR = REPO_ROOT / "storage" / "uploads"
DEFAULT_COMPRESS_DIR = REPO_ROOT / "storage" / "compressed"

@lru_cache()
def get_settings():
    class Settings:
        DATABASE_URL: str = os.getenv("DATABASE_URL", "")
        SECRET_KEY: str = os.getenv("SECRET_KEY", "change_me")
        ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
        CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "*")
        UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", str(DEFAULT_UPLOAD_DIR))
        COMPRESS_DIR: str = os.getenv("COMPRESS_DIR", str(DEFAULT_COMPRESS_DIR))
        MAX_UPLOAD_SIZE_MB: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "20"))
        CONCURRENCY: int = int(os.getenv("CONCURRENCY", "4"))
        AUTH_DISABLED: bool = os.getenv("AUTH_DISABLED", "0").lower() in ("1","true","yes")
        
        # 登录限制配置
        MAX_LOGIN_ATTEMPTS: int = int(os.getenv("MAX_LOGIN_ATTEMPTS", "5"))  # 最大失败尝试次数
        LOGIN_LOCK_MINUTES: int = int(os.getenv("LOGIN_LOCK_MINUTES", "30"))  # 锁定时长（分钟）

        # 视频压缩配置
        MAX_VIDEO_UPLOAD_SIZE_MB: int = int(os.getenv("MAX_VIDEO_UPLOAD_SIZE_MB", "200"))
        MAX_VIDEO_DURATION_SEC: int = int(os.getenv("MAX_VIDEO_DURATION_SEC", "600"))
        VIDEO_COMPRESS_TIMEOUT_SEC: int = int(os.getenv("VIDEO_COMPRESS_TIMEOUT_SEC", "1800"))

        # 压缩任务并发/排队限制
        MAX_QUEUE_PER_USER: int = int(os.getenv("MAX_QUEUE_PER_USER", "20"))  # 单用户排队上限（status=0）
        MAX_QUEUE_GLOBAL: int = int(os.getenv("MAX_QUEUE_GLOBAL", "0"))       # 全局排队上限，0 表示不限制

        # 邮件配置
        EMAIL_PROVIDER: str = os.getenv("EMAIL_PROVIDER", "smtp").lower()
        FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://127.0.0.1:8001/static")

        # SMTP 配置
        SMTP_HOST: str = os.getenv("SMTP_HOST", "")
        SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
        SMTP_USER: str = os.getenv("SMTP_USER", "")
        SMTP_PASS: str = os.getenv("SMTP_PASS", "")
        SMTP_FROM: str = os.getenv("SMTP_FROM", "")
        SMTP_TLS: bool = os.getenv("SMTP_TLS", "1").lower() in ("1", "true", "yes")
        SMTP_SSL: bool = os.getenv("SMTP_SSL", "0").lower() in ("1", "true", "yes")

        # SendGrid 配置
        SENDGRID_API_KEY: str = os.getenv("SENDGRID_API_KEY", "")
        SENDGRID_FROM: str = os.getenv("SENDGRID_FROM", "")

        @property
        def sql_alchemy_url(self) -> str:
            import importlib.util
            dburl = (self.DATABASE_URL or "").strip()
            if dburl:
                low = dburl.lower()
                # PostgreSQL support
                if low.startswith("postgres://") or low.startswith("postgresql"):
                    try:
                        import psycopg2  # type: ignore
                        return dburl
                    except Exception:
                        dburl = ""
                elif low.startswith("mysql://"):
                    # Convert mysql:// to mysql+pymysql:// for SQLAlchemy
                    return "mysql+pymysql://" + dburl[len("mysql://"):]
                else:
                    return dburl
            # fallback to SQLite file under repo root
            sqlite_path = REPO_ROOT / "storage" / "db.sqlite3"
            sqlite_path.parent.mkdir(parents=True, exist_ok=True)
            return f"sqlite:///{sqlite_path.as_posix()}"

    settings = Settings()

    # SECRET_KEY 保护：生产环境不允许使用默认密钥
    if settings.SECRET_KEY == "change_me":
        # 尝试自动生成并写入 .env
        generated = secrets.token_urlsafe(32)
        if BACKEND_ENV_PATH.exists():
            try:
                with open(BACKEND_ENV_PATH, "a") as f:
                    f.write(f"\nSECRET_KEY={generated}\n")
                os.environ["SECRET_KEY"] = generated
                settings.SECRET_KEY = generated
                logger.warning("Generated new SECRET_KEY and saved to %s", BACKEND_ENV_PATH)
            except Exception:
                logger.critical("SECRET_KEY is 'change_me' and could not write to .env. Set SECRET_KEY in environment.")
                raise RuntimeError("SECRET_KEY must not be 'change_me'. Set SECRET_KEY in .env or environment.")
        else:
            logger.critical("SECRET_KEY is 'change_me' and .env not found. Set SECRET_KEY in environment.")
            raise RuntimeError("SECRET_KEY must not be 'change_me'. Set SECRET_KEY in .env or environment.")

    # Ensure directories exist
    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
    Path(settings.COMPRESS_DIR).mkdir(parents=True, exist_ok=True)

    return settings
