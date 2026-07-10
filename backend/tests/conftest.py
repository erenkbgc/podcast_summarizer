"""Shared test fixtures for the PodAI backend test suite."""
import os
import pytest

# Use in-memory SQLite for tests — no running Postgres required.
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_podai.db")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")
os.environ.setdefault("QDRANT_URL", "http://localhost:6333")
os.environ.setdefault("OLLAMA_URL", "http://localhost:11434")
os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-at-least-32-chars-long!!")
os.environ.setdefault("LLM_PROVIDER", "ollama")
os.environ.setdefault("LOG_JSON", "false")

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.db.session import Base, get_db
from app.main import app

TEST_DB_URL = "sqlite://"  # in-memory

engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session", autouse=True)
def create_tables():
    from app.models.podcast import User, Episode, Podcast, Transcript, Summary, Chapter, Glossary, Quiz
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def db():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db):
    def _override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def registered_user(client):
    """Register a user and return (username, password, token_response)."""
    payload = {"username": "testuser", "password": "StrongPass123!", "email": "test@example.com"}
    resp = client.post("/v1/register", json=payload)
    assert resp.status_code == 200, resp.text
    return payload["username"], payload["password"], resp.json()


@pytest.fixture()
def auth_headers(registered_user):
    _, _, tokens = registered_user
    return {"Authorization": f"Bearer {tokens['access_token']}"}
