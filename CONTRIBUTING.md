# Contributing to PodAI

Thank you for your interest in contributing. This document covers how to get a local dev environment running, the branch/PR workflow, and how to extend the project.

---

## Local Development Setup

### Prerequisites

- Docker & Docker Compose
- NVIDIA GPU + `nvidia-docker2` (optional but recommended for transcription speed)
- Node.js 20+ (for frontend-only changes without Docker)
- Python 3.10+ (for backend-only changes without Docker)

### 1. Clone and configure

```bash
git clone https://github.com/your-username/podcast-summarizer.git
cd podcast-summarizer
cp .env.example .env
# Edit .env — at minimum set SECRET_KEY and choose an LLM provider
```

### 2. Start services

```bash
docker compose up -d
docker compose exec api alembic upgrade head
```

### 3. Verify everything works

```bash
curl http://localhost:8000/health    # expect {"status": "healthy", "checks": {...}}
curl http://localhost:8000/metrics   # expect Prometheus text format
```

---

## Branch Naming

| Type | Pattern | Example |
|------|---------|---------|
| Feature | `feat/<short-description>` | `feat/pdf-export` |
| Bug fix | `fix/<short-description>` | `fix/ws-reconnect` |
| Refactor | `refactor/<area>` | `refactor/llm-client` |
| Docs | `docs/<topic>` | `docs/deployment` |

---

## Pull Request Checklist

Before opening a PR ensure:

- [ ] Backend tests pass: `docker compose run --rm api-test`
- [ ] Frontend type check passes: `cd frontend && npm run typecheck`
- [ ] Frontend lints cleanly: `cd frontend && npm run lint`
- [ ] Frontend builds: `cd frontend && npm run build`
- [ ] New features have at least one test covering the happy path
- [ ] No `print()` statements — use `logger.info/warning/error`
- [ ] No new `any` types in TypeScript without a comment explaining why

---

## Running Tests

### Backend

```bash
# In Docker (matches CI):
docker compose run --rm api-test

# With coverage report:
docker compose run --rm api-test pytest --cov=app --cov-report=term-missing
```

### Frontend

```bash
cd frontend
npm ci
npm run typecheck
npm run lint
npm run build
```

---

## Project Layout

```
backend/app/
├── api/v1/endpoints/   # FastAPI route handlers
├── services/           # Business logic (LLM, transcription, RAG, chat)
├── models/             # SQLAlchemy ORM
├── schemas/            # Pydantic v2 request/response models
├── core/               # Config, security, metrics, rate limiting, cache
├── db/                 # Session, Alembic migrations
└── worker/             # Celery tasks and queue configuration

frontend/src/
├── app/                # Next.js App Router pages
├── components/         # React components
├── hooks/              # Custom hooks (usePodcastSocket, etc.)
├── context/            # Auth context
└── lib/                # API client (axios), utilities
```

---

## Adding a New LLM Provider

1. Open `backend/app/services/llm_client.py`
2. Add a new `_call_<provider>()` method following the pattern of `_call_ollama` / `_call_openai`
3. Wire it into the `chat()` routing block (the `for provider, model in self._route_chain()` loop)
4. Add any new env vars to `backend/app/core/config.py` and `.env.example`
5. Update `README.md` → **Configuration** table

---

## Metrics

The `/metrics` endpoint exports Prometheus data. Key metrics:

| Metric | Type | Description |
|--------|------|-------------|
| `podai_llm_request_duration_seconds` | Histogram | LLM call latency by provider/model/task |
| `podai_llm_request_errors_total` | Counter | LLM failures by provider/error type |
| `podai_celery_task_duration_seconds` | Histogram | End-to-end pipeline processing time |
| `podai_celery_task_errors_total` | Counter | Task failures |
| `podai_rag_retrieval_duration_seconds` | Histogram | Vector search latency |
| `podai_episode_ingest_total` | Counter | Ingest requests (queued / failed) |

---

## Code Style

- **Python:** Follow PEP 8. Use `logger` (not `print`). Type-hint public functions.
- **TypeScript:** Avoid `any`. Use discriminated unions for API response types.
- **Formatting:** `cd frontend && npm run format` before committing frontend changes.
