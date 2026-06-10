.PHONY: help up down restart logs init-db pull-model test clean

help:
	@echo "Podcast Summarizer Pro - Development Commands"
	@echo ""
	@echo "  make up          - Start all services"
	@echo "  make down        - Stop all services"
	@echo "  make restart     - Restart all services"
	@echo "  make logs        - View logs (all services)"
	@echo "  make logs-api    - View API logs"
	@echo "  make logs-worker - View worker logs"
	@echo "  make init-db     - Initialize database tables"
	@echo "  make pull-model  - Pull Llama3 model for Ollama"
	@echo "  make shell-api   - Open shell in API container"
	@echo "  make shell-worker - Open shell in worker container"
	@echo "  make test        - Run backend tests in Docker"
	@echo "  make clean       - Remove all data and volumes"

up:
	docker compose up -d

down:
	docker compose down

restart:
	docker compose restart

logs:
	docker compose logs -f

logs-api:
	docker compose logs -f api

logs-worker:
	docker compose logs -f worker

init-db:
	docker compose exec api python -m app.db.init_db

pull-model:
	docker compose exec ollama ollama pull llama3

shell-api:
	docker compose exec api bash

shell-worker:
	docker compose exec worker bash

test:
	docker compose run --rm api-test

clean:
	docker compose down -v
	rm -rf data/ qdrant_storage/
