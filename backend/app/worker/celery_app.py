from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "worker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL
)

# Explicit queue declaration
celery_app.conf.task_queues = (
    {
        "name": "high",
        "exchange": "high",
        "exchange_type": "direct",
        "routing_key": "high"
    },
    {
        "name": "low",
        "exchange": "low",
        "exchange_type": "direct",
        "routing_key": "low"
    }
)

# Route tasks to priority queues: fast chat/tag tasks to 'high', long transcription jobs to 'low'
celery_app.conf.task_routes = {
    "app.worker.tasks.process_podcast": {"queue": "low", "routing_key": "low"},
}

# Default queue for chat/tagging tasks
celery_app.conf.task_default_queue = "high"

celery_app.autodiscover_tasks(["app.worker"])
