"""Advanced Chat Service with context-awareness, compression, and citation quality."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import re

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.podcast import (
    ChatConversation,
    ChatExchange,
    ChatMessage,
    Entity,
    EntityRelation,
    Episode,
    EpisodeEntity,
    Transcript,
)
from app.services.embeddings import EmbeddingService
from app.services.llm_client import LLMClient
from app.services.vector_store import VectorStore


class ChatService:
    """Intelligent context-aware chat service."""

    CHAT_MODES: Dict[str, Dict[str, Any]] = {
        "assistant": {
            "description": "Direct answers & insights",
            "system_prompt": "You are PodAI, an intelligent podcast analysis assistant. Provide clear direct answers grounded in sources.",
            "response_style": "direct",
            "use_rag": True,
        },
        "socratic": {
            "description": "Learn through questioning",
            "system_prompt": "You are a Socratic guide. Ask sharp questions that help the user discover insights.",
            "response_style": "questions",
            "use_rag": True,
        },
        "devil_advocate": {
            "description": "Challenge assumptions",
            "system_prompt": "You respectfully challenge claims, highlight weak assumptions, and provide counterpoints.",
            "response_style": "argumentative",
            "use_rag": True,
        },
        "researcher": {
            "description": "Deep investigation with citations",
            "system_prompt": "You are a thorough researcher. Provide evidence-first answers with citations and explicit uncertainty.",
            "response_style": "research_paper",
            "use_rag": True,
            "include_citations": True,
        },
        "debate": {
            "description": "Argue both sides",
            "system_prompt": "You present strongest pro and con arguments, then provide a balanced synthesis.",
            "response_style": "balanced_debate",
            "use_rag": True,
            "include_citations": True,
        },
        "storyteller": {
            "description": "Narrative focused explanation",
            "system_prompt": "You explain as a narrative arc: context, conflict, turning points, takeaway.",
            "response_style": "narrative",
            "use_rag": True,
        },
        "teacher": {
            "description": "Step-by-step explanation",
            "system_prompt": "You teach step-by-step, from basics to advanced, checking assumptions and sequencing clearly.",
            "response_style": "step_by_step",
            "use_rag": True,
        },
        "fact_checker": {
            "description": "Citation-heavy verification",
            "system_prompt": "You verify claims against transcript evidence, mark confidence, and separate facts from interpretation.",
            "response_style": "verification",
            "use_rag": True,
            "include_citations": True,
        },
        "casual": {
            "description": "Conversational informal",
            "system_prompt": "You answer in a warm, casual tone while staying accurate and grounded in sources.",
            "response_style": "casual",
            "use_rag": True,
        },
    }

    def __init__(self, db: Session):
        self.db = db
        self.llm = LLMClient()
        self.embeddings = EmbeddingService()
        self.vector_store = VectorStore()

    def get_or_create_conversation(self, user_id: str, episode_id: int, mode: str = "assistant") -> ChatConversation:
        conv = (
            self.db.query(ChatConversation)
            .filter(
                ChatConversation.user_id == user_id,
                ChatConversation.episode_id == episode_id,
                ChatConversation.mode == mode,
            )
            .first()
        )
        if conv:
            return conv

        conv = ChatConversation(user_id=user_id, episode_id=episode_id, mode=mode, topic=None)
        self.db.add(conv)
        self.db.commit()
        self.db.refresh(conv)
        return conv

    def _build_system_prompt(
        self,
        mode: str,
        episode: Episode,
        lang: str = "en",
        selected_text: Optional[str] = None,
        conversation_history: str = "",
        compressed_context: str = "",
    ) -> str:
        lang_map = {
            "tr": "TURKISH",
            "en": "ENGLISH",
            "fr": "FRENCH",
            "de": "GERMAN",
            "es": "SPANISH",
            "it": "ITALIAN",
            "pt": "PORTUGUESE",
            "ru": "RUSSIAN",
            "zh": "CHINESE",
            "ja": "JAPANESE",
            "ko": "KOREAN",
        }
        full_lang = lang_map.get(lang.lower(), lang.upper())
        mode_cfg = self.CHAT_MODES.get(mode, self.CHAT_MODES["assistant"])

        prompt = f"""You are PodAI, a sophisticated podcast analyst.
MODE: {mode} ({mode_cfg.get('description', '')})
MODE INSTRUCTION: {mode_cfg.get('system_prompt', '')}

CRITICAL: YOUR ENTIRE RESPONSE MUST BE IN {full_lang}.

EPISODE CONTEXT:
- Title: {episode.title}
- Show: {episode.show_name}

