from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def ensure_login_limit_columns(engine: Engine) -> None:
    """确保 users 表存在登录限制相关列（开发环境自动修补，主要针对 SQLite）。
    - is_active BOOLEAN DEFAULT 1 NOT NULL
    - failed_login_attempts INTEGER DEFAULT 0 NOT NULL
    - locked_until DATETIME NULL
    - is_admin BOOLEAN DEFAULT 0 NOT NULL
    - trusted_ips JSON/TEXT DEFAULT []
    仅在缺失列时执行 ALTER TABLE ADD COLUMN。
    """
    try:
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        if "users" not in tables:
            return
        cols = {c["name"] for c in inspector.get_columns("users")}
        # 需要补齐的列（若缺失）
        url = str(engine.url)
        with engine.begin() as conn:
            if "sqlite" in url:
                if "is_active" not in cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1 NOT NULL"))
                if "failed_login_attempts" not in cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER DEFAULT 0 NOT NULL"))
                if "locked_until" not in cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN locked_until DATETIME"))
                if "nickname" not in cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN nickname VARCHAR(64)"))
                if "is_admin" not in cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT 0 NOT NULL"))
                if "is_email_verified" not in cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN is_email_verified BOOLEAN DEFAULT 0 NOT NULL"))
                if "email_verification_token" not in cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN email_verification_token VARCHAR(128)"))
                if "email_verification_token_expires_at" not in cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN email_verification_token_expires_at DATETIME"))
                if "trusted_ips" not in cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN trusted_ips TEXT DEFAULT '[]' NOT NULL"))
            elif "postgres" in url:
                if "is_active" not in cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true NOT NULL"))
                if "failed_login_attempts" not in cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0 NOT NULL"))
                if "locked_until" not in cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ"))
                if "nickname" not in cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname VARCHAR(64)"))
                if "is_admin" not in cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false NOT NULL"))
                if "trusted_ips" not in cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS trusted_ips JSONB DEFAULT '[]'::jsonb NOT NULL"))
            elif "mysql" in url:
                if "is_active" not in cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1 NOT NULL"))
                if "failed_login_attempts" not in cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN failed_login_attempts INT DEFAULT 0 NOT NULL"))
                if "locked_until" not in cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN locked_until DATETIME"))
                if "nickname" not in cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN nickname VARCHAR(64)"))
                if "is_admin" not in cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT 0 NOT NULL"))
                if "trusted_ips" not in cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN trusted_ips JSON NOT NULL DEFAULT ('[]')"))
            else:
                # 其他数据库暂不处理，避免不可预期行为
                pass
    except Exception:
        # 开发兜底：出现异常时不阻断启动，让应用可运行；问题由日志排查
        pass


def ensure_compress_task_unique_index(engine: Engine) -> None:
    """确保 compress_tasks 上存在 (user_id,image_id,format,quality) 的唯一索引。
    - SQLite 不支持在线添加 Unique Constraint 到既有表，但支持创建唯一索引。
    """
    try:
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        if "compress_tasks" not in tables:
            return
        idx = {i.get("name") for i in inspector.get_indexes("compress_tasks")}
        if "uq_user_img_fmt_q" in idx:
            return
        with engine.begin() as conn:
            url = str(engine.url)
            if "sqlite" in url:
                conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_user_img_fmt_q ON compress_tasks(user_id,image_id,format,quality)"))
            elif "postgres" in url:
                conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_user_img_fmt_q ON compress_tasks(user_id,image_id,format,quality)"))
            elif "mysql" in url:
                conn.execute(text("CREATE UNIQUE INDEX uq_user_img_fmt_q ON compress_tasks(user_id,image_id,format,quality)"))
            else:
                pass
    except Exception:
        pass


def ensure_media_type_column(engine: Engine) -> None:
    """Ensure compress_tasks and images have media_type column (image/video)."""
    try:
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        url = str(engine.url)
        with engine.begin() as conn:
            for table in ("compress_tasks", "images"):
                if table not in tables:
                    continue
                cols = {c["name"] for c in inspector.get_columns(table)}
                if "media_type" in cols:
                    continue
                if "sqlite" in url:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN media_type VARCHAR(8) DEFAULT 'image' NOT NULL"))
                elif "postgres" in url:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS media_type VARCHAR(8) DEFAULT 'image' NOT NULL"))
                elif "mysql" in url:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN media_type VARCHAR(8) DEFAULT 'image' NOT NULL"))
    except Exception:
        pass


def ensure_users_unique_indexes(engine: Engine) -> None:
    """确保 users(username)、users(email)、users(nickname 非空) 唯一索引存在（兼容旧库）。"""
    try:
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        if "users" not in tables:
            return
        idx_names = {i.get("name") for i in inspector.get_indexes("users")}
        with engine.begin() as conn:
            url = str(engine.url)
            if "sqlite" in url:
                if "uq_users_username" not in idx_names:
                    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username ON users(username)"))
                if "uq_users_email" not in idx_names:
                    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email ON users(email)"))
                # SQLite 支持部分索引（3.8+），限制 nickname 非空时唯一
                if "uq_users_nickname" not in idx_names:
                    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_users_nickname ON users(nickname) WHERE nickname IS NOT NULL"))
            elif "postgres" in url:
                if "uq_users_username" not in idx_names:
                    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username ON users(username)"))
                if "uq_users_email" not in idx_names:
                    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email ON users(email)"))
                if "uq_users_nickname" not in idx_names:
                    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_users_nickname ON users(nickname) WHERE nickname IS NOT NULL"))
            elif "mysql" in url:
                if "uq_users_username" not in idx_names:
                    conn.execute(text("CREATE UNIQUE INDEX uq_users_username ON users(username)"))
                if "uq_users_email" not in idx_names:
                    conn.execute(text("CREATE UNIQUE INDEX uq_users_email ON users(email)"))
                if "uq_users_nickname" not in idx_names:
                    conn.execute(text("CREATE UNIQUE INDEX uq_users_nickname ON users(nickname)"))
            else:
                pass
    except Exception:
        # 若已有重复数据会导致唯一索引创建失败，这里忽略异常，避免阻断启动
        pass
