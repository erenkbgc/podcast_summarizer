"""Prometheus metrics definitions shared across the application."""
from prometheus_client import Counter, Histogram, Gauge, REGISTRY

LLM_REQUEST_DURATION = Histogram(
    "podai_llm_request_duration_seconds",
    "LLM call latency in seconds",
    ["provider", "model", "task"],
    buckets=[0.5, 1, 2, 5, 10, 30, 60, 120],
)

LLM_REQUEST_ERRORS = Counter(
    "podai_llm_request_errors_total",
    "Total LLM call failures",
    ["provider", "model", "error_type"],
)

LLM_CIRCUIT_OPEN = Gauge(
    "podai_llm_circuit_open",
    "Whether the LLM circuit breaker is open (1) or closed (0)",
    ["provider", "model"],
)

TASK_DURATION = Histogram(
    "podai_celery_task_duration_seconds",
    "Celery task processing time",
    ["task_name"],
    buckets=[10, 30, 60, 120, 300, 600, 900, 1800],
)

TASK_ERRORS = Counter(
    "podai_celery_task_errors_total",
    "Celery task failures",
    ["task_name"],
)

TASK_RETRIES = Counter(
    "podai_celery_task_retries_total",
    "Celery task retry attempts",
    ["task_name"],
)

RAG_RETRIEVAL_DURATION = Histogram(
    "podai_rag_retrieval_duration_seconds",
    "RAG vector search latency",
    buckets=[0.05, 0.1, 0.25, 0.5, 1, 2, 5],
)

EPISODE_INGEST_TOTAL = Counter(
    "podai_episode_ingest_total",
    "Total episode ingest requests",
    ["status"],  # queued | failed
)

HTTP_REQUEST_DURATION = Histogram(
    "podai_http_request_duration_seconds",
    "HTTP request latency",
    ["method", "endpoint", "status_code"],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
)
