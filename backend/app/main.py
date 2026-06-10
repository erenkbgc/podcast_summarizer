import re
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.errors import (
    app_error_handler,
    http_error_handler,
    rate_limit_error_handler,
    validation_error_handler,
    AppError,
    _error_payload,
)
from app.core.logging import get_logger, setup_logging
from app.core.rate_limit import limiter
from app.db.profiling import setup_query_profiling
from app.db.session import engine
from slowapi.errors import RateLimitExceeded

setup_logging(level=settings.LOG_LEVEL, json_logs=settings.LOG_JSON)
logger = get_logger(__name__)
setup_query_profiling(engine, slow_query_ms=settings.DB_SLOW_QUERY_MS)

app = FastAPI(
    title="Podcast Summarizer Pro API",
    description="Local-first AI processing for podcast insights.",
    version="0.1.0",
)
app.state.limiter = limiter

# CORS Middleware
origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip()]
allow_methods = [m.strip().upper() for m in settings.CORS_ALLOW_METHODS.split(",") if m.strip()]
allow_headers = [h.strip() for h in settings.CORS_ALLOW_HEADERS.split(",") if h.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if "*" not in origins else ["*"],
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS if "*" not in origins else False,
    allow_methods=allow_methods if allow_methods else ["GET", "POST", "OPTIONS"],
    allow_headers=allow_headers if allow_headers else ["Authorization", "Content-Type"],
)

# Security Headers Middleware
@app.middleware("http")
async def add_security_headers(request, call_next):
    request_id = request.headers.get("x-request-id", str(uuid4()))
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; object-src 'none';"
    response.headers["X-Request-ID"] = request_id
    return response


@app.middleware("http")
async def access_log_middleware(request: Request, call_next):
    request_id = getattr(request.state, "request_id", str(uuid4()))
    try:
        response = await call_next(request)
        logger.info(
            "request.completed",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
            },
        )
        return response
    except Exception:
        logger.exception(
            "request.failed",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
            },
        )
        raise


_CACHEABLE_GET_PATTERNS = [
    re.compile(r"^/v1/episodes/\d+/(summary|transcript|chapters|glossary|quiz)$"),
    re.compile(r"^/v1/search/global$"),
]


@app.middleware("http")
async def cache_control_middleware(request: Request, call_next):
    response = await call_next(request)
    if request.method == "GET":
        if any(pattern.match(request.url.path) for pattern in _CACHEABLE_GET_PATTERNS):
            response.headers["Cache-Control"] = f"private, max-age={settings.CACHE_DEFAULT_TTL_SEC}, stale-while-revalidate=60"
        else:
            response.headers.setdefault("Cache-Control", "no-store")
    return response
proxy_origins = ["*"] if "*" in origins else origins
# For development with credentials, we usually need the specific origin.
# Let's keep it simple: if it's *, we disable credentials to allow the wildcard.

from app.api.v1.endpoints import podcast, ws, discovery, auth, users

app.include_router(auth.router, prefix="/v1", tags=["auth"])
app.include_router(users.router, prefix="/v1/users", tags=["users"])
app.include_router(podcast.router, prefix="/v1/episodes", tags=["podcasts"])
app.include_router(discovery.router, prefix="/v1", tags=["discovery"])
app.include_router(ws.router, prefix="/ws/status", tags=["websockets"])


@app.get("/")
async def root():
    return {"message": "Welcome to Podcast Summarizer Pro API"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", "unknown")
    logger.exception(
        "unhandled.exception",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
        },
    )
    return JSONResponse(
        status_code=500,
        content=_error_payload("INTERNAL_ERROR", "Internal server error", request),
    )


app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(HTTPException, http_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)
app.add_exception_handler(RateLimitExceeded, rate_limit_error_handler)
