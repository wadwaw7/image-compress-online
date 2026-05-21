from sqlalchemy import Column, Integer, String, DateTime, SmallInteger, ForeignKey
from sqlalchemy.sql import func
from ..database import Base


class Image(Base):
    __tablename__ = "images"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    filename = Column(String(128), nullable=False)
    file_path = Column(String(256), nullable=False)
    file_ext = Column(String(16), nullable=False)
    file_size = Column(Integer, nullable=False)
    upload_time = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    status = Column(SmallInteger, server_default="1")
    md5_hash = Column(String(64), nullable=False, index=True)
    media_type = Column(String(8), nullable=False, default="image")  # "image" or "video"
