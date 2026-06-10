from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded


@dataclass
class AppError(Exception):
    code: str
    message: str
    status_code: int = 400
    details: Any = None


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "unknown")


def _error_payload(code: str, message: str, request: Request, details: Any = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "error": {
            "code": code,
            "message": message,
            "request_id": _request_id(request),
        }
    }
    if details is not None:
        payload["error"]["details"] = details
    return payload


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_payload(exc.code, exc.message, request, details=exc.details),
    )


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content=_error_payload("VALIDATION_ERROR", "Request validation failed", request, details=exc.errors()),
    )


async def http_error_handler(request: Request, exc: HTTPException) -> JSONResponse:
    code = {
        400: "BAD_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        409: "CONFLICT",
        429: "RATE_LIMITED",
    }.get(exc.status_code, "HTTP_ERROR")
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_payload(code, str(exc.detail), request),
        headers=exc.headers,
    )


async def rate_limit_error_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    response = await _rate_limit_exceeded_handler(request, exc)
    body = _error_payload("RATE_LIMITED", "Rate limit exceeded", request)
    return JSONResponse(status_code=response.status_code, content=body, headers=dict(response.headers))
