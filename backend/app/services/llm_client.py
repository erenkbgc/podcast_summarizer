import hashlib
import json
import math
import random
import re
import time
from typing import Any, Dict, List, Optional, Tuple

import requests
import redis

from app.core.config import settings
from app.core.logging import get_logger


logger = get_logger(__name__)


class PromptManager:
    """Prompt registry with versioning, variants, and multiple summary modes."""

    VERSION = "2026.05.05"  # Updated for new modes

    def __init__(self, ab_ratio: int = 50):
        self.ab_ratio = max(0, min(100, ab_ratio))

    def choose_variant(self, seed: str) -> str:
        digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
        bucket = int(digest[:8], 16) % 100
        return "A" if bucket < self.ab_ratio else "B"

    def _get_mode_instructions(self, mode: str) -> str:
        """Get specific instructions for TLDR, Standard, or Deep modes."""
        instructions = {
            "tldr": (
                "key_insights: 3-4 MOST IMPORTANT insights only (brevity over completeness)\n"
                "action_items: 2-3 TOP PRIORITY actions only\n"
                "global_summary: 1-2 short paragraphs MAX\n"
                "key_quotes: 2-3 top quotes only\n"
            ),
            "standard": (
                "key_insights: 5-8 important discoveries\n"
                "action_items: 5-8 actionable items\n"
                "global_summary: 3-4 detailed paragraphs\n"
                "key_quotes: 4-6 impactful quotes\n"
            ),
            "deep": (
                "key_insights: 8-12 comprehensive discoveries including nuanced findings\n"
                "action_items: 8-12 detailed actionable items with context\n"
                "global_summary: 5+ deep analysis paragraphs\n"
                "key_quotes: 8-10 quotes with detailed context\n"
                "Include detailed analysis, edge cases, and alternative perspectives\n"
            ),
        }
        return instructions.get(mode, instructions["standard"])

    def _get_language_instruction(self, language: str) -> str:
        """Get language-specific instruction."""
        lang_map = {
            "en": "English",
            "tr": "Turkish (Türkçe)",
            "fr": "French (Français)",
            "es": "Spanish (Español)",
            "de": "German (Deutsch)",
            "it": "Italian (Italiano)",
            "pt": "Portuguese (Português)",
            "ru": "Russian (Русский)",
            "zh": "Chinese (中文)",
            "ja": "Japanese (日本語)",
            "ko": "Korean (한국어)",
        }
        lang_name = lang_map.get(language.lower(), "English")
        return (
            f"LANGUAGE REQUIREMENT: You MUST respond in {lang_name} and ONLY in {lang_name}. "
            f"No mixing with other languages. All text fields must be native-speaker quality in {lang_name}."
        )

    def summary_prompt(
        self,
        *,
        full_lang: str,
        style_hint: str,
        formatted_text: str,
        summary_type: str,
        mode: str = "standard",
        language: str = "en",
        variant: str = "A",
    ) -> str:
        mode_instructions = self._get_mode_instructions(mode)
        lang_instruction = self._get_language_instruction(language)
        mode_label = f"[{mode.upper()}]" if mode != "standard" else ""

        return (
            f"You are an insightful podcast analyst. Your mission: extract meaningful insights from this podcast transcript. {mode_label}\n"
            f"Style: {style_hint}\n\n"
            f"{lang_instruction}\n\n"
            "━━━ SUMMARY FORMAT FOR THIS MODE ━━━\n"
            "executive_brief: 1-2 sentences capturing the CORE THESIS. What makes this episode unique?\n"
            f"{mode_instructions}\n"
            "suggested_questions: 3-4 follow-up questions (NOT required for TLDR)\n\n"
            "━━━ QUALITY STANDARDS ━━━\n"
            "• Be SPECIFIC: name people, concepts, data, contradictions\n"
            "• Skip generic phrases like 'various topics were discussed'\n"
            "• Explain WHY things matter, not just WHAT was said\n"
            "• For insights: include confidence level (HIGH/MEDIUM/LOW)\n"
            "• For action items: include timeframe and who should do it\n"
            "• For quotes: use exact verbatim text with precise timestamps\n\n"
            "━━━ REQUIRED FIELDS ━━━\n"
            "1) Return ONLY valid JSON — no markdown wrappers\n"
            "2) global_summary MUST use markdown (##, -, **bold**)\n"
            "3) Topics must sum to ~100\n"
            "4) insight_density: High | Medium | Light\n"
            "5) Ensure all content reflects native cultural context where appropriate\n\n"
            "JSON FORMAT:\n"
            "{\n"
            '  "executive_brief": "Core thesis in 1-2 sentences",\n'
            '  "global_summary": "## Section\\n\\nParagraph with details...",\n'
            '  "action_items": [{"text": "action", "timeframe": "immediate/short/long", "owner": "who"}],\n'
            '  "key_insights": [{"text": "insight", "confidence": "HIGH|MEDIUM|LOW", "why_matters": "context"}],\n'
            '  "key_quotes": [{"text": "exact quote", "timestamp": 42.5, "speaker": "Name"}],\n'
            '  "speaker_contribution": {"Name": 55},\n'
            '  "topics": [{"label": "Topic", "value": 35}],\n'
            '  "insight_density": "High|Medium|Light",\n'
            '  "summary_mode": "' + mode + '",\n'
            '  "language": "' + language + '"\n'
            "}\n\n"
            f"TRANSCRIPT:\n{formatted_text}\n\nJSON:"
        )


