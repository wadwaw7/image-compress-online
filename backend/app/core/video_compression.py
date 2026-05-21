"""Video compression via ffmpeg subprocess."""

from __future__ import annotations

import json
import logging
import os
import subprocess
import threading
from pathlib import Path
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

MAX_CONCURRENT = 2
_semaphore = threading.Semaphore(MAX_CONCURRENT)

CODEC_MAP = {
    "h264": {"codec": "libx264", "ext": "mp4", "pix_fmt": "yuv420p"},
    "h265": {"codec": "libx265", "ext": "mp4", "pix_fmt": "yuv420p"},
    "vp9": {"codec": "libvpx-vp9", "ext": "webm", "pix_fmt": None},
}

# 0-100% quality → CRF 28-17 (lower CRF = better quality)
def quality_to_crf(quality: int) -> int:
    q = max(0, min(100, int(quality)))
    return round(28 - (q / 100.0) * 11)


def _run(args: list[str], timeout: int = 1800) -> subprocess.CompletedProcess:
    return subprocess.run(
        args, capture_output=True, text=True, timeout=timeout,
        env={**os.environ, "OPENBLAS_NUM_THREADS": "1", "OMP_NUM_THREADS": "1"},
    )


def probe_video(src_path: Path) -> dict:
    """Return video metadata via ffprobe or {} on failure."""
    try:
        proc = _run([
            "ffprobe", "-v", "quiet", "-print_format", "json",
            "-show_format", "-show_streams",
            str(src_path),
        ], timeout=30)
        return json.loads(proc.stdout) if proc.returncode == 0 else {}
    except Exception:
        logger.warning("ffprobe failed for %s", src_path)
        return {}


def get_video_duration(src_path: Path) -> float:
    """Return duration in seconds or 0 on failure."""
    info = probe_video(src_path)
    try:
        return float(info["format"]["duration"])
    except Exception:
        return 0.0


def compress_video(
    src_path: Path,
    dst_path: Path,
    codec: str = "h264",
    crf: int = 23,
    max_width: int = 0,
    max_height: int = 0,
    fps: int = 0,
    audio_bitrate: str = "128k",
    timeout: int = 1800,
) -> Tuple[Path, int]:
    conf = CODEC_MAP.get(codec)
    if not conf:
        raise ValueError(f"Unsupported codec: {codec}")

    dst_path.parent.mkdir(parents=True, exist_ok=True)

    acquired = _semaphore.acquire(timeout=timeout)
    try:
        args = ["ffmpeg", "-y", "-i", str(src_path)]

        if max_width > 0 and max_height > 0:
            args += ["-vf", f"scale={max_width}:{max_height}:force_original_aspect_ratio=decrease"]
        elif max_width > 0:
            args += ["-vf", f"scale={max_width}:-1"]
        elif max_height > 0:
            args += ["-vf", f"scale=-1:{max_height}"]

        if fps > 0:
            args += ["-r", str(fps)]

        args += ["-c:v", conf["codec"], "-crf", str(crf)]
        if conf["pix_fmt"]:
            args += ["-pix_fmt", conf["pix_fmt"]]
        args += ["-preset", "medium"]
        args += ["-c:a", "aac", "-b:a", audio_bitrate]
        args += ["-movflags", "+faststart"]
        args += [str(dst_path)]

        proc = _run(args, timeout=timeout)
        if proc.returncode != 0:
            stderr = proc.stderr[-500:] if proc.stderr else ""
            raise RuntimeError(f"ffmpeg failed (code={proc.returncode}): {stderr}")

        size = dst_path.stat().st_size
        return dst_path, size
    finally:
        if acquired:
            _semaphore.release()
