import logging
import time

from sqlalchemy import event
from sqlalchemy.engine import Engine


def setup_query_profiling(engine: Engine, slow_query_ms: int = 250) -> None:
    logger = logging.getLogger("db.profiler")

    @event.listens_for(engine, "before_cursor_execute")
    def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        conn.info.setdefault("query_start_time", []).append(time.time())

    @event.listens_for(engine, "after_cursor_execute")
    def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        start_time = conn.info.get("query_start_time", [None]).pop(-1)
        if start_time is None:
            return
        duration_ms = (time.time() - start_time) * 1000
        if duration_ms >= slow_query_ms:
            logger.warning(
                "db.slow_query",
                extra={
                    "duration_ms": round(duration_ms, 2),
                    "statement": " ".join((statement or "").split())[:500],
                },
            )
