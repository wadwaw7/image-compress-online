from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from .core.config import get_settings
from urllib.parse import urlparse

settings = get_settings()
SQLALCHEMY_DATABASE_URL = settings.sql_alchemy_url

_engine_kwargs = {"pool_pre_ping": True}
_parsed = urlparse(SQLALCHEMY_DATABASE_URL)
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    _engine_kwargs["connect_args"] = {"check_same_thread": False}
elif "mysql" in _parsed.scheme or "mysql" in SQLALCHEMY_DATABASE_URL.lower():
    _engine_kwargs["pool_size"] = 10
    _engine_kwargs["pool_recycle"] = 3600

engine = create_engine(SQLALCHEMY_DATABASE_URL, **_engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

