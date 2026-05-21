from pathlib import Path
from typing import Tuple
from PIL import Image as PILImage, ImageFile, ImageOps
import os

ImageFile.LOAD_TRUNCATED_IMAGES = True

_FORMAT_MAP = {
    "jpeg": "JPEG",
    "jpg": "JPEG",
    "png": "PNG",
    "webp": "WEBP",
}


def ensure_dirs(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)


def normalize_format(fmt: str) -> str:
    f = fmt.lower()
    if f == "jpg":
        f = "jpeg"
    if f not in _FORMAT_MAP:
        raise ValueError("unsupported format")
    return f


def compress_image(src_path: Path, dst_path: Path, fmt: str, quality: int = 80) -> Tuple[Path, int]:
    fmt = normalize_format(fmt)
    ensure_dirs(dst_path)

    with PILImage.open(src_path) as im:
        # 1. Auto-rotate based on EXIF orientation tag
        im = ImageOps.exif_transpose(im)

        im.load()

        # 2. Strip EXIF/metadata (privacy + size reduction)
        exif = im.getexif()
        if exif:
            exif.clear()

        # 3. Convert to RGB early for JPEG output (handles RGBA/P)
        if fmt == "jpeg" and im.mode in ("RGBA", "P"):
            im = im.convert("RGB")

        save_kwargs = {}
        if fmt == "jpeg":
            # 4. JPEG: chroma subsampling 4:2:0 for 15-20% size reduction
            save_kwargs.update(dict(
                quality=int(quality),
                optimize=True,
                progressive=True,
                subsampling="4:2:0",
            ))
        elif fmt == "png":
            # 5. PNG: compress_level=6 + quantize if >256 colors
            save_kwargs.update(dict(optimize=True, compress_level=6))
            if im.mode == "RGBA":
                try:
                    im = im.quantize(colors=256, method=PILImage.Quantize.FASTOCTREE)
                except Exception:
                    pass
        elif fmt == "webp":
            # 6. WebP: method=6 for 5-10% better compression
            save_kwargs.update(dict(quality=int(quality), method=6))

        im.save(dst_path.as_posix(), _FORMAT_MAP[fmt], **save_kwargs)

    size = os.path.getsize(dst_path)
    return dst_path, size