INSTRUCTIONS:
1. Base your knowledge ONLY on provided transcript evidence.
2. Cite evidence using [MM:SS] where relevant.
3. If evidence is weak or missing, say so explicitly.
4. Keep answers coherent and avoid hallucination.
5. Include brief confidence notes when making uncertain claims.
"""
        if selected_text:
            prompt += f"\nCURRENT FOCUS:\n{selected_text}\n"
        if compressed_context:
            prompt += f"\nCOMPRESSED CONTEXT SUMMARY:\n{compressed_context}\n"
        if conversation_history:
            prompt += f"\nRECENT TURN HISTORY:\n{conversation_history}\n"

        return prompt

    @staticmethod
    def _token_set(text: str) -> set:
        return set(re.findall(r"\b\w+\b", text.lower()))

    @staticmethod
    def _jaccard(a: set, b: set) -> float:
        if not a or not b:
            return 0.0
        return len(a & b) / len(a | b)

    def _get_rag_context(
        self,
        query: str,
        episode_id: int,
        user_id: str,
        limit: int = 10,
        use_graph: bool = True,
    ) -> List[Dict[str, Any]]:
        # 1. Expand Episode Scope (Graph)
        if use_graph:
            episode_ids, entity_weights = self._graph_expand_episode_ids(query, user_id, episode_id)
        else:
            episode_ids, entity_weights = [episode_id], {}

        # 2. Optimized Hybrid Search (Dense + Keyword RRF)
        q_vec = self.embeddings.embed_text(query)
        # We pass query as both vector and text for the new RRF Hybrid search
        hits = self.vector_store.search(
            episode_ids=episode_ids, 
            query_vector=q_vec, 
            query_text=query, 
            limit=limit * 2
        )

        # 3. Rerank
        reranked = self.embeddings.rerank(query, hits, top_k=limit * 2)
        for item in reranked:
            text = (item.get("text") or "").lower()
            graph_score = 0.0
            for name, weight in entity_weights.items():
                if name in text:
                    graph_score += weight
            item["graph_score"] = graph_score

        final_context = sorted(
            reranked,
            key=lambda x: float(x.get("rerank_score", 0.0)) + 0.2 * float(x.get("lexical_overlap", 0.0)) + 0.3 * float(x.get("graph_score", 0.0)),
            reverse=True,
        )[:limit]

        # 4. Context Expansion (Padding 30s Window)
        deduped = []
        seen_texts = set()
        
        from app.db.session import SessionLocal
        
        with SessionLocal() as db:
            for item in final_context:
                ep_id = item.get("episode_id")
                timestamp = item.get("timestamp", 0)
                
                # Fetch full transcript to expand the context window
                transcript = db.query(Transcript).filter(Transcript.episode_id == ep_id).first()
                expanded_text = item.get("text", "")
                
                if transcript and transcript.raw_json and "segments" in transcript.raw_json:
                    segments = transcript.raw_json["segments"]
                    # Find segments within a 30-second window (15s before and 15s after)
                    window_start = max(0, timestamp - 15)
                    window_end = timestamp + 15
                    
                    window_texts = []
                    for seg in segments:
                        seg_start = seg.get("start", 0)
                        seg_end = seg.get("end", 0)
                        if seg_end >= window_start and seg_start <= window_end:
                            speaker = seg.get("speaker", "")
                            prefix = f"{speaker}: " if speaker else ""
                            window_texts.append(f"{prefix}{seg.get('text', '')}")
                    
                    if window_texts:
                        expanded_text = " ".join(window_texts)
                
                if expanded_text not in seen_texts:
                    seen_texts.add(expanded_text)
                    item["text"] = expanded_text  # Overwrite with expanded context
                    deduped.append(item)

        return deduped

    def get_rag_context_for_eval(
        self,
        query: str,
        episode_id: int,
        user_id: str,
        use_graph: bool = True,
        limit: int = 8,
    ) -> List[Dict[str, Any]]:
        return self._get_rag_context(query, episode_id, user_id, limit=limit, use_graph=use_graph)

    def _graph_expand_episode_ids(self, query: str, user_id: str, episode_id: int) -> tuple[List[int], Dict[str, float]]:
        tokens = [t for t in re.findall(r"\b\w+\b", query.lower()) if len(t) >= 3]
        if not tokens:
            return [episode_id], {}

        entities = self.db.query(Entity).filter(or_(*[Entity.name.ilike(f"%{t}%") for t in tokens])).limit(8).all()
        if not entities:
            return [episode_id], {}

        entity_ids = [e.id for e in entities]
        entity_names = {e.id: (e.name or "").lower() for e in entities}

        linked = (
            self.db.query(EpisodeEntity.episode_id)
            .join(Episode, Episode.id == EpisodeEntity.episode_id)
            .filter(Episode.user_id == user_id, EpisodeEntity.entity_id.in_(entity_ids))
            .distinct()
            .all()
        )
        episode_ids = [eid for (eid,) in linked]

        related = (
            self.db.query(EntityRelation.target_entity_id)
            .filter(EntityRelation.source_entity_id.in_(entity_ids))
            .distinct()
            .limit(10)
            .all()
        )
        related_ids = [eid for (eid,) in related]
        if related_ids:
            extra = (
                self.db.query(EpisodeEntity.episode_id)
                .join(Episode, Episode.id == EpisodeEntity.episode_id)
                .filter(Episode.user_id == user_id, EpisodeEntity.entity_id.in_(related_ids))
                .distinct()
                .all()
            )
            episode_ids += [eid for (eid,) in extra]

        episode_ids = list(dict.fromkeys([episode_id] + episode_ids))[:10]

        rows = (
            self.db.query(EpisodeEntity.entity_id, EpisodeEntity.mention_count)
            .join(Episode, Episode.id == EpisodeEntity.episode_id)
            .filter(Episode.user_id == user_id, EpisodeEntity.entity_id.in_(entity_ids))
            .all()
        )
        max_count = max([1] + [int(cnt or 0) for _, cnt in rows])
        weights: Dict[str, float] = {}
        for ent_id, cnt in rows:
            name = entity_names.get(ent_id)
            if not name:
                continue
            weights[name] = max(weights.get(name, 0.0), float(cnt or 0) / max_count)

        return episode_ids, weights

    def _compress_dialogue(self, old_messages: List[ChatMessage], lang: str) -> str:
        if not old_messages:
            return ""
        raw = "\n".join([f"User: {m.user_message}\nAssistant: {m.ai_response}" for m in old_messages])
        prompt = (
            f"Summarize this conversation history in {lang} for future context retention.\n"
            "Keep: user intent trajectory, decisions, unresolved questions, constraints, and cited evidence references.\n"
            "Return <= 10 bullet points.\n\n"
            f"HISTORY:\n{raw}\n"
        )
        try:
            return str(
                self.llm.chat(
                    [
                        {"role": "system", "content": "Return concise bullet list only."},
                        {"role": "user", "content": prompt},
                    ],
                    metadata={"task": "chat_context_compression"},
                )
            ).strip()
        except Exception:
            return ""

    def _compress_memory(self, memory_hits: List[Dict[str, Any]], lang: str) -> str:
        if not memory_hits:
            return ""
        raw = "\n".join([f"User: {m.get('user_message','')}\nAI: {m.get('ai_response','')}" for m in memory_hits])
        prompt = (
            f"Compress these past relevant conversations in {lang}.\n"
            "Keep only transferable lessons, facts, and recurring user preferences.\n"
            "Return <= 8 bullets.\n\n"
            f"MEMORY:\n{raw}\n"
        )
        try:
            return str(
                self.llm.chat(
                    [
                        {"role": "system", "content": "Return concise bullet list only."},
                        {"role": "user", "content": prompt},
                    ],
                    metadata={"task": "memory_context_compression"},
                )
            ).strip()
        except Exception:
            return ""

    def _verify_and_rank_sources(self, episode_id: int, rag_hits: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        transcript = self.db.query(Transcript).filter(Transcript.episode_id == episode_id).first()
        segments = []
        if transcript and isinstance(transcript.raw_json, dict):
            segments = transcript.raw_json.get("segments", []) or []

        enriched: List[Dict[str, Any]] = []
        for idx, hit in enumerate(rag_hits):
            hit_text = str(hit.get("text", "") or "").strip()
            hit_ts = float(hit.get("timestamp", 0.0) or 0.0)

            best_seg = None
            best_score = 0.0
            hit_tokens = self._token_set(hit_text)
            for seg in segments:
                seg_text = str(seg.get("text", "") or "").strip()
                if not seg_text:
                    continue
                seg_tokens = self._token_set(seg_text)
                overlap = len(hit_tokens & seg_tokens) / max(1, len(hit_tokens))
                ts_diff = abs(float(seg.get("start", 0.0) or 0.0) - hit_ts)
                ts_bonus = max(0.0, 1.0 - (ts_diff / 25.0))
                score = 0.75 * overlap + 0.25 * ts_bonus
                if score > best_score:
                    best_score = score
                    best_seg = seg

            speaker = None
            quote_start = hit_ts
            quote_end = float(hit.get("end_timestamp") or hit_ts)
            quote_text = hit_text
            if best_seg is not None:
                speaker = best_seg.get("speaker")
                quote_start = float(best_seg.get("start", quote_start) or quote_start)
                quote_end = float(best_seg.get("end", quote_end) or quote_end)
                quote_text = str(best_seg.get("text", quote_text) or quote_text)

            confidence = round(min(1.0, max(0.0, best_score)), 2)
            credibility = round(
                min(
                    1.0,
                    0.55 * confidence
                    + 0.25 * min(1.0, float(hit.get("rerank_score", 0.0) or 0.0))
                    + 0.20 * min(1.0, float(hit.get("lexical_overlap", 0.0) or 0.0)),
                ),
                2,
            )

            enriched.append(
                {
                    "rank": idx + 1,
                    "timestamp": hit_ts,
                    "text": hit_text,
                    "speaker": speaker,
                    "quote_start": quote_start,
                    "quote_end": quote_end,
                    "quote_text": quote_text,
                    "confidence": confidence,
                    "credibility": credibility,
                    "rerank_score": float(hit.get("rerank_score", 0.0) or 0.0),
                }
            )

        enriched.sort(key=lambda x: (x["credibility"], x["confidence"]), reverse=True)
        for i, s in enumerate(enriched):
            s["rank"] = i + 1
        return enriched

    @staticmethod
    def _is_high_value_insight(text: str) -> bool:
        keywords = ["suggests", "reveals", "shows", "proves", "demonstrates", "critical", "key", "important"]
        return any(kw in text.lower() for kw in keywords)

    def _extract_actions(self, user_message: str, ai_response: str, rag_context: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        actions: List[Dict[str, Any]] = []
        ts_matches = re.findall(r"\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\]", ai_response)

        seen_ts = set()
        extracted_ts = []
        for ts_tuple in ts_matches:
            if ts_tuple[0]:
                hours, minutes, seconds = int(ts_tuple[0]), int(ts_tuple[1]), int(ts_tuple[2])
                total_seconds = hours * 3600 + minutes * 60 + seconds
                label = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
            else:
                minutes, seconds = int(ts_tuple[1]), int(ts_tuple[2])
                total_seconds = minutes * 60 + seconds
                label = f"{minutes:02d}:{seconds:02d}"
            if total_seconds in seen_ts:
                continue
            seen_ts.add(total_seconds)
            extracted_ts.append({"seconds": total_seconds, "label": label})

        extracted_ts.sort(key=lambda x: x["seconds"])
        for item in extracted_ts[:4]:
            actions.append({"type": "seek", "label": f"Go to {item['label']}", "metadata": {"timestamp": item["seconds"]}})

        if self._is_high_value_insight(ai_response):
            actions.append({"type": "save_insight", "label": "Save This Insight", "metadata": {"text": ai_response[:150]}})

        if ai_response.count("?") >= 2:
            actions.append({"type": "search", "label": "Search Related", "metadata": {"query": user_message}})

        return actions

    def _build_reasoning_trace(
        self,
        message: str,
        mode: str,
        sources: List[Dict[str, Any]],
        compressed_history: str,
        memory_context: str,
    ) -> List[Dict[str, Any]]:
        """User-visible explanation trace (not hidden chain-of-thought)."""
        trace: List[Dict[str, Any]] = []

        trace.append(
            {
                "step": "intent_understanding",
                "summary": f"Interpreted user intent for mode '{mode}'.",
                "confidence": 0.8,
            }
        )

        top_sources = sources[:3]
        evidence_items = []
        for s in top_sources:
            evidence_items.append(
                {
                    "timestamp": s.get("timestamp"),
                    "speaker": s.get("speaker"),
                    "confidence": s.get("confidence", 0.0),
                    "credibility": s.get("credibility", 0.0),
                    "snippet": str(s.get("quote_text") or s.get("text") or "")[:160],
                }
            )
        trace.append(
            {
                "step": "evidence_selection",
                "summary": f"Selected {len(evidence_items)} highest-ranked transcript sources.",
                "evidence": evidence_items,
                "confidence": round(sum(float(x.get("confidence", 0.0)) for x in top_sources) / max(1, len(top_sources)), 2),
            }
        )

        context_quality = "strong" if len(top_sources) >= 2 else "limited"
        trace.append(
            {
                "step": "context_integration",
                "summary": "Integrated recent turns, compressed older dialogue, and memory hints.",
                "history_used": bool(compressed_history.strip()),
                "memory_used": bool(memory_context.strip()),
                "context_quality": context_quality,
            }
        )

        uncertainties = []
        if not top_sources:
            uncertainties.append("No strong transcript evidence found for this query.")
        else:
            weak = [s for s in top_sources if float(s.get("confidence", 0.0)) < 0.45]
            if weak:
                uncertainties.append("Some cited evidence has low confidence.")
        trace.append(
            {
                "step": "limitations",
                "summary": "Reported uncertainty based on evidence quality.",
                "uncertainties": uncertainties,
            }
        )

        return trace

    def semantic_search_chats(self, user_id: str, query: str, top_k: int = 8) -> List[Dict[str, Any]]:
        query_vec = self.embeddings.embed_text(query)
        return self.vector_store.search_chat_exchanges(user_id=user_id, query_vector=query_vec, limit=top_k)

    def process_message(
        self,
        user_id: str,
        episode_id: int,
        message: str,
        mode: str = "assistant",
        context_snapshot: Optional[Dict[str, Any]] = None,
        conversation_id: Optional[int] = None,
        lang: Optional[str] = None,
    ) -> Dict[str, Any]:
        episode = self.db.get(Episode, episode_id)
        if not episode:
            raise ValueError("Episode not found")

        conv = self.get_or_create_conversation(user_id, episode_id, mode)

        # 1) Cross-episode memory retrieval + compression
        past_exchanges = self.semantic_search_chats(user_id, message, top_k=8)
        target_lang = lang or episode.preferred_lang or "en"
        memory_context = self._compress_memory(past_exchanges, target_lang) if past_exchanges else ""

        # 2) Local conversation history with compression for long threads
        prev_messages = (
            self.db.query(ChatMessage)
            .filter(ChatMessage.conversation_id == conv.id)
            .order_by(ChatMessage.created_at.desc())
            .limit(40)
            .all()
        )
        prev_messages.reverse()
        recent_turns = prev_messages[-6:]
        old_turns = prev_messages[:-6]
        compressed_history = self._compress_dialogue(old_turns, target_lang) if old_turns else ""
        history = "\n".join([f"Human: {m.user_message}\nAssistant: {m.ai_response}" for m in recent_turns])

        # 3) RAG context (hybrid) + citation verification
        q_vec = self.embeddings.embed_text(message)
        # Keep chat grounded to the active episode; cross-episode expansion was causing topic drift.
        rag_hits = self._get_rag_context(message, episode_id, user_id, limit=10, use_graph=False)
        sources = self._verify_and_rank_sources(episode_id, rag_hits)
        context_text = "\n".join(
            [
                f"[{int(s['timestamp']//60):02d}:{int(s['timestamp']%60):02d}]"
                f" speaker={s.get('speaker') or 'Unknown'}"
                f" conf={s.get('confidence', 0):.2f} cred={s.get('credibility', 0):.2f}"
                f" :: {s.get('quote_text') or s.get('text','')}"
                for s in sources[:8]
            ]
        )

        # 4) Prompt build
        selected = context_snapshot.get("selectedText") if isinstance(context_snapshot, dict) else None
        system_prompt = self._build_system_prompt(
            mode,
            episode,
            target_lang,
            selected,
            conversation_history=history,
            compressed_context=(compressed_history + "\n" + memory_context).strip(),
        )

        top_cred = max([float(s.get("credibility", 0.0) or 0.0) for s in sources[:3]] + [0.0])
        thin_context = not context_text or top_cred < 0.35
        grounding_note = (
            "CITATION FORMAT: cite with [MM:SS], mention the speaker when known, and prefer the transcript context above."
            if not thin_context else
            "The transcript context above is thin or low-confidence. Still give a genuinely helpful answer: "
            "use the episode title/topic and your general understanding, and note briefly when something isn't "
            "directly grounded in the transcript. Cite [MM:SS] only when the context actually supports it."
        )
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "system", "content": f"LOCAL VERIFIED RAG CONTEXT:\n{context_text}" if context_text else "No specific transcript context found."},
            {"role": "system", "content": grounding_note},
        ]

        native_reminders = {"tr": "Lütfen sadece Türkçe cevap ver.", "en": "Please respond only in English."}
        final_msg = f"{message}\n\n(Important: {native_reminders.get(target_lang[:2], 'Respond in ' + target_lang)})"
        messages.append({"role": "user", "content": final_msg})

        # Only refuse when there is literally nothing to work with; otherwise let
        # the model answer (best-effort) so chat stays useful under local embeddings.
        response = self.llm.chat(messages, metadata={"task": "chat_response", "mode": mode})
        actions = self._extract_actions(message, response, rag_hits)
        reasoning_trace = self._build_reasoning_trace(
            message=message,
            mode=mode,
            sources=sources,
            compressed_history=compressed_history,
            memory_context=memory_context,
        )

        self.vector_store.upsert_chat_exchange(user_id, episode_id, message, response, q_vec)

        chat_msg = ChatMessage(
            conversation_id=conv.id,
            user_id=user_id,
            episode_id=episode_id,
            user_message=message,
            ai_response=response,
            actions_generated=actions,
            insights_extracted=reasoning_trace,
            context_snapshot=context_snapshot,
            created_at=datetime.now(),
        )
        self.db.add(chat_msg)
        self.db.commit()

        return {
            "response": response,
            "actions": actions,
            "sources": sources,
            "reasoning_trace": reasoning_trace,
            "conversation_id": conv.id,
            "mode": mode,
        }

    def process_message_stream(
        self,
        user_id: str,
        episode_id: int,
        message: str,
        mode: str = "assistant",
        context_snapshot: Optional[Dict[str, Any]] = None,
        lang: Optional[str] = None,
    ):
        """Stream chat response token-by-token. Yields text deltas."""
        episode = self.db.get(Episode, episode_id)
        if not episode:
            raise ValueError("Episode not found")

        conv = self.get_or_create_conversation(user_id, episode_id, mode)

        # Prepare context (same as process_message)
        past_exchanges = self.semantic_search_chats(user_id, message, top_k=8)
        target_lang = lang or episode.preferred_lang or "en"
        memory_context = self._compress_memory(past_exchanges, target_lang) if past_exchanges else ""

        prev_messages = (
            self.db.query(ChatMessage)
            .filter(ChatMessage.conversation_id == conv.id)
            .order_by(ChatMessage.created_at.desc())
            .limit(40)
            .all()
        )
        prev_messages.reverse()
        recent_turns = prev_messages[-6:]
        old_turns = prev_messages[:-6]
        compressed_history = self._compress_dialogue(old_turns, target_lang) if old_turns else ""
        history = "\n".join([f"Human: {m.user_message}\nAssistant: {m.ai_response}" for m in recent_turns])

        # RAG context
        rag_hits = self._get_rag_context(message, episode_id, user_id, limit=10, use_graph=False)
        sources = self._verify_and_rank_sources(episode_id, rag_hits)
        context_text = "\n".join(
            [
                f"[{int(s['timestamp']//60):02d}:{int(s['timestamp']%60):02d}]"
                f" speaker={s.get('speaker') or 'Unknown'}"
                f" conf={s.get('confidence', 0):.2f} cred={s.get('credibility', 0):.2f}"
                f" :: {s.get('quote_text') or s.get('text','')}"
                for s in sources[:8]
            ]
        )

        # Build prompt
        selected = context_snapshot.get("selectedText") if isinstance(context_snapshot, dict) else None
        system_prompt = self._build_system_prompt(
            mode,
            episode,
            target_lang,
            selected,
            conversation_history=history,
            compressed_context=(compressed_history + "\n" + memory_context).strip(),
        )

        top_cred = max([float(s.get("credibility", 0.0) or 0.0) for s in sources[:3]] + [0.0])
        thin_context = not context_text or top_cred < 0.35
        grounding_note = (
            "CITATION FORMAT: cite with [MM:SS], mention the speaker when known, and prefer the transcript context above."
            if not thin_context else
            "The transcript context above is thin or low-confidence. Still give a genuinely helpful answer: "
            "use the episode title/topic and your general understanding, and note briefly when something isn't "
            "directly grounded in the transcript. Cite [MM:SS] only when the context actually supports it."
        )
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "system", "content": f"LOCAL VERIFIED RAG CONTEXT:\n{context_text}" if context_text else "No specific transcript context found."},
            {"role": "system", "content": grounding_note},
        ]

        native_reminders = {"tr": "Lütfen sadece Türkçe cevap ver.", "en": "Please respond only in English."}
        final_msg = f"{message}\n\n(Important: {native_reminders.get(target_lang[:2], 'Respond in ' + target_lang)})"
        messages.append({"role": "user", "content": final_msg})

        # Yield sources metadata first so the frontend can display citations
        if sources:
            yield {
                "_sources": [
                    {
                        "timestamp": s["timestamp"],
                        "text": (s.get("quote_text") or s.get("text", ""))[:200],
                        "speaker": s.get("speaker"),
                    }
                    for s in sources[:5]
                ]
            }

        # Stream the response (best-effort; never hard-refuse when some context exists)
        full_response = ""
        for chunk in self.llm.chat(messages, stream=True, metadata={"task": "chat_response", "mode": mode}):
            if chunk:
                full_response += chunk
                yield chunk

        # Save to DB after streaming completes
        q_vec = self.embeddings.embed_text(message)
        self.vector_store.upsert_chat_exchange(user_id, episode_id, message, full_response, q_vec)

        chat_msg = ChatMessage(
            conversation_id=conv.id,
            user_id=user_id,
            episode_id=episode_id,
            user_message=message,
            ai_response=full_response,
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(chat_msg)
        self.db.commit()

    def process_library_stream(self, user_id: str, message: str, lang: Optional[str] = None):
        """Chat across the user's ENTIRE library. Yields dict events:
        {"type":"sources","data":[...]} once, then {"type":"delta","text":...}.
        """
        episodes = (
            self.db.query(Episode)
            .filter(Episode.user_id == user_id, Episode.status == "completed")
            .all()
        )
        if not episodes:
            yield {"type": "delta", "text": "Your library is empty — process a podcast first, then ask me anything across all of them."}
            return

        ep_title = {e.id: e.title for e in episodes}
        episode_ids = list(ep_title.keys())
        target_lang = lang or "en"

        # Hybrid search across all episodes
        q_vec = self.embeddings.embed_text(message)
        hits = self.vector_store.search(episode_ids=episode_ids, query_vector=q_vec, query_text=message, limit=16)
        reranked = self.embeddings.rerank(message, hits, top_k=10) if hits else []

        # Build sources + context (best snippet per episode, keep variety)
        sources, seen_eps = [], set()
        for h in reranked:
            eid = h.get("episode_id")
            ts = float(h.get("timestamp", 0) or 0)
            key = (eid, round(ts / 30))
            if key in seen_eps:
                continue
            seen_eps.add(key)
            sources.append({
                "episode_id": eid,
                "episode_title": ep_title.get(eid, "Episode"),
                "timestamp": ts,
                "text": (h.get("text") or "")[:240],
            })
            if len(sources) >= 6:
                break

        yield {"type": "sources", "data": sources}

        context_text = "\n".join(
            f"[{s['episode_title']} @ {int(s['timestamp']//60):02d}:{int(s['timestamp']%60):02d}] {s['text']}"
            for s in sources
        )

        system = (
            f"You are the user's personal podcast librarian. Answer in {self._lang_name(target_lang)}. "
            "You have access to excerpts retrieved from across their entire podcast library (below). "
            "Synthesize across episodes when relevant, and CITE sources inline as [Episode title @ MM:SS]. "
            "If the excerpts don't cover the question, say so briefly and answer from general understanding."
        )
        messages = [
            {"role": "system", "content": system},
            {"role": "system", "content": f"LIBRARY EXCERPTS:\n{context_text}" if context_text else "No excerpts found."},
            {"role": "user", "content": message},
        ]

        full = ""
        for chunk in self.llm.chat(messages, stream=True, metadata={"task": "library_chat"}):
            if chunk:
                full += chunk
                yield {"type": "delta", "text": chunk}

        # Persist as a chat exchange (episode_id=0 sentinel for library-wide)
        try:
            self.vector_store.upsert_chat_exchange(user_id, 0, message, full, q_vec)
        except Exception:
            pass

    def _lang_name(self, code: str) -> str:
        return {
            "en": "English", "tr": "Turkish", "fr": "French", "es": "Spanish", "de": "German",
            "it": "Italian", "pt": "Portuguese", "ru": "Russian", "zh": "Chinese", "ja": "Japanese", "ko": "Korean",
        }.get((code or "en")[:2], "English")

    def get_conversation_history(self, user_id: str, episode_id: int, mode: str = "assistant", limit: int = 50) -> List[Dict[str, Any]]:
        conv = (
            self.db.query(ChatConversation)
            .filter(
                ChatConversation.user_id == user_id,
                ChatConversation.episode_id == episode_id,
                ChatConversation.mode == mode,
            )
            .first()
        )
        if not conv:
            return []

        rows = (
            self.db.query(ChatMessage)
            .filter(ChatMessage.conversation_id == conv.id)
            .order_by(ChatMessage.created_at.desc())
            .limit(limit)
            .all()
        )
        rows.reverse()

        return [
            {
                "id": m.id,
                "user_message": m.user_message,
                "ai_response": m.ai_response,
                "actions": m.actions_generated or [],
                "timestamp_in_episode": m.timestamp_in_episode,
                "thumbs_rating": m.thumbs_rating,
                "relevance_rating": m.relevance_rating,
                "citation_feedback": m.citation_feedback,
                "reasoning_trace": m.insights_extracted or [],
                "created_at": m.created_at,
            }
            for m in rows
        ]

    def submit_feedback(
        self,
        user_id: str,
        episode_id: int,
        message_id: int,
        thumbs_rating: Optional[int] = None,
        relevance_rating: Optional[int] = None,
        citation_helpful: Optional[bool] = None,
        citation_notes: Optional[str] = None,
        feedback_text: Optional[str] = None,
    ) -> Dict[str, Any]:
        msg = (
            self.db.query(ChatMessage)
            .filter(ChatMessage.id == message_id, ChatMessage.user_id == user_id, ChatMessage.episode_id == episode_id)
            .first()
        )
        if not msg:
            raise ValueError("Chat message not found")

        if thumbs_rating is not None:
            msg.thumbs_rating = max(-1, min(1, int(thumbs_rating)))
        if relevance_rating is not None:
            msg.relevance_rating = max(1, min(5, int(relevance_rating)))
        if citation_helpful is not None or citation_notes is not None:
            msg.citation_feedback = {
                "helpful": bool(citation_helpful) if citation_helpful is not None else None,
                "notes": citation_notes,
            }
        if feedback_text is not None:
            msg.feedback_text = str(feedback_text)

        self.db.add(msg)
        self.db.commit()
        return {"status": "ok", "message_id": msg.id}

    def rate_conversation(self, user_id: str, episode_id: int, conversation_id: int, rating: int) -> Dict[str, Any]:
        conv = (
            self.db.query(ChatConversation)
            .filter(
                ChatConversation.id == conversation_id,
                ChatConversation.user_id == user_id,
                ChatConversation.episode_id == episode_id,
            )
            .first()
        )
        if not conv:
            raise ValueError("Conversation not found")

        conv.rating = max(1, min(5, int(rating)))
        self.db.add(conv)
        self.db.commit()
        return {"status": "ok", "conversation_id": conv.id, "rating": conv.rating}

    def get_smart_suggestions(self, user_id: str, episode_id: int) -> List[Dict[str, str]]:
        from app.models.podcast import Summary

        episode = self.db.get(Episode, episode_id)
        if not episode:
            return []

        summary = self.db.query(Summary).filter(Summary.episode_id == episode_id).first()
        if summary:
            brief = summary.executive_brief or ""
            items = summary.action_items or []
            context = f"Summary: {brief}\nTopics: {', '.join(items[:3])}"
        else:
            context = f"Episode: {episode.title}"

        prompt = (
            "Based on this podcast context, suggest 3 concise, high-value questions a user could ask.\n"
            f"Context: {context}\n"
            'Respond in JSON list: ["Question 1?", "Question 2?", "Question 3?"]'
        )
        questions: List[Any] = []
        try:
            res = self.llm.chat([{"role": "user", "content": prompt}], format="json", metadata={"task": "chat_suggestions"})
            questions = self.llm._parse_json_list(res)
            # Some models return {"questions": [...]} or {"Q1": "..."} instead of a list.
            if not questions:
                obj = self.llm._parse_json_object(res)
                if isinstance(obj, dict):
                    listish = next((v for v in obj.values() if isinstance(v, list)), None)
                    questions = listish if listish else [v for v in obj.values() if isinstance(v, str)]
        except Exception:
            questions = []

        def _wrap(qs: List[Any]) -> List[Dict[str, str]]:
            out = []
            for q in qs:
                t = str(q).strip()
                if t:
                    out.append({"text": t, "context": "", "icon": "sparkles"})
            return out[:4]

        cleaned = _wrap(questions or [])
        if cleaned:
            return cleaned

        # Fallback: pre-generated questions from the summary, else sensible defaults.
        if summary and getattr(summary, "suggested_questions", None):
            sq = _wrap(summary.suggested_questions)
            if sq:
                return sq
        return _wrap([
            "What are the key takeaways from this episode?",
            "What were the most important points discussed?",
            "Can you summarize the main arguments?",
        ])

    def find_related_conversations(self, user_id: str, episode_id: int, top_k: int = 3) -> List[Dict[str, Any]]:
        episode = self.db.get(Episode, episode_id)
        if not episode:
            return []

        other_convs = (
            self.db.query(ChatConversation)
            .filter(ChatConversation.user_id == user_id, ChatConversation.episode_id != episode_id)
            .order_by(ChatConversation.updated_at.desc())
            .limit(top_k)
            .all()
        )

        return [
            {
                "id": conv.id,
                "topic": conv.topic,
                "episode_id": conv.episode_id,
                "episode_title": conv.episode.title if conv.episode else "Unknown",
                "updated_at": conv.updated_at.isoformat(),
                "rating": conv.rating,
            }
            for conv in other_convs
        ]
