import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: Dict[str, Any] = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        if hasattr(record, "request_id"):
            payload["request_id"] = getattr(record, "request_id")
        if hasattr(record, "path"):
            payload["path"] = getattr(record, "path")
        if hasattr(record, "method"):
            payload["method"] = getattr(record, "method")
        if hasattr(record, "duration_ms"):
            payload["duration_ms"] = getattr(record, "duration_ms")
        if hasattr(record, "status_code"):
            payload["status_code"] = getattr(record, "status_code")
        if hasattr(record, "statement"):
            payload["statement"] = getattr(record, "statement")
        return json.dumps(payload, ensure_ascii=False)


def setup_logging(level: str = "INFO", json_logs: bool = True) -> None:
    root = logging.getLogger()
    root.setLevel(level.upper())

    # Avoid duplicate handlers when running under reload/test.
    if root.handlers:
        root.handlers.clear()

    handler = logging.StreamHandler()
    if json_logs:
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s")
        )
    root.addHandler(handler)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


def env_log_level(default: str = "INFO") -> str:
    return os.getenv("LOG_LEVEL", default)


def env_log_json(default: bool = True) -> bool:
    value = os.getenv("LOG_JSON", "true" if default else "false").strip().lower()
    return value in {"1", "true", "yes", "on"}


def now_ms() -> int:
    return int(time.time() * 1000)
