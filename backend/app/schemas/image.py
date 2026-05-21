from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class ImageOut(BaseModel):
    id: int
    user_id: int
    filename: str
    file_path: str
    file_ext: str
    file_size: int
    upload_time: Optional[datetime]
    status: int
    md5_hash: str

    class Config:
        orm_mode = True


class UploadResult(BaseModel):
    image_id: int
    filename: str
    file_ext: str
    file_size: int
    upload_time: Optional[datetime]
    md5_hash: str
    media_type: Optional[str] = "image"


class BatchUploadResponse(BaseModel):
    items: List[UploadResult]

