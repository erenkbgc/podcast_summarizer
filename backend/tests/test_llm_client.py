"""Tests for LLMClient: JSON parsing, circuit breaker, fallback chain."""
import json
import pytest
from unittest.mock import MagicMock, patch


# ── helpers ──────────────────────────────────────────────────────────────────

def make_client(**kwargs):
    """Return an LLMClient with Redis disabled (no live service needed)."""
    from app.services.llm_client import LLMClient
    with patch("app.services.llm_client.redis") as mock_redis:
        mock_redis.from_url.return_value.ping.side_effect = Exception("no redis")
        client = LLMClient(**kwargs)
    return client


# ── JSON parsing ─────────────────────────────────────────────────────────────

class TestParseJsonObject:
    def setup_method(self):
        self.client = make_client()

    def test_valid_json(self):
        result = self.client._parse_json_object('{"key": "value"}')
        assert result == {"key": "value"}

    def test_json_with_markdown_fences(self):
        result = self.client._parse_json_object('```json\n{"key": "value"}\n```')
        assert result == {"key": "value"}

    def test_json_with_leading_text(self):
        result = self.client._parse_json_object('Here is the output:\n{"key": "value"}')
        assert result == {"key": "value"}

    def test_empty_string_returns_empty_dict(self):
        assert self.client._parse_json_object("") == {}

    def test_unparseable_returns_fallback_dict(self):
        result = self.client._parse_json_object("not json at all")
        # Must return a dict (not raise)
        assert isinstance(result, dict)


class TestParseJsonList:
    def setup_method(self):
        self.client = make_client()

    def test_valid_array(self):
        result = self.client._parse_json_list('[{"a": 1}, {"b": 2}]')
        assert result == [{"a": 1}, {"b": 2}]

    def test_object_wrapped_list(self):
        result = self.client._parse_json_list('{"items": [{"a": 1}]}')
        assert result == [{"a": 1}]

    def test_markdown_fences_stripped(self):
        result = self.client._parse_json_list('```json\n[{"a": 1}]\n```')
        assert result == [{"a": 1}]

    def test_empty_string_returns_empty_list(self):
        assert self.client._parse_json_list("") == []

    def test_unparseable_returns_empty_list(self):
        result = self.client._parse_json_list("not a list")
        assert isinstance(result, list)


# ── Circuit breaker (in-memory path) ─────────────────────────────────────────

class TestCircuitBreaker:
    def setup_method(self):
        self.client = make_client()
        # Ensure no Redis; circuit state is no-op without it
        self.client._redis = None

    def test_circuit_open_without_redis_always_false(self):
        assert self.client._is_circuit_open("ollama", "llama3") is False

    def test_mark_failure_without_redis_does_not_raise(self):
        # Should silently succeed even without Redis
        for _ in range(10):
            self.client._mark_failure("ollama", "llama3")

    def test_mark_success_without_redis_does_not_raise(self):
        self.client._mark_success("ollama", "llama3")


# ── Fallback chain parsing ────────────────────────────────────────────────────

class TestFallbackChain:
    def setup_method(self):
        self.client = make_client()

    def test_chain_deduplicates(self):
        """Primary provider should not appear twice in the route chain."""
        self.client.provider = "ollama"
        self.client.model = "llama3"
        # Set a fallback chain that repeats the primary
        with patch.object(self.client, "_parse_fallback_chain", return_value=[("ollama", "llama3")]):
            chain = self.client._route_chain()
        assert chain.count(("ollama", "llama3")) == 1

    def test_parse_fallback_chain_with_colon(self):
        from unittest.mock import patch as _patch
        import app.core.config as cfg
        with _patch.object(cfg.settings, "LLM_FALLBACK_CHAIN", "openai:gpt-4o,anthropic:claude-3"):
            chain = self.client._parse_fallback_chain()
        assert ("openai", "gpt-4o") in chain
        assert ("anthropic", "claude-3") in chain

    def test_parse_fallback_chain_without_colon(self):
        import app.core.config as cfg
        from unittest.mock import patch as _patch
        with _patch.object(cfg.settings, "LLM_FALLBACK_CHAIN", "openai"):
            chain = self.client._parse_fallback_chain()
        assert len(chain) == 1
        provider, model = chain[0]
        assert provider == "openai"
        assert model  # default model should be set


# ── chat() routing ────────────────────────────────────────────────────────────

class TestChatRouting:
    def test_chat_calls_ollama_by_default(self):
        client = make_client()
        client.provider = "ollama"

        with patch.object(client, "_call_ollama", return_value="hello") as mock_call, \
             patch.object(client, "_is_circuit_open", return_value=False), \
             patch.object(client, "_mark_success"):
            result = client.chat([{"role": "user", "content": "hi"}])

        mock_call.assert_called_once()
        assert result == "hello"

    def test_chat_skips_open_circuit(self):
        client = make_client()
        client.provider = "ollama"
        client.model = "llama3"

        call_log = []

        def fake_is_open(provider, model):
            call_log.append(provider)
            return True  # always open → all providers skipped

        with patch.object(client, "_is_circuit_open", side_effect=fake_is_open), \
             patch.object(client, "_parse_fallback_chain", return_value=[]):
            result = client.chat([{"role": "user", "content": "hi"}])

        # With circuit open and no fallback, should return an empty/error string
        assert isinstance(result, str)
