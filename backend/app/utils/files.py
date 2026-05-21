from hashlib import md5
from pathlib import Path
from typing import Tuple
import os

from fastapi import UploadFile

CHUNK_SIZE = 1024 * 1024

IMAGE_EXTS = {"png", "jpeg", "jpg", "webp"}
VIDEO_EXTS = {"mp4", "mov", "avi", "webm", "mkv", "flv", "wmv"}
ALLOWED_EXTS = IMAGE_EXTS | VIDEO_EXTS

IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp"}
VIDEO_MIMES = {"video/mp4", "video/quicktime", "video/x-msvideo", "video/webm", "video/x-matroska", "video/x-flv", "video/x-ms-wmv"}

def is_video(filename: str) -> bool:
    ext = get_ext_from_filename(filename)
    return ext in VIDEO_EXTS


class FileTooLargeError(Exception):
    """Raised when uploaded file exceeds size limit."""



def calc_md5_fileobj(fileobj) -> str:
    h = md5()
    while True:
        chunk = fileobj.read(CHUNK_SIZE)
        if not chunk:
            break
        h.update(chunk)
    return h.hexdigest()


def get_ext_from_filename(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower().lstrip(".")
    if ext == "jpg":
        ext = "jpeg"
    return ext or ""


def save_upload_file(
    dst_dir: Path,
    upfile: UploadFile,
    max_bytes: int | None = None,
) -> Tuple[Path, int, str, str]:
    # Read content to temp and compute md5
    dst_dir.mkdir(parents=True, exist_ok=True)
    # compute md5 by reading
    upfile.file.seek(0)
    digest = calc_md5_fileobj(upfile.file)
    upfile.file.seek(0)

    ext = get_ext_from_filename(upfile.filename or "")
    safe_name = f"{digest}.{ext or 'bin'}"
    dst_path = dst_dir / safe_name

    total = 0
    with open(dst_path, "wb") as out:
        while True:
            data = upfile.file.read(CHUNK_SIZE)
            if not data:
                break
            total += len(data)
            if max_bytes is not None and total > max_bytes:
                try:
                    out.close()
                    dst_path.unlink(missing_ok=True)
                except Exception:
                    pass
                raise FileTooLargeError()
            out.write(data)

    size = dst_path.stat().st_size
    return dst_path, size, ext or "bin", digest

