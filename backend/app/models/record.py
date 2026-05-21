from sqlalchemy import Column, Integer, String, DateTime, SmallInteger, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from ..database import Base


class CompressTask(Base):
    __tablename__ = "compress_tasks"
    __table_args__ = (
        # 防重：同一用户、同一图片、同一输出参数（format+quality）只保留一条任务记录
        UniqueConstraint('user_id','image_id','format','quality', name='uq_user_img_fmt_q'),
    )

    # 为兼容 SQLite 的自增，主键类型需为 Integer + primary_key=True
    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    image_id = Column(Integer, ForeignKey("images.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    compressed_path = Column(String(256), nullable=False)
    compressed_size = Column(Integer, nullable=False, default=0)
    format = Column(String(16), nullable=False)
    quality = Column(SmallInteger, nullable=False)
    media_type = Column(String(8), nullable=False, default="image")  # "image" or "video"
    status = Column(SmallInteger, nullable=False, default=0)  # 0 queue, 1 done, 2 fail
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    finished_at = Column(DateTime(timezone=True))
    error_message = Column(String(256))


class DownloadLog(Base):
    __tablename__ = "download_logs"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    compress_task_id = Column(Integer, ForeignKey("compress_tasks.id"), nullable=False, index=True)
    download_time = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    ip_address = Column(String(64))


class ImageTag(Base):
    __tablename__ = "image_tags"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    image_id = Column(Integer, ForeignKey("images.id", ondelete="CASCADE"), nullable=False, index=True)
    tag = Column(String(32), nullable=False)
