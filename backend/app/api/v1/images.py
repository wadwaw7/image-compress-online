from typing import List, Optional
from pathlib import Path
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, File, UploadFile, HTTPException, status, Request, Query
from sqlalchemy.orm import Session
from fastapi.responses import FileResponse

from ...database import get_db
from ...core.config import get_settings
from ...models.image import Image as ImageModel
from ...models.record import CompressTask as CompressTaskModel, DownloadLog as DownloadLogModel
from ...schemas.image import UploadResult
from ...schemas.record import TaskList, CompressTaskOut, BatchTaskCreate, VideoCompressRequest
from ...utils.files import save_upload_file, get_ext_from_filename, FileTooLargeError, is_video, IMAGE_MIMES, VIDEO_MIMES, IMAGE_EXTS, VIDEO_EXTS
from ...utils.security import get_current_token
from ...utils.ratelimit import limiter
from ...core.compression import compress_image
from ...core.video_compression import compress_video, probe_video, get_video_duration, quality_to_crf
from ...core.watermark import remove_watermark_opencv

settings = get_settings()
router = APIRouter(prefix="/images", tags=["images"])
ALLOWED_EXTS = IMAGE_EXTS | VIDEO_EXTS

@router.post("/upload", response_model=List[UploadResult])
@limiter.limit("20/minute")
async def upload_images(
    request: Request,
    files: List[UploadFile] = File(...),
    token: dict = Depends(get_current_token),
    db: Session = Depends(get_db),
):
    uid = int(token.get("sub"))

    max_files = getattr(settings, 'MAX_UPLOAD_FILES', 10)
    if len(files) > max_files:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"单次最多上传 {max_files} 个文件"
        )

    allowed_mime = IMAGE_MIMES | VIDEO_MIMES
    results: List[UploadResult] = []
    max_image_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    max_video_bytes = settings.MAX_VIDEO_UPLOAD_SIZE_MB * 1024 * 1024

    for f in files:
        if f.content_type not in allowed_mime:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"不支持的文件类型: {f.content_type}")

        if not f.filename:
            continue

        ext = get_ext_from_filename(f.filename)
        if ext not in ALLOWED_EXTS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"不支持的文件扩展名: {ext}")

        video = is_video(f.filename)
        max_bytes = max_video_bytes if video else max_image_bytes

        try:
            dst_path, size, real_ext, digest = save_upload_file(
                Path(settings.UPLOAD_DIR),
                f,
                max_bytes=max_bytes,
            )
        except FileTooLargeError:
            limit_mb = settings.MAX_VIDEO_UPLOAD_SIZE_MB if video else settings.MAX_UPLOAD_SIZE_MB
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"文件 '{f.filename}' 过大，请上传小于 {limit_mb}MB 的文件",
            )
        except Exception as e:
            logging.error(f"File saving failed for user {uid}: {e}")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="文件保存失败")

        media_type = "video" if video else "image"

        # Validate video duration
        if video:
            duration = get_video_duration(dst_path)
            if duration > settings.MAX_VIDEO_DURATION_SEC:
                try:
                    dst_path.unlink(missing_ok=True)
                except Exception:
                    pass
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"视频时长 {duration:.0f}s 超过限制（最大 {settings.MAX_VIDEO_DURATION_SEC}s）",
                )

        img = ImageModel(
            user_id=uid,
            filename=f.filename,
            file_path=str(dst_path),
            file_ext=real_ext,
            file_size=size,
            md5_hash=digest,
            media_type=media_type,
        )
        db.add(img)
        db.commit()
        db.refresh(img)
        results.append(UploadResult(
            image_id=img.id,
            filename=img.filename,
            file_ext=img.file_ext,
            file_size=img.file_size,
            upload_time=getattr(img, "upload_time", None),
            md5_hash=getattr(img, "md5_hash", ""),
            media_type=getattr(img, "media_type", "image"),
        ))

    return results


