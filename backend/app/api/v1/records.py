from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ...database import get_db
from ...models.image import Image as ImageModel
from ...models.record import CompressTask as CompressTaskModel, DownloadLog as DownloadLogModel
from ...schemas.image import ImageOut
from ...schemas.record import CompressTaskOut, TaskList
from ...utils.security import get_current_token

router = APIRouter(prefix="/records", tags=["records"])


@router.get("/uploads")
def uploads(
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    token=Depends(get_current_token),
    db: Session = Depends(get_db),
):
    uid = int(token.get("sub"))
    q = db.query(ImageModel).filter(ImageModel.user_id == uid)
    if start:
        q = q.filter(ImageModel.upload_time >= start)
    if end:
        q = q.filter(ImageModel.upload_time <= end)
    total = q.count()
    items = q.order_by(ImageModel.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [ImageOut.from_orm(i).dict() for i in items], "total": total}


@router.get("/compressions", response_model=TaskList)
def compressions(
    status: Optional[int] = Query(None),
    format: Optional[str] = Query(None),
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    token=Depends(get_current_token),
    db: Session = Depends(get_db),
):
    uid = int(token.get("sub"))
    q = db.query(CompressTaskModel).filter(CompressTaskModel.user_id == uid)
    if status is not None:
        q = q.filter(CompressTaskModel.status == status)
    if format:
        q = q.filter(CompressTaskModel.format == format.lower())
    if start:
        q = q.filter(CompressTaskModel.created_at >= start)
    if end:
        q = q.filter(CompressTaskModel.created_at <= end)
    total = q.count()
    items = q.order_by(CompressTaskModel.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": items, "total": total}


@router.get("/downloads")
def downloads(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    token=Depends(get_current_token),
    db: Session = Depends(get_db),
):
    uid = int(token.get("sub"))
    q = db.query(DownloadLogModel).filter(DownloadLogModel.user_id == uid)
    total = q.count()
    items = q.order_by(DownloadLogModel.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [
        {
            "id": d.id,
            "compress_task_id": d.compress_task_id,
            "download_time": d.download_time,
            "ip_address": d.ip_address,
        } for d in items
    ], "total": total}

