from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel

try:  # Pydantic v2
    from pydantic import ConfigDict  # type: ignore
    _HAS_V2 = True
except Exception:  # pragma: no cover
    ConfigDict = dict  # type: ignore
    _HAS_V2 = False


class CompressTaskOut(BaseModel):
    id: int
    image_id: int
    user_id: int
    compressed_path: str
    compressed_size: int
    format: str
    quality: int
    media_type: Optional[str] = "image"
    status: int
    created_at: Optional[datetime]
    finished_at: Optional[datetime]
    error_message: Optional[str]

    # 兼容 Pydantic v1/v2：from_attributes/orm_mode
    if _HAS_V2:
        model_config = ConfigDict(from_attributes=True)  # type: ignore
    else:  # pragma: no cover
        class Config:  # type: ignore
            orm_mode = True


class TaskCreate(BaseModel):
    format: str
    quality: int


class BatchTaskCreate(BaseModel):
    image_ids: List[int]
    format: str
    quality: int


class VideoCompressRequest(BaseModel):
    image_ids: List[int]
    codec: str = "h264"
    quality: int = 60
    max_width: int = 0
    max_height: int = 0
    fps: int = 0


class TaskList(BaseModel):
    items: List[CompressTaskOut]
    total: int