@router.get("/tasks", response_model=TaskList)
def tasks(
    status: Optional[int] = Query(None),
    format: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    token: dict = Depends(get_current_token),
    db: Session = Depends(get_db),
):
    """
    兼容前端历史接口：/api/v1/images/tasks
    """
    uid = int(token.get("sub"))
    q = db.query(CompressTaskModel).filter(CompressTaskModel.user_id == uid)
    if status is not None:
        q = q.filter(CompressTaskModel.status == status)
    if format:
        q = q.filter(CompressTaskModel.format == format.lower())
    total = q.count()
    items = q.order_by(CompressTaskModel.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": items, "total": total}

@router.delete("", summary="删除图片（支持按ID批量或清空）")
def delete_images(
    all: bool = Query(False, description="是否清空所有图片"),
    ids: Optional[str] = Query(None, description="要删除的图片ID，多个用逗号分隔"),
    token: dict = Depends(get_current_token),
    db: Session = Depends(get_db),
):
    """
    兼容前端历史接口：
    - DELETE /api/v1/images?all=1
    - DELETE /api/v1/images?ids=1,2,3
    """
    uid = int(token.get("sub"))
    q = db.query(ImageModel).filter(ImageModel.user_id == uid)

    targets = []
    if all:
        targets = q.all()
    elif ids:
        id_list = [int(i) for i in ids.split(",") if i.strip().isdigit()]
        if not id_list:
            raise HTTPException(status_code=400, detail="无效的ID列表")
        targets = q.filter(ImageModel.id.in_(id_list)).all()
    else:
        raise HTTPException(status_code=400, detail="缺少参数：all 或 ids")

    # 先尝试删除物理文件，失败不影响数据库删除
    for img in targets:
        if not img.file_path:
            continue
        try:
            p = Path(img.file_path)
            if p.exists():
                p.unlink()
        except Exception:
            logging.warning(f"Failed to delete file for image {img.id}: {img.file_path}")

    if not targets:
        return {"deleted": 0}

    # 再删除数据库记录
    ids_to_delete = [img.id for img in targets]
    count = q.filter(ImageModel.id.in_(ids_to_delete)).delete(synchronize_session=False)
    db.commit()
    return {"deleted": count}


@router.delete("/tasks", summary="清理任务记录")
def delete_tasks(
    status: Optional[int] = Query(None, description="按状态筛选要删除的任务"),
    token: dict = Depends(get_current_token),
    db: Session = Depends(get_db),
):
    """
    兼容前端历史接口：
    - DELETE /api/v1/images/tasks?status=1
    """
    uid = int(token.get("sub"))
    q = db.query(CompressTaskModel).filter(CompressTaskModel.user_id == uid)
    
    if status is not None:
        q = q.filter(CompressTaskModel.status == status)
    
    count = q.delete(synchronize_session=False)
    db.commit()
    return {"deleted": count}


@router.delete("/tasks/{task_id}", summary="删除单条任务记录")
def delete_task_by_id(
    task_id: int,
    token: dict = Depends(get_current_token),
    db: Session = Depends(get_db),
):
    """
    兼容前端：DELETE /api/v1/images/tasks/{id}
    """
    uid = int(token.get("sub"))
    q = db.query(CompressTaskModel).filter(CompressTaskModel.user_id == uid, CompressTaskModel.id == task_id)
    count = q.delete(synchronize_session=False)
    db.commit()
    return {"deleted": count}


@router.post("/batch-compress", response_model=List[CompressTaskOut])
@limiter.limit("10/minute")
def batch_compress(
    request: Request,
    payload: BatchTaskCreate,
    token: dict = Depends(get_current_token),
    db: Session = Depends(get_db),
):
    """
    服务器模式批量压缩（同步执行，单一事务）。
    前端调用：POST /api/v1/images/batch-compress
    """
    uid = int(token.get("sub"))
    fmt = (payload.format or "webp").lower()
    if fmt == "jpg":
        fmt = "jpeg"
    if fmt not in {"jpeg", "png", "webp"}:
        raise HTTPException(status_code=422, detail="Invalid format")
    if not (1 <= int(payload.quality) <= 100):
        raise HTTPException(status_code=422, detail="Invalid quality")

    from datetime import datetime

    out_dir = Path(settings.UPLOAD_DIR).parent / "compressed"
    out_dir.mkdir(parents=True, exist_ok=True)
    ext = "jpg" if fmt == "jpeg" else fmt

    # Phase 1: validate and prepare all tasks
    pending = []
    for iid in payload.image_ids:
        img = db.query(ImageModel).get(int(iid))
        if (not img) or img.user_id != uid:
            continue

        src_path = Path(img.file_path)
        if not src_path.exists():
            continue

        dst_path = out_dir / f"{img.md5_hash}_{ext}_q{int(payload.quality)}.{ext}"

        existed = db.query(CompressTaskModel).filter(
            CompressTaskModel.user_id == uid,
            CompressTaskModel.image_id == img.id,
            CompressTaskModel.format == fmt,
            CompressTaskModel.quality == int(payload.quality),
        ).first()

        task = existed or CompressTaskModel(
            image_id=img.id,
            user_id=uid,
            compressed_path=dst_path.as_posix(),
            compressed_size=0,
            format=fmt,
            quality=int(payload.quality),
            status=0,
        )

        task.compressed_path = dst_path.as_posix()
        task.format = fmt
        task.quality = int(payload.quality)
        task.status = 0
        task.error_message = None
        task.compressed_size = 0
        task.finished_at = None

        db.add(task)
        pending.append((task, src_path, dst_path))

    # Phase 2: compress each image (still within single transaction)
    tasks_out: List[CompressTaskOut] = []
    for task, src_path, dst_path in pending:
        try:
            _, size = compress_image(src_path, dst_path, fmt, int(payload.quality))
            task.compressed_size = int(size)
            task.status = 1
            task.finished_at = datetime.utcnow()
        except Exception as e:
            task.status = 2
            task.error_message = str(e)[:500]
        tasks_out.append(task)

    # Phase 3: single commit for entire batch
    try:
        db.commit()
        for t in tasks_out:
            db.refresh(t)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="批量压缩事务提交失败")

    return tasks_out


