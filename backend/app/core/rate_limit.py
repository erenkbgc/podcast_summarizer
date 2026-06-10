from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings


storage_url = settings.RATE_LIMIT_STORAGE_URL or settings.REDIS_URL
limiter = Limiter(key_func=get_remote_address, default_limits=[settings.RATE_LIMIT_DEFAULT], storage_uri=storage_url)
