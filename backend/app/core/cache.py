import json
from typing import Any

import redis

from app.core.config import settings


def _cache_client():
    try:
        return redis.from_url(settings.REDIS_URL, decode_responses=True)
    except Exception:
        return None


def _safe_user(user_id: str) -> str:
    return "".join(ch for ch in user_id if ch.isalnum() or ch in {"-", "_"})


def episode_cache_key(user_id: str, episode_id: int, suffix: str) -> str:
    return f"podai:ep:{_safe_user(user_id)}:{episode_id}:{suffix}"


def cache_get_json(key: str) -> Any | None:
    client = _cache_client()
    if not client:
        return None
    try:
        raw = client.get(key)
        return json.loads(raw) if raw else None
    except Exception:
        return None


def cache_set_json(key: str, value: Any, ttl_sec: int | None = None) -> None:
    client = _cache_client()
    if not client:
        return
    try:
        ttl = ttl_sec if ttl_sec is not None else settings.CACHE_DEFAULT_TTL_SEC
        client.setex(key, ttl, json.dumps(value, ensure_ascii=False))
    except Exception:
        return


def invalidate_episode_cache(user_id: str, episode_id: int) -> None:
    client = _cache_client()
    if not client:
        return
    pattern = episode_cache_key(user_id, episode_id, "*")
    try:
        for key in client.scan_iter(match=pattern):
            client.delete(key)
    except Exception:
        return