class LLMClient:
    def __init__(self, base_url: str = settings.OLLAMA_URL, model: Optional[str] = None, provider: Optional[str] = None):
        self.base_url = f"{base_url}/api"
        self.provider = (provider or settings.LLM_PROVIDER or "ollama").strip().lower()
        self.model = model or self._default_model_for_provider(self.provider)
        self.timeout = max(5, int(settings.LLM_REQUEST_TIMEOUT_SEC))
        self.max_retries = max(1, int(settings.LLM_MAX_RETRIES))
        self.backoff_base = max(0.1, float(settings.LLM_RETRY_BACKOFF_BASE_SEC))
        self.num_ctx = max(1024, int(settings.LLM_NUM_CTX))
        self.ctx_warn_ratio = float(settings.LLM_CTX_WARN_RATIO)
        self.prompt_manager = PromptManager(ab_ratio=settings.LLM_AB_TEST_RATIO)
        # Redis client for distributed circuit breaker state
        try:
            self._redis = redis.from_url(settings.REDIS_URL, decode_responses=True)
            self._redis.ping()  # Verify connection
        except Exception as e:
            logger.warning(f"Redis connection failed for circuit breaker: {e}. Falling back to in-memory state.")
            self._redis = None

    def _default_model_for_provider(self, provider: str) -> str:
        if provider == "openai":
            return settings.OPENAI_MODEL
        if provider == "anthropic":
            return settings.ANTHROPIC_MODEL
        return settings.OLLAMA_MODEL

    def _parse_fallback_chain(self) -> List[Tuple[str, str]]:
        routes: List[Tuple[str, str]] = []
        for item in (settings.LLM_FALLBACK_CHAIN or "").split(","):
            item = item.strip()
            if not item:
                continue
            if ":" in item:
                p, m = item.split(":", 1)
                routes.append((p.strip().lower(), m.strip()))
            else:
                p = item.strip().lower()
                routes.append((p, self._default_model_for_provider(p)))
        return routes

    def _route_chain(self) -> List[Tuple[str, str]]:
        chain = [(self.provider, self.model)] + self._parse_fallback_chain()
        unique: List[Tuple[str, str]] = []
        seen = set()
        for provider, model in chain:
            key = f"{provider}:{model}"
            if key in seen:
                continue
            seen.add(key)
            unique.append((provider, model))
        return unique

    def _route_key(self, provider: str, model: str) -> str:
        return f"{provider}:{model}"

    def _is_circuit_open(self, provider: str, model: str) -> bool:
        key = f"circuit:{self._route_key(provider, model)}"
        try:
            if self._redis:
                raw = self._redis.get(key)
                if raw:
                    state = json.loads(raw)
                    return time.time() < float(state.get("open_until", 0.0))
                return False
        except Exception as e:
            logger.warning(f"Redis circuit breaker check failed: {e}")
        return False

    def _mark_success(self, provider: str, model: str) -> None:
        key = f"circuit:{self._route_key(provider, model)}"
        try:
            if self._redis:
                self._redis.delete(key)
        except Exception as e:
            logger.warning(f"Redis circuit breaker reset failed: {e}")

    def _mark_failure(self, provider: str, model: str) -> None:
        key = f"circuit:{self._route_key(provider, model)}"
        try:
            if self._redis:
                raw = self._redis.get(key)
                state = json.loads(raw) if raw else {"failures": 0.0, "open_until": 0.0}
                failures = float(state.get("failures", 0.0)) + 1.0
                open_until = float(state.get("open_until", 0.0))
                if failures >= float(settings.LLM_CIRCUIT_BREAKER_FAILURES):
                    open_until = time.time() + float(settings.LLM_CIRCUIT_BREAKER_COOLDOWN_SEC)
                    failures = 0.0
                new_state = {"failures": failures, "open_until": open_until}
                self._redis.setex(key, int(settings.LLM_CIRCUIT_BREAKER_COOLDOWN_SEC * 2), json.dumps(new_state))
        except Exception as e:
            logger.warning(f"Redis circuit breaker update failed: {e}")

    def _count_tokens(self, messages: List[Dict[str, str]]) -> int:
        text = "\n".join([f"{m.get('role','user')}: {m.get('content','')}" for m in messages])
        try:
            import tiktoken

            enc = tiktoken.get_encoding("cl100k_base")
            return len(enc.encode(text))
        except Exception:
            # fallback heuristic
            return max(1, len(text) // 4)

    def _trim_messages_to_context(self, messages: List[Dict[str, str]], reserve_tokens: int = 1200) -> List[Dict[str, str]]:
        max_tokens = max(1024, self.num_ctx - reserve_tokens)
        trimmed = [dict(m) for m in messages]
        while len(trimmed) > 1 and self._count_tokens(trimmed) > max_tokens:
            # keep the system prompt and remove oldest context turn first
            if len(trimmed) > 2:
                trimmed.pop(1)
            else:
                break

        used = self._count_tokens(trimmed)
        ratio = used / max(1, self.num_ctx)
        if ratio >= self.ctx_warn_ratio:
            logger.warning(
                "llm.context_window.warning",
                extra={"used_tokens": used, "num_ctx": self.num_ctx, "ratio": round(ratio, 3)},
            )
        return trimmed

    def _get_lang_name(self, code: str) -> str:
        lang_map = {
            "tr": "Turkish",
            "en": "English",
            "fr": "French",
            "de": "German",
            "es": "Spanish",
            "it": "Italian",
            "pt": "Portuguese",
            "ru": "Russian",
            "zh": "Chinese",
            "ja": "Japanese",
            "ko": "Korean",
        }
        return lang_map.get((code or "en").lower(), (code or "EN").upper())

    def _call_ollama(self, messages: List[Dict[str, str]], model: str, stream: bool = False, format: str = "", options: Optional[Dict[str, Any]] = None) -> Any:
        url = f"{self.base_url}/chat"
        merged_options: Dict[str, Any] = {
            "num_ctx": self.num_ctx,
            "temperature": 0.2,
        }
        if options:
            merged_options.update(options)
        payload = {
            "model": model,
            "messages": messages,
            "stream": stream,
            "options": merged_options,
        }
        if format:
            payload["format"] = format

        if stream:
            # Return a generator of text deltas parsed from Ollama's
            # newline-delimited JSON stream. (Previously the raw Response was
            # returned, so callers iterated over bytes and crashed.)
            def _token_gen():
                resp = requests.post(url, json=payload, stream=True, timeout=self.timeout)
                resp.raise_for_status()
                for line in resp.iter_lines(decode_unicode=True):
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                    except Exception:
                        continue
                    delta = (data.get("message") or {}).get("content", "")
                    if delta:
                        yield delta
                    if data.get("done"):
                        break
            return _token_gen()

        response = requests.post(url, json=payload, timeout=self.timeout)
        response.raise_for_status()
        return response.json()["message"]["content"]

    def _call_openai(self, messages: List[Dict[str, str]], model: str, format: str = "") -> str:
        if not settings.OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY is missing")
        payload: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": 0.2,
        }
        if format == "json":
            payload["response_format"] = {"type": "json_object"}
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=self.timeout,
        )
        response.raise_for_status()
        data = response.json()
        return str(data["choices"][0]["message"]["content"])

    def _call_anthropic(self, messages: List[Dict[str, str]], model: str, format: str = "") -> str:
        if not settings.ANTHROPIC_API_KEY:
            raise RuntimeError("ANTHROPIC_API_KEY is missing")
        system_parts = [m.get("content", "") for m in messages if m.get("role") == "system"]
        non_system = [m for m in messages if m.get("role") != "system"]

        system_text = "\n".join(system_parts)
        if format == "json":
            system_text = (system_text + "\nReturn valid JSON only.").strip()

        # Use prompt caching for static system prompts (5 min ephemeral cache)
        # This reduces costs by ~80% on repeated calls with same system prompt
        system_payload = {
            "type": "text",
            "text": system_text,
            "cache_control": {"type": "ephemeral"}
        }

        payload: Dict[str, Any] = {
            "model": model,
            "max_tokens": 2048,
            "temperature": 0.2,
            "messages": non_system,
            "system": [system_payload],  # Wrap in list for cache_control support
        }

        response = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": settings.ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json=payload,
            timeout=self.timeout,
        )
        response.raise_for_status()
        data = response.json()
        content = data.get("content", [])
        if not content:
            return ""
        return str(content[0].get("text", ""))

    def _dispatch(self, provider: str, model: str, messages: List[Dict[str, str]], stream: bool, format: str, options: Optional[Dict[str, Any]] = None) -> Any:
        provider = (provider or "ollama").lower()
        if provider == "openai":
            # OpenAI streaming not implemented — degrade gracefully to a
            # single-chunk generator so the stream path never crashes.
            if stream:
                return iter([self._call_openai(messages=messages, model=model, format=format)])
            return self._call_openai(messages=messages, model=model, format=format)
        if provider == "anthropic":
            if stream:
                return iter([self._call_anthropic(messages=messages, model=model, format=format)])
            return self._call_anthropic(messages=messages, model=model, format=format)
        return self._call_ollama(messages=messages, model=model, stream=stream, format=format, options=options)

    # Output-token budgets per pipeline task (Ollama num_predict). Without a cap the
    # model generates until it decides to stop, which dominates request latency.
    TASK_OUTPUT_BUDGET: Dict[str, int] = {
        "generate_summary": 1024,
        "progressive_chunk_summary": 512,
        "extract_chapters": 512,
        "extract_glossary": 512,
        "extract_entities": 512,
        "extract_podcast_tags": 256,
        "extract_verifiable_claims": 384,
        "generate_quiz": 1280,
        "identify_speakers": 256,
        "generate_visual_signals": 512,
        "generate_persona_summary": 640,
        "translate_transcript_chunk_json": 1024,
        "translate_segments": 1024,
        "translate_summary_fields": 1536,
        "chat_response": 640,
        "library_chat": 640,
        "chat_suggestions": 256,
        "chat_context_compression": 384,
        "memory_context_compression": 384,
        "hyde_generation": 256,
        "query_refinement": 128,
        "multi_hop_query_generation": 192,
    }
    DEFAULT_OUTPUT_BUDGET: int = 1024

    def _build_options(self, token_estimate: int, metadata: Optional[Dict[str, Any]], options: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Per-request Ollama options: task-based output cap and a right-sized num_ctx.

        num_ctx is grown in powers of two to fit prompt + output (a 16k KV cache for a
        300-token tag prompt slows every request), but never exceeds the configured max.
        """
        opts: Dict[str, Any] = dict(options or {})
        task_name = str((metadata or {}).get("task", ""))
        opts.setdefault("num_predict", self.TASK_OUTPUT_BUDGET.get(task_name, self.DEFAULT_OUTPUT_BUDGET))
        if "num_ctx" not in opts:
            needed = token_estimate + int(opts["num_predict"]) + 256
            num_ctx = 2048
            while num_ctx < needed and num_ctx < self.num_ctx:
                num_ctx *= 2
            opts["num_ctx"] = min(num_ctx, self.num_ctx)
        return opts

    def chat(
        self,
        messages: List[Dict[str, str]],
        stream: bool = False,
        format: str = "",
        metadata: Optional[Dict[str, Any]] = None,
        options: Optional[Dict[str, Any]] = None,
    ) -> Any:
        trimmed_messages = self._trim_messages_to_context(messages)
        token_estimate = self._count_tokens(trimmed_messages)
        request_options = self._build_options(token_estimate, metadata, options)

        last_error: Optional[Exception] = None
        for provider, model in self._route_chain():
            if self._is_circuit_open(provider, model):
                continue

            for attempt in range(1, self.max_retries + 1):
                try:
                    response = self._dispatch(provider, model, trimmed_messages, stream=stream, format=format, options=request_options)
                    self._mark_success(provider, model)
                    logger.info(
                        "llm.request.success",
                        extra={
                            "provider": provider,
                            "model": model,
                            "attempt": attempt,
                            "token_estimate": token_estimate,
                            "meta": metadata or {},
                        },
                    )
                    return response
                except Exception as exc:
                    last_error = exc
                    self._mark_failure(provider, model)
                    logger.warning(
                        "llm.request.failure",
                        extra={
                            "provider": provider,
                            "model": model,
                            "attempt": attempt,
                            "error": str(exc),
                            "meta": metadata or {},
                        },
                    )
                    if attempt < self.max_retries:
                        sleep_sec = (self.backoff_base * (2 ** (attempt - 1))) + random.uniform(0.0, 0.3)
                        time.sleep(sleep_sec)

        raise RuntimeError(f"All LLM providers failed. Last error: {last_error}")

    def _safe_float(self, value: Any, default: float = 0.0) -> float:
        try:
            return float(value)
        except Exception:
            return default

    def _clean_json_string(self, text: str) -> str:
        """Strip markdown code blocks and fix common JSON string issues."""
        text = text.strip()
        # Remove markdown code blocks
        import re
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\n", "", text)
            text = re.sub(r"\n```$", "", text)
        
        # Remove trailing commas before closing braces/brackets
        text = re.sub(r",(\s*[\]}])", r"\1", text)
        return text.strip()

    def _parse_json_object(self, response: str) -> Dict[str, Any]:
        if not response:
            return {}
        
        cleaned = self._clean_json_string(response)
        
        try:
            return json.loads(cleaned)
        except Exception:
            pass

        try:
            start = cleaned.find("{")
            end = cleaned.rfind("}") + 1
            if start != -1 and end > start:
                json_str = cleaned[start:end]
                return json.loads(json_str)
        except Exception as e:
            logger.error(f"JSON object parse fallback failed: {e}. Raw: {cleaned[:100]}...")

        logger.critical("Failed to parse JSON object from LLM response. Response length: %d", len(response))
        return {
            "global_summary": f"Neural synthesis completed but structure was invalid. Raw output preview: {response[:200]}...",
            "action_items": ["Review transcript manually", "Retry synthesis with different parameters"],
        }

    def _unwrap_object_list(self, obj: Any) -> List[Any]:
        """Coerce an object-wrapped list into a list.

        Ollama's format=json constrains output to a single JSON object, so
        models return {"items": [...]}, {"Q1": {...}, "Q2": {...}} or even a
        bare single item instead of an array. Handle all of these so every
        list-based extraction (glossary, entities, tags, quiz) keeps working.
        """
        if not isinstance(obj, dict):
            return []
        listish = next((v for v in obj.values() if isinstance(v, list)), None)
        if listish is not None:
            return listish
        dict_values = [v for v in obj.values() if isinstance(v, dict)]
        if dict_values:
            return dict_values
        return [obj] if obj else []

    def _parse_json_list(self, response: str) -> List[Any]:
        if not response:
            return []

        cleaned = self._clean_json_string(response)

        try:
            data = json.loads(cleaned)
            if isinstance(data, list):
                return data
            unwrapped = self._unwrap_object_list(data)
            if unwrapped:
                return unwrapped
        except Exception:
            pass

        try:
            start = cleaned.find("[")
            end = cleaned.rfind("]") + 1
            if start != -1 and end > start:
                data = json.loads(cleaned[start:end])
                if isinstance(data, list):
                    return data
        except Exception as e:
            logger.error(f"JSON list parse fallback failed: {e}. Raw: {cleaned[:100]}...")

        try:
            start = cleaned.find("{")
            end = cleaned.rfind("}") + 1
            if start != -1 and end > start:
                unwrapped = self._unwrap_object_list(json.loads(cleaned[start:end]))
                if unwrapped:
                    return unwrapped
        except Exception:
            pass

        return []

    def _segment_importance_score(self, seg: Dict[str, Any], idx: int, total: int) -> float:
        text = str(seg.get("text", "") or "")
        if not text:
            return 0.0
        duration = max(0.1, self._safe_float(seg.get("end"), 0.0) - self._safe_float(seg.get("start"), 0.0))
        words = max(1, len(text.split()))
        lexical_density = words / duration
        punctuation_boost = text.count("?") * 0.7 + text.count("!") * 0.5 + text.count(":") * 0.2
        novelty_boost = 0.0
        lower = text.lower()
        for cue in ["however", "but", "surprising", "unexpected", "important", "critical", "therefore", "so"]:
            if cue in lower:
                novelty_boost += 0.45
        center_weight = 1.0 - abs((idx / max(1, total - 1)) - 0.5) * 0.6
        return (0.25 * lexical_density) + punctuation_boost + novelty_boost + center_weight

    def optimize_context_segments(self, transcript_segments: List[Dict[str, Any]], keep_ratio: float = 0.7) -> List[Dict[str, Any]]:
        """Content-aware chunking + importance scoring to reduce context loss."""
        if not transcript_segments:
            return []
        keep = max(12, int(len(transcript_segments) * max(0.3, min(0.9, keep_ratio))))
        scored = []
        for i, seg in enumerate(transcript_segments):
            score = self._segment_importance_score(seg, i, len(transcript_segments))
            scored.append((score, i, seg))
        top = sorted(scored, key=lambda x: x[0], reverse=True)[:keep]
        selected = sorted(top, key=lambda x: x[1])
        return [s[2] for s in selected]

    def detect_high_value_moments(self, transcript_segments: List[Dict[str, Any]], lang: str = "en") -> List[Dict[str, Any]]:
        """Detect emotional intensity, revelation, transition and CTA moments."""
        if not transcript_segments:
            return []
        moments: List[Dict[str, Any]] = []
        cues = {
            "emotional_intensity": ["!", "amazing", "incredible", "frustrating", "urgent", "critical"],
            "revelation": ["surprising", "unexpected", "turns out", "actually", "we discovered", "revealed"],
            "transition": ["moving on", "next", "let's switch", "now", "first", "second"],
            "call_to_action": ["should", "must", "need to", "let's", "action", "do this"],
        }
        for i, seg in enumerate(transcript_segments):
            text = str(seg.get("text", "") or "").lower()
            if not text:
                continue
            scores = {}
            for m_type, words in cues.items():
                score = 0.0
                for w in words:
                    if w in text:
                        score += 1.0
                if text.count("?") and m_type in {"revelation", "transition"}:
                    score += 0.4
                scores[m_type] = score
            best_type = max(scores.keys(), key=lambda k: scores[k])
            best_score = scores[best_type]
            if best_score >= 1.0:
                moments.append(
                    {
                        "type": best_type,
                        "timestamp": self._safe_float(seg.get("start"), 0.0),
                        "reason": str(seg.get("text", ""))[:220],
                        "intensity": round(min(1.0, best_score / 3.0), 2),
                    }
                )
        moments = sorted(moments, key=lambda x: x["intensity"], reverse=True)
        # keep variety by type
        output: List[Dict[str, Any]] = []
        seen_type_count: Dict[str, int] = {}
        for m in moments:
            t = m["type"]
            if seen_type_count.get(t, 0) >= 2:
                continue
            seen_type_count[t] = seen_type_count.get(t, 0) + 1
            output.append(m)
            if len(output) >= 8:
                break
        return sorted(output, key=lambda x: x["timestamp"])

    def select_key_quotes(
        self,
        transcript_segments: List[Dict[str, Any]],
        speaker_map: Optional[Dict[str, str]] = None,
        limit: int = 6,
    ) -> List[Dict[str, Any]]:
        """Memorability-based quote selection with variety and speaker prominence."""
        if not transcript_segments:
            return []
        speaker_map = speaker_map or {}
        speaker_counts: Dict[str, int] = {}
        for seg in transcript_segments:
            spk = str(seg.get("speaker", "Unknown"))
            speaker_counts[spk] = speaker_counts.get(spk, 0) + 1

        scored = []
        for seg in transcript_segments:
            text = str(seg.get("text", "")).strip()
            if len(text) < 60:
                continue
            spk = str(seg.get("speaker", "Unknown"))
            prominence = speaker_counts.get(spk, 1) / max(1, len(transcript_segments))
            punctuation = text.count("?") * 0.5 + text.count("!") * 0.6 + text.count(":") * 0.2
            length_score = 1.0 - abs(len(text) - 180) / 220
            memorability = max(0.0, length_score) + punctuation + (1.2 * prominence)
            quote_type = "profound"
            lower = text.lower()
            if any(x in lower for x in ["should", "must", "step", "plan", "do this"]):
                quote_type = "practical"
            elif any(x in lower for x in ["funny", "laugh", "joke", "irony"]):
                quote_type = "funny"
            scored.append(
                {
                    "text": text,
                    "timestamp": self._safe_float(seg.get("start"), 0.0),
                    "speaker": speaker_map.get(spk, spk),
                    "memorability": round(memorability, 3),
                    "quote_type": quote_type,
                }
            )
        scored.sort(key=lambda x: x["memorability"], reverse=True)
        out: List[Dict[str, Any]] = []
        type_counts: Dict[str, int] = {}
        speaker_seen: Dict[str, int] = {}
        for q in scored:
            if len(out) >= limit:
                break
            if type_counts.get(q["quote_type"], 0) >= 2:
                continue
            if speaker_seen.get(q["speaker"], 0) >= 2:
                continue
            type_counts[q["quote_type"]] = type_counts.get(q["quote_type"], 0) + 1
            speaker_seen[q["speaker"]] = speaker_seen.get(q["speaker"], 0) + 1
            out.append(q)
        return sorted(out, key=lambda x: x["timestamp"])

    def _normalize_summary_data(self, data: Dict[str, Any], lang: str, transcript_segments: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not isinstance(data, dict):
            data = {}

        def ensure_list_of_strings(value: Any) -> List[str]:
            if not isinstance(value, list):
                return []
            res = []
            for v in value:
                if isinstance(v, dict):
                    t = v.get("text") or v.get("question") or v.get("insight") or v.get("title") or str(v)
                    if str(t).strip():
                        res.append(str(t).strip())
                elif str(v).strip():
                    res.append(str(v).strip())
            return res

        action_items = ensure_list_of_strings(data.get("action_items"))
        key_insights = ensure_list_of_strings(data.get("key_insights"))
        suggested_questions = ensure_list_of_strings(data.get("suggested_questions"))

        key_quotes_raw = data.get("key_quotes")
        key_quotes: List[Dict[str, Any]] = []
        if isinstance(key_quotes_raw, list):
            for q in key_quotes_raw:
                if isinstance(q, dict) and str(q.get("text", "")).strip():
                    key_quotes.append(
                        {
                            "text": str(q.get("text", "")).strip(),
                            "timestamp": self._safe_float(q.get("timestamp"), 0.0),
                        }
                    )
                elif isinstance(q, str) and q.strip():
                    key_quotes.append({"text": q.strip(), "timestamp": 0.0})

        topics_raw = data.get("topics")
        topics: List[Dict[str, Any]] = []
        if isinstance(topics_raw, list):
            for t in topics_raw:
                if isinstance(t, dict) and str(t.get("label", "")).strip():
                    topics.append({"label": str(t.get("label", "")).strip(), "value": self._safe_float(t.get("value"), 0.0)})

        insight_attr_raw = data.get("insight_attribution")
        insight_attr: List[Dict[str, Any]] = []
        if isinstance(insight_attr_raw, list):
            for i in insight_attr_raw:
                if isinstance(i, dict) and str(i.get("insight", "")).strip():
                    insight_attr.append(
                        {
                            "insight": str(i.get("insight", "")).strip(),
                            "speaker": str(i.get("speaker", "Unknown")).strip(),
                        }
                    )

        speaker_contribution = data.get("speaker_contribution")
        if not isinstance(speaker_contribution, dict):
            speaker_contribution = {}

        if not key_quotes and transcript_segments:
            key_quotes = self.select_key_quotes(transcript_segments, limit=5)

        if not action_items:
            fallback = {
                "tr": ["Özeti derinlemesine okuyun ve anahtar fikirleri not edin", "Kritik noktaları işaretleyin ve kendi bağlamınıza uyarlayın", "Öğrendiklerinizi uygulamak için bir eylem planı oluşturun"],
                "en": ["Review the summary carefully and note key ideas", "Mark critical points and relate them to your context", "Create an action plan to apply your learnings"],
                "fr": ["Examinez attentivement le résumé", "Notez les points critiques", "Créez un plan d'action"],
                "de": ["Lesen Sie die Zusammenfassung sorgfältig", "Markieren Sie kritische Punkte", "Erstellen Sie einen Aktionsplan"],
                "es": ["Revise el resumen cuidadosamente", "Marque los puntos críticos", "Cree un plan de acción"],
                "it": ["Esaminate attentamente il riassunto", "Notate i punti critici", "Create un piano d'azione"],
                "pt": ["Revise o resumo cuidadosamente", "Marque os pontos críticos", "Crie um plano de ação"],
                "ru": ["Внимательно прочитайте резюме", "Отметьте ключевые моменты", "Создайте план действий"],
            }
            action_items = fallback.get((lang or "en")[:2], fallback["en"])

        normalized = {
            "global_summary": str(data.get("global_summary", "")).strip(),
            "executive_brief": str(data.get("executive_brief", "")).strip(),
            "action_items": action_items,
            "key_insights": key_insights,
            "suggested_questions": suggested_questions,
            "key_quotes": key_quotes,
            "speaker_contribution": speaker_contribution,
            "topics": topics,
            "insight_attribution": insight_attr,
            "insight_density": str(data.get("insight_density", "")).strip() or "Medium",
            "summary_layers": data.get("summary_layers") if isinstance(data.get("summary_layers"), dict) else {},
            "persona_summaries": data.get("persona_summaries") if isinstance(data.get("persona_summaries"), dict) else {},
            "perspective_summaries": data.get("perspective_summaries") if isinstance(data.get("perspective_summaries"), dict) else {},
            "high_value_moments": data.get("high_value_moments") if isinstance(data.get("high_value_moments"), list) else [],
            "categorized_insights": data.get("categorized_insights") if isinstance(data.get("categorized_insights"), dict) else {},
            "conversation_flow": data.get("conversation_flow") if isinstance(data.get("conversation_flow"), dict) else {},
            "structured_notes": data.get("structured_notes") if isinstance(data.get("structured_notes"), list) else [],
            "action_items_structured": data.get("action_items_structured") if isinstance(data.get("action_items_structured"), list) else [],
        }

        if not normalized["global_summary"]:
            normalized["global_summary"] = normalized["executive_brief"] or "Summary unavailable."
        if not normalized["executive_brief"]:
            normalized["executive_brief"] = normalized["global_summary"][:500]
        if not normalized["summary_layers"]:
            normalized["summary_layers"] = {
                "level_1_tldr": normalized["global_summary"][:180],
                "level_2_exec": normalized["executive_brief"],
                "level_3_outline": [],
                "level_4_notes": [],
            }
        if not normalized["high_value_moments"] and transcript_segments:
            normalized["high_value_moments"] = self.detect_high_value_moments(transcript_segments, lang=lang)
        if not normalized["categorized_insights"]:
            normalized["categorized_insights"] = {
                "core_concepts": normalized["key_insights"][:5],
                "surprising_facts": [],
                "actionable_tips": normalized["action_items"][:5],
                "questions_raised": normalized["suggested_questions"][:5],
                "contradictions_discovered": [],
                "predictions_made": [],
            }
        if not normalized["action_items_structured"] and normalized["action_items"]:
            normalized["action_items_structured"] = [
                {
                    "text": item,
                    "priority": "medium",
                    "owner": "listener",
                    "timeline": "this week",
                    "explicitness": "implicit",
                }
                for item in normalized["action_items"][:8]
            ]

        return normalized

    def _ensure_summary_language(self, data: Dict[str, Any], lang: str) -> Dict[str, Any]:
        """Guarantee user-visible summary fields are in the target language.

        Small local models often ignore the language instruction when the
        transcript is in another language; one cheap translation call fixes that.
        Quotes are left verbatim on purpose.
        """
        target = (lang or "en")[:2].lower()
        if target == "en":
            return data
        probe = f" {data.get('executive_brief', '')} {str(data.get('global_summary', ''))[:400]} ".lower()
        english_markers = (" the ", " and ", " of ", " to ", " is ", " are ", " that ", " this ")
        if sum(probe.count(m) for m in english_markers) < 3:
            return data

        # Collect user-visible strings as a flat index->text map. Translating a flat
        # map (like the transcript translator does) is far more reliable with small
        # models than asking them to preserve a nested JSON structure.
        texts: List[str] = []
        setters: List[Any] = []

        def _collect(container: Any, key: Any) -> None:
            value = container[key]
            if isinstance(value, str) and value.strip():
                texts.append(value)
                setters.append((container, key))

        for field in ("executive_brief", "global_summary"):
            if isinstance(data.get(field), str):
                _collect(data, field)
        for field in ("key_insights", "action_items", "suggested_questions"):
            items = data.get(field)
            if not isinstance(items, list):
                continue
            for i, item in enumerate(items):
                if isinstance(item, str):
                    _collect(items, i)
                elif isinstance(item, dict):
                    for text_key in ("text", "why_matters"):
                        if isinstance(item.get(text_key), str) and item[text_key].strip():
                            _collect(item, text_key)

        if not texts:
            return data
        full_lang = self._get_lang_name(target)
        payload = {str(i): t for i, t in enumerate(texts)}
        try:
            response = self.chat(
                [
                    {"role": "system", "content": f"You are a strict JSON translator to {full_lang}."},
                    {
                        "role": "user",
                        "content": (
                            f"Translate every value of this JSON object to natural {full_lang}. "
                            "Return ONLY a JSON object with the same keys. No explanation.\n\n"
                            f"INPUT JSON:\n{json.dumps(payload, ensure_ascii=False)}"
                        ),
                    },
                ],
                format="json",
                metadata={"task": "translate_summary_fields"},
            )
            translated = self._parse_json_object(str(response))
            for i, (container, key) in enumerate(setters):
                new_val = translated.get(str(i))
                if isinstance(new_val, str) and new_val.strip():
                    container[key] = new_val.strip()
        except Exception as e:
            logger.warning("Summary language enforcement failed: %s", e)
        return data

    def generate_summary(self, transcript_segments: List[Dict[str, Any]], lang: str = "en", summary_type: str = "default") -> Dict[str, Any]:
        """Generate structured summary payload in the target language."""
        if not transcript_segments:
            return {
                "global_summary": "",
                "executive_brief": "",
                "action_items": [],
                "key_insights": [],
                "suggested_questions": [],
                "key_quotes": [],
                "speaker_contribution": {},
                "topics": [],
                "insight_attribution": [],
                "insight_density": "Light",
            }

        # Context optimization: importance scoring + content-aware chunking.
        optimized = self.optimize_context_segments(transcript_segments, keep_ratio=0.7)
        sampled = optimized if optimized else transcript_segments
        total_chars = sum(len(s.get("text", "")) for s in sampled)
        if total_chars > 36000:
            # Progressive summarization fallback to avoid heavy context loss.
            chunk_size = max(18, int(math.sqrt(len(sampled))) * 4)
            chunk_summaries: List[str] = []
            for i in range(0, len(sampled), chunk_size):
                chunk = sampled[i : i + chunk_size]
                text = "\n".join(
                    [f"[{self._safe_float(s.get('start')):.2f}] {s.get('speaker', 'Unknown')}: {s.get('text', '')}" for s in chunk]
                )
                chunk_prompt = (
                    f"Summarize this podcast chunk in {self._get_lang_name(lang)} in 4 concise bullet points.\n"
                    f"CRITICAL: All output MUST be in {self._get_lang_name(lang)}. Do NOT use any other language.\n"
                    "Return plain text bullets only.\n"
                    f"CHUNK:\n{text}\n"
                )
                try:
                    chunk_summaries.append(
                        str(
                            self.chat(
                                [
                                    {"role": "system", "content": f"Return plain text bullets only. OUTPUT LANGUAGE: {self._get_lang_name(lang)} ONLY."},
                                    {"role": "user", "content": chunk_prompt},
                                ],
                                metadata={"task": "progressive_chunk_summary"},
                            )
                        ).strip()
                    )
                except Exception:
                    continue
            sampled = [
                {"start": float(i), "speaker": "ChunkSummary", "text": cs}
                for i, cs in enumerate(chunk_summaries)
                if cs
            ] or sampled

        formatted_text = "\n".join(
            [f"[{self._safe_float(s.get('start')):.2f}] {s.get('speaker', 'Unknown')}: {s.get('text', '')}" for s in sampled]
        )
        full_lang = self._get_lang_name(lang)

        style_map = {
            "default": "Balanced, clear, and practical synthesis.",
            "technical": "Technical depth with architecture, mechanisms, and constraints.",
            "executive": "Decision-oriented with strategic implications and risk framing.",
            "conversational": "Friendly but precise, preserving core meaning.",
        }
        style_key = (summary_type or "default").lower()
        style_hint = style_map.get(style_key, style_map["default"])

        mode = (settings.SUMMARY_MODE or "tldr").lower()
        variant_seed = f"summary|{style_key}|{formatted_text[:200]}"
        variant = self.prompt_manager.choose_variant(variant_seed)
        prompt = self.prompt_manager.summary_prompt(
            full_lang=full_lang,
            style_hint=style_hint,
            formatted_text=formatted_text,
            summary_type=style_key,
            mode=mode,
            language=lang,
            variant=variant,
        )
        if mode == "deep":
            prompt += (
                "\nADDITIONAL REQUIRED FIELDS (all text in target language):\n"
                "high_value_moments list (max 5) with: type in [emotional_intensity, revelation, transition, call_to_action], timestamp, reason, intensity (0-1).\n"
                "categorized_insights with keys: core_concepts, surprising_facts, actionable_tips (each max 3 items).\n"
                "action_items_structured list with: text, priority(high|medium|low), owner, timeline.\n"
            )

        messages = [
            {
                "role": "system",
                "content": (
                    "You are a JSON-only summarization engine. "
                    f"CRITICAL: ALL textual content, summaries, action items, and labels MUST be written in {full_lang}. "
                    "Do NOT use any other language.\n"
                    "Return only one valid JSON object."
                ),
            },
            {"role": "user", "content": prompt},
        ]

        response = self.chat(
            messages,
            format="json",
            metadata={"prompt_version": self.prompt_manager.VERSION, "prompt_variant": variant, "task": "generate_summary"},
        )
        parsed = self._parse_json_object(response)
        parsed = self._ensure_summary_language(parsed, lang)
        return self._normalize_summary_data(parsed, lang=lang, transcript_segments=transcript_segments)

    def extract_chapters(self, transcript_segments: List[Dict[str, Any]], lang: str = "en") -> List[Dict[str, Any]]:
        sorted_segments = sorted(transcript_segments, key=lambda x: x.get("start", 0.0))
        if not sorted_segments:
            return []

        last_seg = sorted_segments[-1]
        total_duration = last_seg.get("end", last_seg.get("start", 0.0) + 5)
        chunk_size = 1800
        all_chapters: List[Dict[str, Any]] = []
        num_chunks = int(total_duration // chunk_size) + 1
        full_lang = self._get_lang_name(lang)

        for i in range(num_chunks):
            chunk_start = i * chunk_size
            chunk_end = (i + 1) * chunk_size
            chunk_segments = [s for s in sorted_segments if chunk_start <= s.get("start", 0.0) < chunk_end]
            if not chunk_segments:
                continue

            formatted_text = "\n".join([f"[{self._safe_float(s.get('start')):.2f}] {s.get('text', '')}" for s in chunk_segments])
            prompt = (
                f"Identify 2-4 major chapter transitions in this podcast slice ({chunk_start:.0f}s to {chunk_end:.0f}s).\n"
                f"All text MUST be in {full_lang}.\n\n"
                "RULES:\n"
                "- title: A natural, readable PHRASE (3-7 words). Must read like a headline, NOT a list of keywords.\n"
                "  FORBIDDEN: slashes, commas between topics, generic words like 'Introduction'/'Discussion'.\n"
                "  GOOD examples: 'Iran Diaspora World Cup Dilemma', 'Fed Rate Decision Aftermath', 'Apple Vision Pro Sales Slump'.\n"
                "  BAD examples: 'Iran / Team / Training', 'World / Cup / Diaspora'.\n"
                "- summary: 1 SHORT sentence (max 25 words) summarising what happens in this chapter.\n"
                "- timestamp: exact start time in seconds (float).\n\n"
                "Return ONLY valid JSON:\n"
                '{"chapters": [{"timestamp": 0.0, "title": "string", "summary": "string"}]}\n\n'
                f"TEXT:\n{formatted_text}\n\nJSON:"
            )

            try:
                data = self._parse_json_object(
                    self.chat(
                        [
                            {
                                "role": "system",
                                "content": f"You are a JSON-only engine. CRITICAL: All strings MUST be in {full_lang}. Do NOT use any other language. Return only valid JSON.",
                            },
                            {"role": "user", "content": prompt},
                        ],
                        format="json",
                        metadata={"task": "extract_chapters"},
                    )
                )
                for ch in data.get("chapters", []):
                    if isinstance(ch, dict) and "timestamp" in ch:
                        all_chapters.append(
                            {
                                "timestamp": self._safe_float(ch.get("timestamp"), 0.0),
                                "title": str(ch.get("title", "Untitled Chapter")).strip() or "Untitled Chapter",
                                "summary": str(ch.get("summary", "")).strip(),
                                "is_main": 1,
                            }
                        )
            except Exception:
                continue

        return all_chapters

    def identify_speakers(self, transcript_text: str) -> Dict[str, str]:
        """Map diarized labels (SPEAKER_00, ...) to real names or roles.

        Returns {label: display_name}. Falls back to readable role labels
        ("Host", "Guest 1") when a real name can't be confidently inferred,
        so the UI never shows raw SPEAKER_00 strings.
        """
        labels = sorted(set(re.findall(r"SPEAKER_\d+", transcript_text or "")))
        if not labels:
            return {}

        prompt = (
            "You are analyzing a podcast transcript whose turns are tagged with diarized speaker labels.\n"
            f"The distinct labels present are: {', '.join(labels)}.\n\n"
            "From introductions, self-references, hand-offs and how people are addressed, infer each speaker.\n"
            "Rules:\n"
            "- Use a real name ONLY when the transcript makes it reasonably clear (e.g. 'I'm Victoria Craig').\n"
            "- If a real name is unclear, use a descriptive role instead: 'Host', 'Co-host', 'Guest', 'Reporter', 'Analyst'.\n"
            "- Never invent specific names that aren't supported by the text.\n"
            "- Return EVERY label exactly once.\n\n"
            'Return ONLY JSON: {"items": [{"id": "SPEAKER_00", "name": "Victoria Craig", "role": "Host"}, ...]}.\n\n'
            f"TRANSCRIPT (excerpt):\n{(transcript_text or '')[:14000]}\n\nJSON:"
        )
        try:
            items = self._parse_json_list(
                self.chat([{"role": "user", "content": prompt}], format="json", metadata={"task": "identify_speakers"})
            )
        except Exception:
            items = []

        mapping: Dict[str, str] = {}
        for it in items:
            if not isinstance(it, dict):
                continue
            sid = str(it.get("id") or "").strip()
            if not sid or sid not in labels:
                continue
            name = str(it.get("name") or "").strip()
            role = str(it.get("role") or "").strip()
            # Prefer a concrete name; reject placeholders so they fall back to role.
            bad = {"UNKNOWN", "N/A", "", "SPEAKER", "HOST", "GUEST", "CO-HOST", "REPORTER", "ANALYST"}
            display = name if name and name.upper() not in bad else (role or name)
            if display:
                mapping[sid] = display

        # Ensure every label has a friendly fallback (1-indexed).
        for idx, label in enumerate(labels, start=1):
            mapping.setdefault(label, f"Speaker {idx}")
        return mapping

    def extract_entities(self, transcript_segments: List[Dict[str, Any]], lang: str = "en") -> List[Dict[str, Any]]:
        # Use importance-scored sampling rather than every-4th-segment, so we
        # surface the substantive parts of the conversation.
        sampled = self.optimize_context_segments(transcript_segments, keep_ratio=0.6) or transcript_segments[::3]
        formatted_text = "\n".join([s.get("text", "") for s in sampled])[:14000]

        prompt = (
            f"Extract the SPECIFIC, notable entities discussed in this transcript. Respond in {self._get_lang_name(lang)}.\n\n"
            "INCLUDE: named people, named organizations/companies, named products/technologies, "
            "named places only if they are central actors, and SPECIFIC concepts/theories/events "
            "(e.g. 'Pillar Two tax deal', 'digital services tax', 'exponential nuclear expansion').\n"
            "EXCLUDE generic or ubiquitous words that carry little meaning on their own "
            "(e.g. 'market', 'policy', 'business', 'people', 'world', 'money', 'government', "
            "and bare country names like 'US'/'China' UNLESS the discussion is specifically about that country).\n"
            "Aim for 8-15 high-signal entities. For each, give a 4-8 word descriptor of its role in THIS episode.\n\n"
            'Return ONLY a JSON object: {"items": [{"name": str, "type": "person|org|product|concept", "descriptor": str}, ...]}.\n\n'
            f"TEXT:\n{formatted_text}\n\nJSON:"
        )
        return self._parse_json_list(self.chat([{"role": "user", "content": prompt}], format="json", metadata={"task": "extract_entities"}))

    def extract_podcast_tags(self, transcript_segments: List[Dict[str, Any]], lang: str = "en") -> List[Dict[str, str]]:
        mid = len(transcript_segments) // 2
        sampled = transcript_segments[:30] + transcript_segments[mid : mid + 20]
        formatted_text = "\n".join([s.get("text", "") for s in sampled])

        prompt = (
            "Categorize this podcast with EXACTLY 3 highly relevant tags and their broader groups "
            "(example: label:'Bitcoin', group:'finance'). "
            f"Respond in {self._get_lang_name(lang)}. "
            'Return ONLY a JSON object: {"items": [{"label": str, "group": str}, {"label": str, "group": str}, {"label": str, "group": str}]}.\n\n'
            f"TEXT:\n{formatted_text}\n\nJSON:"
        )
        return self._parse_json_list(self.chat([{"role": "user", "content": prompt}], format="json", metadata={"task": "extract_podcast_tags"}))

    def generate_visual_signals(self, transcript_segments: List[Dict[str, Any]], lang: str = "en") -> Dict[str, Any]:
        sampled = transcript_segments[::10]
        formatted_text = "\n".join([f"[{self._safe_float(s.get('start')):.2f}] {s.get('text', '')}" for s in sampled])

        prompt = (
            "Identify 5 distinct topic transitions (start, end, topic, hex_color) and 12 high-intensity insight points "
            "(time, intensity 1-10) for data visualization.\n"
            "ENSURE intensity varies significantly (not all 1s/2s). Use vibrant colors like #3E5BFF, #F97316, #A855F7.\n"
            f"Respond in {self._get_lang_name(lang)}. Return JSON only: {{\"topic_transitions\": [], \"insight_points\": []}}.\n\n"
            f"TEXT:\n{formatted_text}\n\nJSON:"
        )
        return self._parse_json_object(self.chat([{"role": "user", "content": prompt}], format="json", metadata={"task": "generate_visual_signals"}))

    def generate_quiz(
        self,
        transcript_segments: List[Dict[str, Any]],
        lang: str = "en",
        count: int = 8,
        difficulty_profile: Optional[Dict[str, int]] = None,
        cognitive_targets: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        size = 40
        if not transcript_segments:
            return []

        mid = len(transcript_segments) // 2
        sampled = transcript_segments[:size] + transcript_segments[max(0, mid - size // 2) : mid + size // 2] + transcript_segments[-size:]

        formatted_text = "\n".join([f"[{self._safe_float(s.get('start')):.2f}] {s.get('text', '')}" for s in sampled])
        full_lang = self._get_lang_name(lang)

        if difficulty_profile is None:
            difficulty_profile = {"easy": 2, "medium": 4, "hard": 2}
        if cognitive_targets is None:
            cognitive_targets = ["remember", "understand", "apply", "analyze"]

        total_profile = max(1, sum(max(0, int(v)) for v in difficulty_profile.values()))
        if total_profile != count:
            # normalize profile to requested count
            scaled = {}
            running = 0
            keys = list(difficulty_profile.keys()) or ["medium"]
            for i, k in enumerate(keys):
                if i == len(keys) - 1:
                    scaled[k] = max(0, count - running)
                else:
                    val = max(0, int(round((max(0, int(difficulty_profile.get(k, 0))) / total_profile) * count)))
                    scaled[k] = val
                    running += val
            difficulty_profile = scaled

        difficulty_plan = []
        for k, v in difficulty_profile.items():
            difficulty_plan += [k] * max(0, int(v))
        if not difficulty_plan:
            difficulty_plan = ["medium"] * count

        prompt = (
            f"You are an elite educational assessment designer. Generate EXACTLY {count} highly diverse, multiple-choice quiz questions in {full_lang}.\n\n"
            "CRITICAL DIVERSITY RULES:\n"
            "1) Identify 4-6 COMPLETELY DIFFERENT core concepts/topics from the text.\n"
            "2) Base NO MORE THAN TWO questions on the same concept.\n"
            "3) FORCE structural variety: Never start more than 2 questions with the same word (e.g. do not repeat 'Which of the following...').\n"
            "4) Use a distinct 'question_type' for each: factual_recall, speaker_attribution, concept_application, causal_reasoning, compare_contrast, implication.\n"
            "5) Provide 4 unique, plausible options with exactly one correct answer.\n"
            "6) 'explanation' must include deep reasoning, not just a quote.\n"
            f"7) ALL generated text MUST be in {full_lang}.\n\n"
            f"Difficulty target: {json.dumps(difficulty_profile)}\n"
            f"Cognitive targets (Bloom's taxonomy): {', '.join(cognitive_targets)}\n\n"
            "JSON STRUCTURE — return ONE object with an 'items' array:\n"
            '{"items": [{"question": str, "options": [4 strings], "correct_answer": int (0-3), "explanation": str, "source_start": float, '
            '"difficulty": "easy|medium|hard", "cognitive_level": "remember|understand|apply|analyze|evaluate|create", "question_type": str}, ...]}\n\n'
            f"TEXT DATA:\n{formatted_text}\n\nJSON:"
        )
        quiz_messages = [
            {
                "role": "system",
                "content": f"You are a JSON-only quiz engine. CRITICAL: All questions, options, and explanations MUST be in {full_lang}. Do NOT use any other language. Return only valid JSON array.",
            },
            {"role": "user", "content": prompt},
        ]
        raw_response = self.chat(quiz_messages, format="json", metadata={"task": "generate_quiz"})
        raw = self._parse_json_list(raw_response)
        # Some models (e.g. Mistral) return an OBJECT keyed by "[Question 1]" etc.
        # instead of a JSON array. Coerce object-of-questions into a list.
        if not raw:
            obj = self._parse_json_object(raw_response)
            if isinstance(obj, dict):
                # Either {"questions":[...]} / {"quiz":[...]} or {"Q1":{...}, ...}
                listish = next((v for v in obj.values() if isinstance(v, list)), None)
                if listish:
                    raw = listish
                else:
                    raw = [v for v in obj.values() if isinstance(v, dict) and v.get("question")]

        normalized: List[Dict[str, Any]] = []
        seen_questions = set()
        for idx, item in enumerate(raw):
            if not isinstance(item, dict):
                continue
            q = str(item.get("question", "")).strip()
            options = item.get("options") if isinstance(item.get("options"), list) else []
            if not q or len(options) < 3:
                continue
            q_key = q.lower()
            if q_key in seen_questions:
                continue
            seen_questions.add(q_key)

            normalized.append(
                {
                    "question": q,
                    "options": [str(o).strip() for o in options[:4]],
                    "correct_answer": item.get("correct_answer", 0),
                    "explanation": str(item.get("explanation", "")).strip(),
                    "source_start": self._safe_float(item.get("source_start"), 0.0),
                    "source_end": self._safe_float(item.get("source_end"), 0.0),
                    "source_text": str(item.get("source_text", "")).strip(),
                    "difficulty": str(item.get("difficulty", difficulty_plan[idx % len(difficulty_plan)])).lower(),
                    "cognitive_level": str(item.get("cognitive_level", cognitive_targets[idx % len(cognitive_targets)])).lower(),
                    "question_type": str(item.get("question_type", "")).strip() or [
                        "factual_recall",
                        "speaker_attribution",
                        "concept_application",
                        "causal_reasoning",
                        "compare_contrast",
                    ][idx % 5],
                }
            )
            if len(normalized) >= count:
                break

        return normalized

    def extract_glossary(self, transcript_text: str, lang: str = "en") -> List[Dict[str, Any]]:
        text = (transcript_text or "")[:12000]
        if not text:
            return []

        full_lang = self._get_lang_name(lang)
        prompt = (
            f"Extract 8-15 important domain terms from this transcript and define them in {full_lang}.\n"
            "Return ONLY a JSON object with an 'items' array:\n"
            '{"items": [{"term": "string", "definition": "string", "context_sentence": "string"}, ...]}\n\n'
            f"TEXT:\n{text}\n\nJSON:"
        )
        return self._parse_json_list(
            self.chat(
                [
                    {"role": "system", "content": f"JSON only. All strings in {full_lang}."},
                    {"role": "user", "content": prompt},
                ],
                format="json",
                metadata={"task": "extract_glossary"},
            )
        )

    def extract_verifiable_claims(self, summary_text: str, lang: str = "en") -> List[Dict[str, Any]]:
        text = (summary_text or "").strip()[:8000]
        if not text:
            return []

        full_lang = self._get_lang_name(lang)
        prompt = (
            f"Extract up to 8 concise, fact-checkable claims from this text in {full_lang}.\n"
            "Return ONLY JSON list where each item is:\n"
            '{"claim": "string"}\n\n'
            f"TEXT:\n{text}\n\nJSON:"
        )
        claims = self._parse_json_list(
            self.chat(
                [
                    {"role": "system", "content": f"JSON only. All claims must be in {full_lang}."},
                    {"role": "user", "content": prompt},
                ],
                format="json",
                metadata={"task": "extract_verifiable_claims"},
            )
        )
        cleaned = []
        for c in claims:
            if isinstance(c, dict) and str(c.get("claim", "")).strip():
                cleaned.append({"claim": str(c.get("claim", "")).strip()})
        return cleaned[:8]

    def generate_persona_summary(self, transcript_segments: List[Dict[str, Any]], persona_key: str, lang: str = "en") -> str:
        if not transcript_segments:
            return ""

        persona_map = {
            "investor": "Focus on investment implications, upside, downside, and decision relevance.",
            "skeptic": "Stress test assumptions, highlight weak evidence, and identify risks.",
            "default": "Balanced concise summary with key insights and caveats.",
        }
        persona = (persona_key or "default").strip().lower()
        persona_hint = persona_map.get(persona, persona_map["default"])

        sample = transcript_segments[::6]
        formatted_text = "\n".join([f"[{self._safe_float(s.get('start')):.2f}] {s.get('text', '')}" for s in sample])
        full_lang = self._get_lang_name(lang)

        prompt = (
            f"Write a persona-focused summary in {full_lang}.\n"
            f"Persona objective: {persona_hint}\n"
            "Length: 1 short paragraph.\n"
            f"TRANSCRIPT:\n{formatted_text}\n"
        )
        try:
            return str(
                self.chat(
                    [
                        {"role": "system", "content": f"Return plain text only in {full_lang}."},
                        {"role": "user", "content": prompt},
                    ],
                    metadata={"task": "generate_persona_summary", "persona": persona},
                )
            ).strip()
        except Exception:
            return ""

    def translate_segments(self, segments: List[Dict[str, Any]], target_lang: str) -> List[Dict[str, Any]]:
        if not target_lang or target_lang.lower() == "en" or not segments:
            return segments

        translated: List[Dict[str, Any]] = []
        chunk_size = 20
        full_lang = self._get_lang_name(target_lang)

        for i in range(0, len(segments), chunk_size):
            chunk = segments[i : i + chunk_size]
            text = "\n".join([f"S_{j}: {s.get('text', '')}" for j, s in enumerate(chunk)])

            prompt = (
                f"Translate each line into {full_lang}.\n"
                "Rules:\n"
                "1) Preserve the number of lines and order.\n"
                "2) Keep names, numbers and technical terms accurate.\n"
                "3) Return ONLY JSON object with key `translations`.\n"
                "4) `translations` must be an array with the same length as input lines.\n\n"
                'JSON FORMAT: {"translations": ["..."]}\n\n'
                f"TEXT:\n{text}\n\nJSON:"
            )

            try:
                res = self._parse_json_object(
                    self.chat(
                        [
                            {"role": "system", "content": f"You are a strict translation engine. Output only {full_lang} JSON."},
                            {"role": "user", "content": prompt},
                        ],
                        format="json",
                        metadata={"task": "translate_segments"},
                    )
                )
                t_list = res.get("translations", []) if isinstance(res, dict) else []
                if not isinstance(t_list, list) or len(t_list) != len(chunk):
                    raise ValueError("translation count mismatch")

                for j, s in enumerate(chunk):
                    s_new = s.copy()
                    translated_text = str(t_list[j]).strip()
                    s_new["text"] = translated_text or s.get("text", "")
                    translated.append(s_new)
            except Exception:
                translated.extend([s.copy() for s in chunk])

        return translated

    def generate_hypothetical_document(self, query: str, lang: str = "en") -> str:
        if not query.strip():
            return ""
        full_lang = self._get_lang_name(lang)
        prompt = (
            f"Write a compact hypothetical answer paragraph in {full_lang} that would likely answer this user query.\n"
            "Use neutral, factual style and include likely terminology.\n"
            f"QUERY: {query}\n"
        )
        try:
            return str(
                self.chat(
                    [
                        {"role": "system", "content": "Return plain text only."},
                        {"role": "user", "content": prompt},
                    ],
                    metadata={"task": "hyde_generation"},
                )
            ).strip()
        except Exception:
            return ""

    def refine_query(self, original_query: str, snippets: List[str], lang: str = "en") -> str:
        if not original_query.strip():
            return original_query
        ctx = "\n".join([f"- {s[:240]}" for s in snippets[:6]])
        prompt = (
            f"Rewrite the query to improve semantic retrieval in {self._get_lang_name(lang)}.\n"
            "Constraints: keep intent unchanged, max 18 words, include specific entities/terms when possible.\n"
            f"ORIGINAL: {original_query}\n"
            f"SNIPPETS:\n{ctx}\n"
            "Return only the rewritten query line."
        )
        try:
            refined = str(
                self.chat(
                    [
                        {"role": "system", "content": "Return plain text only."},
                        {"role": "user", "content": prompt},
                    ],
                    metadata={"task": "query_refinement"},
                )
            ).strip()
            return refined or original_query
        except Exception:
            return original_query

    def propose_multi_hop_queries(self, query: str, snippets: List[str], lang: str = "en") -> List[str]:
        if not query.strip():
            return []
        ctx = "\n".join([f"- {s[:220]}" for s in snippets[:6]])
        prompt = (
            f"Given the user query and context, propose up to 3 follow-up retrieval queries in {self._get_lang_name(lang)} "
            "for multi-hop reasoning (related entities, causes, implications).\n"
            "Return JSON array of strings, no extra text.\n"
            f"QUERY: {query}\n"
            f"CONTEXT:\n{ctx}\n"
        )
        try:
            data = self._parse_json_list(
                self.chat(
                    [
                        {"role": "system", "content": "Return JSON array only."},
                        {"role": "user", "content": prompt},
                    ],
                    format="json",
                    metadata={"task": "multi_hop_query_generation"},
                )
            )
            queries = [str(x).strip() for x in data if str(x).strip()]
            unique: List[str] = []
            seen = set()
            for q in queries:
                k = q.lower()
                if k in seen:
                    continue
                seen.add(k)
                unique.append(q)
            return unique[:3]
        except Exception:
            return []
