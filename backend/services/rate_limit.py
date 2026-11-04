"""In-process sliding-window rate limiter.

Per worker process only (not shared across instances): good enough to blunt
scraping of public endpoints. Idle keys are swept periodically so memory is
bounded by the number of keys active within the longest window.
"""

import threading
import time
from collections import deque

_SWEEP_EVERY_S = 60.0

_lock = threading.Lock()
_hits: dict[str, deque[float]] = {}
_max_window_s = 0.0
_last_sweep = time.monotonic()


def _sweep(now: float) -> None:
    """Drop keys with no hit inside the longest window seen. Lock held."""
    global _last_sweep
    _last_sweep = now
    cutoff = now - _max_window_s
    for key in [k for k, q in _hits.items() if not q or q[-1] <= cutoff]:
        del _hits[key]


def allow(key: str, limit: int, window_s: int) -> bool:
    """Record a hit for key; False if it already had `limit` in the window."""
    global _max_window_s
    now = time.monotonic()
    with _lock:
        _max_window_s = max(_max_window_s, float(window_s))
        if now - _last_sweep >= _SWEEP_EVERY_S:
            _sweep(now)
        q = _hits.setdefault(key, deque())
        cutoff = now - window_s
        while q and q[0] <= cutoff:
            q.popleft()
        if len(q) >= limit:
            # Rejected hits are not recorded, so a blocked client recovers
            # once its old hits age out.
            return False
        q.append(now)
        return True


def reset() -> None:
    """Forget all hits (tests)."""
    global _max_window_s
    with _lock:
        _hits.clear()
        _max_window_s = 0.0