@router.post("/video-compress", response_model=List[CompressTaskOut])
@limiter.limit("5/minute")
def video_compress(
    request: Request,
    background_tasks: BackgroundTasks,
    payload: VideoCompressRequest,
    token: dict = Depends(get_current_token),
    db: Session = Depends(get_db),
):
    """
    提交视频压缩任务（异步后台处理）。
    POST /api/v1/images/video-compress
    """
    uid = int(token.get("sub"))
    codec = payload.codec.lower()
    if codec not in ("h264", "h265", "vp9"):
        raise HTTPException(status_code=422, detail="Invalid codec. Supported: h264, h265, vp9")
    if not (1 <= int(payload.quality) <= 100):
        raise HTTPException(status_code=422, detail="Invalid quality (1-100)")

    from datetime import datetime

    out_dir = Path(settings.COMPRESS_DIR) if hasattr(settings, 'COMPRESS_DIR') else Path(settings.UPLOAD_DIR).parent / "compressed"
    out_dir.mkdir(parents=True, exist_ok=True)

    crf = quality_to_crf(int(payload.quality))
    codec_ext = {"h264": "mp4", "h265": "mp4", "vp9": "webm"}.get(codec, "mp4")

    tasks_out: List[CompressTaskOut] = []

    for iid in payload.image_ids:
        img = db.query(ImageModel).get(int(iid))
        if (not img) or img.user_id != uid:
            continue
        if img.media_type != "video":
            continue

        src_path = Path(img.file_path)
        if not src_path.exists():
            continue

        dst_path = out_dir / f"{img.md5_hash}_{codec}_q{int(payload.quality)}.{codec_ext}"

        task = CompressTaskModel(
            image_id=img.id,
            user_id=uid,
            compressed_path=dst_path.as_posix(),
            compressed_size=0,
            format=codec,
            quality=int(payload.quality),
            media_type="video",
            status=0,
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        tasks_out.append(task)

    # Process in background (after response)
    def process():
        from ..database import SessionLocal
        bg_db = SessionLocal()
        try:
            for t in tasks_out:
                task_obj = bg_db.query(CompressTaskModel).get(t.id)
                if not task_obj:
                    continue
                img = bg_db.query(ImageModel).get(task_obj.image_id)
                if not img:
                    continue
                src = Path(img.file_path)
                dst = Path(task_obj.compressed_path)
                try:
                    _, size = compress_video(
                        src, dst,
                        codec=codec,
                        crf=crf,
                        max_width=int(payload.max_width or 0),
                        max_height=int(payload.max_height or 0),
                        fps=int(payload.fps or 0),
                        timeout=settings.VIDEO_COMPRESS_TIMEOUT_SEC,
                    )
                    task_obj.compressed_size = int(size)
                    task_obj.status = 1
                    task_obj.finished_at = datetime.utcnow()
                except Exception as e:
                    task_obj.status = 2
                    task_obj.error_message = str(e)[:500]
                bg_db.commit()
        except Exception as e:
            logger.error("Video compress background task failed: %s", e)
        finally:
            bg_db.close()

    background_tasks.add_task(process)
    return tasks_out


@router.get("/download/{task_id}")
def download(task_id: int, token: dict = Depends(get_current_token), db: Session = Depends(get_db)):
    """
    下载压缩结果：GET /api/v1/images/download/{task_id}
    """
    uid = int(token.get("sub"))
    task = db.query(CompressTaskModel).get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.user_id != uid:
        raise HTTPException(status_code=403, detail="Forbidden")
    if task.status != 1:
        raise HTTPException(status_code=400, detail="Task not finished")

    file_path = Path(task.compressed_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    try:
        log = DownloadLogModel(user_id=uid, compress_task_id=task.id)
        db.add(log)
        db.commit()
    except Exception:
        db.rollback()

    ext = file_path.suffix.lower().lstrip(".")
    if ext in ("jpg", "jpeg"):
        mime = "image/jpeg"
    elif ext == "png":
        mime = "image/png"
    elif ext == "webp":
        mime = "image/webp"
    elif ext in ("mp4", "mov"):
        mime = "video/mp4"
    elif ext == "webm":
        mime = "video/webm"
    elif ext == "mkv":
        mime = "video/x-matroska"
    else:
        mime = "application/octet-stream"
    headers = {"Content-Disposition": f'attachment; filename="{file_path.name}"'}
    return FileResponse(file_path, media_type=mime, headers=headers)


@router.post("/remove-watermark")
@limiter.limit("10/minute")
def remove_watermark(
    request: Request,
    image_id: int = Query(..., ge=1),
    x: int = Query(..., ge=0),
    y: int = Query(..., ge=0),
    w: int = Query(..., ge=1),
    h: int = Query(..., ge=1),
    radius: int = Query(5, ge=1, le=15),
    method: str = Query("telea"),
    token: dict = Depends(get_current_token),
    db: Session = Depends(get_db),
):
    """
    服务器端高级去水印接口。
    """
    uid = int(token.get("sub"))
    img = db.query(ImageModel).get(image_id)
    if not img or img.user_id != uid:
        raise HTTPException(status_code=404, detail="图片不存在")

    src_path = Path(img.file_path)
    if not src_path.exists():
        raise HTTPException(status_code=404, detail="源文件不存在")

    try:
        out_path = remove_watermark_opencv(src_path, x, y, w, h, radius=radius, method=method)
    except Exception as e:
        logging.error(f"Remove watermark failed: {e}")
        raise HTTPException(status_code=500, detail=f"去水印失败: {str(e)}")

    # 推断 MIME
    ext = out_path.suffix.lower()
    mime = "image/jpeg" if ext in (".jpg", ".jpeg") else ("image/png" if ext == ".png" else "application/octet-stream")

    return FileResponse(out_path, media_type=mime, filename=out_path.name)
