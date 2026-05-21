import time
from typing import Dict, Tuple

from slowapi import Limiter
from slowapi.util import get_remote_address

# 兼容旧版 auth.py 的 limiter 使用
limiter = Limiter(key_func=get_remote_address)

# 简单内存限速（非分布式，仅单进程有效）
# key: str -> (fail_count:int, first_ts:float)
_store: Dict[str, Tuple[int, float]] = {}

WINDOW_SEC = 300  # 5分钟窗口
MAX_FAIL = 6      # 5分钟内最多失败次数
BLOCK_SEC = 900   # 达到阈值后封禁15分钟

# 记录封禁时间 key -> until_ts
_block_until: Dict[str, float] = {}


def _now() -> float:
    return time.time()


def is_blocked(key: str) -> bool:
    # 清理过期封禁
    ts = _block_until.get(key)
    if ts and ts <= _now():
        _block_until.pop(key, None)
        return False
    return ts is not None and ts > _now()


def incr_fail(key: str) -> None:
    # 失败计数
    cnt, first = _store.get(key, (0, _now()))
    now = _now()
    # 超出窗口，重置
    if now - first > WINDOW_SEC:
        cnt, first = 0, now
    cnt += 1
    _store[key] = (cnt, first)
    if cnt >= MAX_FAIL:
        _block_until[key] = now + BLOCK_SEC
        # 重置计数
        _store.pop(key, None)


def reset(key: str) -> None:
    _store.pop(key, None)
    _block_until.pop(key, None)

