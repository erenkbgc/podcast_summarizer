from celery import Celery
from kombu import Queue, Exchange
from app.core.config import settings

celery_app = Celery(
    "worker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL
)

# Explicit queue declaration using kombu Queue objects (Celery requires Queue
# instances here, not plain dicts).
high_exchange = Exchange("high", type="direct")
low_exchange = Exchange("low", type="direct")

celery_app.conf.task_queues = (
    Queue("high", exchange=high_exchange, routing_key="high"),
    Queue("low", exchange=low_exchange, routing_key="low"),
)

# Route long transcription jobs to 'low'; fast chat/tag tasks default to 'high'.
celery_app.conf.task_routes = {
    "app.worker.tasks.process_podcast": {"queue": "low", "routing_key": "low"},
}

celery_app.conf.task_default_queue = "high"
celery_app.conf.task_default_exchange = "high"
celery_app.conf.task_default_routing_key = "high"

celery_app.autodiscover_tasks(["app.worker"])
