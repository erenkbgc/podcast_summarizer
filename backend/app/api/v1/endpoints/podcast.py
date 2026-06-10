from fastapi import APIRouter, Depends, HTTPException, Header, Request
from fastapi.responses import StreamingResponse
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session, joinedload
import json
from app.api.v1.deps import get_db, get_current_user
from app.core.cache import cache_get_json, cache_set_json, episode_cache_key, invalidate_episode_cache
from app.core.config import settings
from app.core.rate_limit import limiter
from app.core.security import decode_token
from app.models.podcast import Episode, Transcript, User, Podcast, Glossary
from app.schemas.podcast import (
    PodcastIngest, EpisodeRead, EpisodeLibraryRead, JobStatus, ChatRequest, SearchResult, 
    GlossaryRead, ActivityMessage, SummaryRead, ChapterRead, QuizRead,
    ChatResponse, ChatSuggestion, ChatConversationRead, ChatMessageRead,
    PodcastTagsUpdate, ChatFeedbackWrite, ConversationRatingWrite
)
from app.services.source_resolver import SourceResolver
from app.services.embeddings import EmbeddingService
from app.services.vector_store import VectorStore
from app.services.chat import ChatService
from app.worker.tasks import process_podcast
from typing import Dict, Any, List, Optional

router = APIRouter()

# Re-defining this for compatibility or replacing usages
def get_current_user_id(current_user: User = Depends(get_current_user)) -> str:
    return current_user.id

@router.get("/", response_model=List[EpisodeLibraryRead])
async def list_episodes(db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    episodes = (
        db.query(Episode)
        .options(joinedload(Episode.podcast))
        .filter(Episode.user_id == user_id)
        .order_by(Episode.created_at.desc())
        .all()
    )
    return episodes

@router.get("/{episode_id}/audio")
async def get_episode_audio(
    episode_id: int,
    user_id: str | None = None,
    token: str | None = None,
    x_user_id: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    from fastapi.responses import FileResponse
    from jose import JWTError
    import os

    # Security Fix: audio streaming MUST be authenticated via JWT
    if not token:
        # Check query param as secondary if header not available (browser audio tags)
        # But we MUST verify it regardless
        pass
    
    if token:
        try:
            payload = decode_token(token, expected_type="access")
            resolved_user_id = payload.get("sub")
        except JWTError:
            raise HTTPException(status_code=401, detail="Invalid token")
    else:
        raise HTTPException(status_code=401, detail="Authentication required")

    if not resolved_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
        
    episode = db.query(Episode).filter(Episode.id == episode_id, Episode.user_id == resolved_user_id).first()
    if not episode or not episode.local_path or not os.path.exists(episode.local_path):
        raise HTTPException(status_code=404, detail="Audio file not found on disk")
    
    return FileResponse(
        episode.local_path, 
        media_type="audio/mpeg",
        filename=f"{episode.title}.mp3"
    )

@router.post("/ingest", response_model=EpisodeRead)
@limiter.limit(settings.RATE_LIMIT_INGEST)
async def ingest_podcast(
    request: Request,
    payload: PodcastIngest, 
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    _ = request
    # Resolve user
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        user = User(id=user_id)
        db.add(user)
        db.commit()
        db.refresh(user)

    # 1. Resolve source
    audio_url, metadata = SourceResolver.resolve(payload.url)
    if not audio_url:
        raise HTTPException(
            status_code=400,
            detail=(
                "Couldn't locate this episode's audio in public podcast directories. "
                "It may be Spotify-exclusive or very new. Try the episode's Apple Podcasts "
                "link or the show's RSS feed instead."
            ),
        )

    # Compute a stable source key (use resolved audio_url if available)
    def _normalize_url(url: str) -> str:
        from urllib.parse import urlsplit, urlunsplit
        parts = urlsplit(url)
        return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path, "", ""))

    import hashlib
    key_source = audio_url or payload.url
    source_guid = metadata.get("source_guid") if metadata else None
    source_key = hashlib.sha256((source_guid or _normalize_url(key_source)).encode("utf-8")).hexdigest()

    # Idempotency per user
    existing = db.query(Episode).filter(Episode.user_id == user_id, Episode.source_key == source_key).first()
    if existing:
        return existing

    # 2. Create DB entry
    # Ensure Podcast row exists
    show_title = metadata.get("show", "Unknown Show")
    image_url = metadata.get("image_url")
    podcast = db.query(Podcast).filter(Podcast.title == show_title).first()
    if not podcast:
        podcast = Podcast(title=show_title, image_url=image_url)
        db.add(podcast)
        db.commit()
        db.refresh(podcast)

    episode = Episode(
        user_id=user_id,
        podcast_id=podcast.id if podcast else None,
        title=metadata.get("title", "Unknown Episode"),
        show_name=show_title,
        image_url=image_url,
        source_url=payload.url,
        source_guid=source_guid,
        source_key=source_key,
        preferred_lang=payload.preferred_lang,
        summary_type=payload.summary_type,
        status="pending"
    )
    db.add(episode)
    db.commit()
    db.refresh(episode)

    # 3. Dispatch to Celery with explicit queue routing
    process_podcast.apply_async(
        args=(episode.id, audio_url, payload.preferred_lang, payload.summary_type),
        queue='low',
        routing_key='low'
    )

    return episode

@router.get("/status/{episode_id}", response_model=JobStatus)
async def get_status(episode_id: int, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    episode = db.query(Episode).filter(Episode.id == episode_id, Episode.user_id == user_id).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    
    return {
        "job_id": episode.id,
        "status": episode.status,
        "progress": episode.progress
    }

@router.get("/{episode_id}", response_model=EpisodeRead)
async def get_episode(episode_id: int, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    """Get episode details."""
    episode = db.query(Episode).filter(Episode.id == episode_id, Episode.user_id == user_id).first()
    
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    
    return episode

@router.patch("/podcasts/{podcast_id}/tags", response_model=EpisodeRead | None)
async def update_podcast_tags(
    podcast_id: int,
    payload: PodcastTagsUpdate,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    from app.models.podcast import Podcast
    # Ensure at least one episode of this podcast belongs to user
    owned = db.query(Episode).filter(Episode.user_id == user_id, Episode.podcast_id == podcast_id).first()
    if not owned:
        raise HTTPException(status_code=404, detail="Podcast not found")

    podcast = db.query(Podcast).filter(Podcast.id == podcast_id).first()
    if not podcast:
        raise HTTPException(status_code=404, detail="Podcast not found")

    tags = payload.tags or []
    podcast.tags = [t.dict() for t in tags[:4]]
    db.add(podcast)
    db.commit()
    db.refresh(podcast)
    return owned

@router.get("/{episode_id}/transcript")
async def get_transcript(episode_id: int, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)) -> Dict[str, Any]:
    """Get the transcript for a specific episode."""
    cache_key = episode_cache_key(user_id, episode_id, "transcript")
    cached = cache_get_json(cache_key)
    # Ignore stale empty transcript cache entries from earlier processing phases.
    if isinstance(cached, dict) and cached.get("segments"):
        return cached

    transcript = db.query(Transcript).join(Episode, Transcript.episode_id == Episode.id).filter(Transcript.episode_id == episode_id, Episode.user_id == user_id).first()
    
    if not transcript:
        # Return empty structure if not found (might be processing)
        return {
            "episode_id": episode_id,
            "language": "en",
            "segments": [],
            "full_text": ""
        }

    payload = {
        "episode_id": transcript.episode_id,
        "language": transcript.raw_json.get("language", "en"),
        "segments": transcript.raw_json.get("segments", []),
        "full_text": transcript.full_text
    }
    # Avoid caching placeholder/empty transcript responses.
    if payload["segments"]:
        cache_set_json(cache_key, payload, ttl_sec=settings.CACHE_EPISODE_TTL_SEC)
    return payload

@router.get("/{episode_id}/summary", response_model=SummaryRead | None)
async def get_summary(episode_id: int, persona: str | None = None, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    persona_key = (persona or "default").strip().lower()
    cache_key = episode_cache_key(user_id, episode_id, f"summary:{persona_key}")
    cached = cache_get_json(cache_key)
    if cached is not None:
        return cached

    from app.models.podcast import Summary
    from app.models.podcast import Transcript
    summary = db.query(Summary).join(Episode, Summary.episode_id == Episode.id).filter(Summary.episode_id == episode_id, Episode.user_id == user_id).first()
    if not summary:
        # Return null instead of 404
        return None
    transcript_cached = None

    def _get_transcript():
        nonlocal transcript_cached
        if transcript_cached is None:
            transcript_cached = (
                db.query(Transcript)
                .join(Episode, Transcript.episode_id == Episode.id)
                .filter(Transcript.episode_id == episode_id, Episode.user_id == user_id)
                .first()
            )
        return transcript_cached

    # Backfill deterministic analytics if missing
    def _is_empty(val):
        if val is None:
            return True
        if isinstance(val, list) and len(val) == 0:
            return True
        if isinstance(val, dict) and len(val) == 0:
            return True
        return False

    needs_backfill = any(
        _is_empty(getattr(summary, field))
        for field in ["timeline_density", "word_cloud_data", "insight_timeline", "topic_transitions", "speaker_contribution"]
    )
    if needs_backfill:
        transcript = _get_transcript()
        if transcript and transcript.raw_json and transcript.raw_json.get("segments"):
            segments = transcript.raw_json.get("segments", [])

            # A. Timeline Density (Word count per 60s bucket)
            timeline_density = []
            if segments:
                duration = segments[-1]["end"]
                buckets = 20
                bucket_size = duration / buckets if duration else 1
                timeline = [{"time": i * bucket_size, "value": 0} for i in range(buckets)]
                max_val = 0
                for seg in segments:
                    mid_point = (seg["start"] + seg["end"]) / 2
                    bucket_idx = min(int(mid_point / bucket_size), buckets - 1)
                    word_count = len(seg["text"].split())
                    timeline[bucket_idx]["value"] += word_count
                    max_val = max(max_val, timeline[bucket_idx]["value"])
                if max_val > 0:
                    for t in timeline:
                        t["value"] = round(t["value"] / max_val, 2)
                timeline_density = timeline

            # B. Word Cloud (Frequency Analysis)
            from collections import Counter
            import re
            text = (transcript.full_text or "").lower()
            stop_words = set([
                "the", "and", "to", "of", "a", "in", "is", "that", "for", "it", "with", "on", "as", "are", "at", "be",
                "this", "was", "have", "from", "or", "but", "by", "not", "what", "all", "were", "we", "when", "your",
                "can", "said", "there", "use", "an", "each", "which", "she", "do", "how", "their", "if", "will", "up",
                "other", "about", "out", "many", "then", "them", "these", "so", "some", "her", "would", "make", "like",
                "him", "into", "time", "has", "look", "two", "more", "write", "go", "see", "number", "no", "way",
                "could", "people", "my", "than", "first", "been", "call", "who", "its", "now", "find", "yeah", "right",
                "know", "think", "just", "get", "going", "actually", "okay", "um", "uh", "sort", "kind", "mean", "really"
            ])
            if not text:
                # Fallback to concatenated segments if full_text missing
                text = " ".join([seg.get("text", "") for seg in segments]).lower()

            words = re.findall(r'\\b[a-z]{3,}\\b', text)
            filtered_words = [w for w in words if w not in stop_words]
            common = Counter(filtered_words).most_common(40)
            if common:
                max_freq = common[0][1]
                word_cloud_data = [{"text": w, "value": int(10 + (count / max_freq) * 90)} for w, count in common]
            else:
                word_cloud_data = []

            # C. Speaker Contribution (Duration based)
            speaker_stats = {}
            total_dur = 0
            for seg in segments:
                dur = seg["end"] - seg["start"]
                spk = seg.get("speaker", "Unknown")
                speaker_stats[spk] = speaker_stats.get(spk, 0) + dur
                total_dur += dur
            speaker_contribution = {}
            if total_dur > 0:
                percentages = {spk: (dur / total_dur) * 100 for spk, dur in speaker_stats.items()}
                rounded = {spk: round(pct) for spk, pct in percentages.items()}
                diff = 100 - sum(rounded.values())
                if diff != 0 and rounded:
                    max_speaker = max(rounded.keys(), key=lambda k: percentages[k])
                    rounded[max_speaker] += diff
                speaker_contribution = rounded

            # D. Insight Timeline
            insight_keywords = {'important', 'key', 'crucial', 'significant', 'note', 'interesting', 'however', 'therefore', 'because', 'essentially', 'basically', 'actually', 'fundamentally'}
            insight_timeline = []
            if segments:
                duration = segments[-1]["end"]
                buckets = 20
                bucket_size = duration / buckets if duration else 1
                for i in range(buckets):
                    bucket_start = i * bucket_size
                    bucket_end = (i + 1) * bucket_size
                    insight_count = 0
                    for seg in segments:
                        if bucket_start <= seg["start"] < bucket_end:
                            seg_text = seg["text"].lower()
                            insight_count += seg_text.count('?')
                            insight_count += sum(1 for word in insight_keywords if word in seg_text)
                    insight_timeline.append({"time": bucket_start, "insight_count": insight_count})

            # E. Topic Transitions (4 segments)
            topic_transitions = []
            if segments and len(segments) > 10:
                duration = segments[-1]["end"]
                num_segments = 4
                segment_size = duration / num_segments if duration else 1
                topic_colors = ["#3E5BFF", "#FF3E5B", "#5BFF3E", "#FF5B3E", "#5B3EFF"]
                for i in range(num_segments):
                    start_time = i * segment_size
                    end_time = (i + 1) * segment_size
                    segment_text = " ".join([
                        seg["text"] for seg in segments
                        if start_time <= seg["start"] < end_time
                    ])
                    words = re.findall(r'\\b[a-z]{4,}\\b', segment_text.lower())
                    filtered = [w for w in words if w not in stop_words]
                    if filtered:
                        top_words = Counter(filtered).most_common(3)
                        topic_label = " / ".join([w[0].capitalize() for w in top_words])
                    else:
                        topic_label = f"Segment {i+1}"
                    topic_transitions.append({
                        "start": start_time,
                        "end": end_time,
                        "topic": topic_label,
                        "color": topic_colors[i % len(topic_colors)]
                    })

            if _is_empty(summary.timeline_density) and timeline_density:
                summary.timeline_density = timeline_density
            if _is_empty(summary.word_cloud_data) and word_cloud_data:
                summary.word_cloud_data = word_cloud_data
            if _is_empty(summary.speaker_contribution):
                # Hide speaker distribution if diarization missing (all Unknown)
                if not (len(speaker_contribution) == 1 and "Unknown" in speaker_contribution):
                    summary.speaker_contribution = speaker_contribution
            if _is_empty(summary.insight_timeline) and insight_timeline:
                # Only set if there is some signal
                if any(p.get("insight_count", 0) > 0 for p in insight_timeline):
                    summary.insight_timeline = insight_timeline
            if _is_empty(summary.topic_transitions) and topic_transitions:
                summary.topic_transitions = topic_transitions

            # F. Topics fallback (if LLM returned None)
            if _is_empty(summary.topics):
                if topic_transitions:
                    pct = round(100 / len(topic_transitions))
                    topics = [{"label": t["topic"], "value": pct} for t in topic_transitions]
                    # Adjust to sum exactly 100
                    if topics:
                        diff = 100 - sum(t["value"] for t in topics)
                        topics[0]["value"] += diff
                    summary.topics = topics
                elif word_cloud_data:
                    top = word_cloud_data[:4]
                    pct = round(100 / len(top)) if top else 0
                    topics = [{"label": t["text"].capitalize(), "value": pct} for t in top]
                    if topics:
                        diff = 100 - sum(t["value"] for t in topics)
                        topics[0]["value"] += diff
                    summary.topics = topics
            db.commit()
    # Ensure list fields are not None to satisfy response model
            if summary.action_items is None:
                summary.action_items = []
            if summary.key_takeaways is None:
                summary.key_takeaways = []
            if summary.suggested_questions is None:
                summary.suggested_questions = []
            if summary.key_quotes is None:
                summary.key_quotes = []
    if summary.claim_checks is None:
        summary.claim_checks = []
    if summary.persona_summaries is None:
        summary.persona_summaries = {}

    # Defensive normalization to avoid response validation errors
    def _ensure_list(val):
        return val if isinstance(val, list) else []

    def _ensure_dict(val):
        return val if isinstance(val, dict) else {}

    def _normalize_complex_list(val, expected_keys):
        """Standardizes LLM output that might be list of lists or items."""
        if not val: return []
        if isinstance(val, dict): return [val]
        if not isinstance(val, list): return []
        
        # Check if it's a list of items [["key", val], ...] representing a SINGLE dict
        if all(isinstance(i, list) and len(i) == 2 and isinstance(i[0], str) for i in val):
            keys = [i[0] for i in val]
            if any(k in expected_keys for k in keys):
                # It's a single dict flattened. Wrap it.
                return [dict(val)]
        
        normalized = []
        for item in val:
            if isinstance(item, dict):
                normalized.append(item)
            elif isinstance(item, list) and len(item) == 2:
                # Handle [time, value/label] pairs
                k, v = item
                if "time" in expected_keys:
                    # Convert labels like "High intensity" to numbers if needed
                    val_num = v
                    if isinstance(v, str):
                        m = {"high": 8, "mod": 5, "low": 2}
                        lvl = v.lower()
                        val_num = next((val for key, val in m.items() if key in lvl), 5)
                    normalized.append({"time": k, "insight_count": val_num, "value": val_num})
        return normalized

    def _normalize_speaker_contribution(val):
        if not isinstance(val, dict):
            return {}
        cleaned = {}
        for k, v in val.items():
            try:
                cleaned[k] = float(v)
            except Exception:
                continue
        return cleaned

    summary.action_items = _ensure_list(summary.action_items)
    summary.key_takeaways = _ensure_list(summary.key_takeaways)
    summary.suggested_questions = _ensure_list(summary.suggested_questions)
    summary.key_quotes = _ensure_list(summary.key_quotes)
    summary.topics = _ensure_list(summary.topics)
    summary.insight_attribution = _ensure_list(summary.insight_attribution)
    summary.timeline_density = _ensure_list(summary.timeline_density)
    summary.word_cloud_data = _ensure_list(summary.word_cloud_data)
    
    # Filter common pollutants from wordcloud
    if summary.word_cloud_data:
        forbidden = {
            "unknown", "speaker", "think", "just", "know", "really", "actually", "yeah", "like",
            "you", "they", "them", "their", "this", "that", "those", "these", "one", "also",
            "had", "our", "with", "would", "about", "could", "from", "their", "there", "then",
            "thanks", "michael", "mark", "news", "week", "year", "why", "seeing", "been"
        }
        summary.word_cloud_data = [
            item for item in summary.word_cloud_data 
            if isinstance(item, dict) and str(item.get("text", "")).lower() not in forbidden
        ]
    summary.insight_timeline = _normalize_complex_list(summary.insight_timeline, ["time", "insight_count", "value"])
    summary.topic_transitions = _normalize_complex_list(summary.topic_transitions, ["start", "end", "topic"])
    summary.speaker_contribution = _normalize_speaker_contribution(summary.speaker_contribution)

    # Only expose insights that have transcript evidence anchors.
    if summary.insight_attribution:
        filtered_attr = []
        for item in summary.insight_attribution:
            if not isinstance(item, dict):
                continue
            insight = str(item.get("insight", "")).strip()
            evidence_text = str(item.get("evidence_text", "")).strip()
            start = item.get("start")
            end = item.get("end")
            if not insight or not evidence_text:
                continue
            try:
                start = float(start)
                end = float(end)
            except Exception:
                continue
            item["start"] = start
            item["end"] = end
            filtered_attr.append(item)
        summary.insight_attribution = filtered_attr
        if filtered_attr:
            summary.key_takeaways = [str(i.get("insight", "")).strip() for i in filtered_attr if str(i.get("insight", "")).strip()]

    # Backfill missing timestamps on key quotes
    try:
        transcript = _get_transcript()
        segments = transcript.raw_json.get("segments", []) if transcript and transcript.raw_json else []
        if segments and isinstance(summary.key_quotes, list):
            seg_pairs = [((s.get("text", "") or "").lower(), s.get("start", 0.0)) for s in segments]
            updated = []
            for q in summary.key_quotes:
                if not isinstance(q, dict):
                    continue
                ts = q.get("timestamp")
                if ts is None or (isinstance(ts, (int, float)) and ts <= 0):
                    quote_text = str(q.get("text", "")).lower()
                    best_ts = None
                    if quote_text:
                        # Exact/substring match first
                        for seg_text, seg_start in seg_pairs:
                            if quote_text in seg_text or seg_text in quote_text:
                                best_ts = seg_start
                                break
                        # Fallback: simple token overlap
                        if best_ts is None:
                            quote_tokens = set(quote_text.split())
                            best_score = 0
                            for seg_text, seg_start in seg_pairs:
                                seg_tokens = set(seg_text.split())
                                overlap = len(quote_tokens & seg_tokens)
                                if overlap > best_score:
                                    best_score = overlap
                                    best_ts = seg_start
                    q["timestamp"] = float(best_ts or 0.0)
                updated.append(q)
            summary.key_quotes = updated
    except Exception:
        pass

    # Persona lens on demand (cached in summary.persona_summaries)
    if persona:
        if summary.persona_summaries is None:
            summary.persona_summaries = {}
        if persona_key not in summary.persona_summaries:
            transcript = _get_transcript()
            if transcript and transcript.raw_json and transcript.raw_json.get("segments"):
                from app.services.llm_client import LLMClient
                llm = LLMClient()
                persona_text = llm.generate_persona_summary(transcript.raw_json.get("segments", []), persona_key)
                summary.persona_summaries[persona_key] = persona_text
                db.add(summary)
                db.commit()
        summary.persona_summary = summary.persona_summaries.get(persona_key)

    encoded = jsonable_encoder(summary)
    cache_set_json(cache_key, encoded, ttl_sec=settings.CACHE_EPISODE_TTL_SEC)
    return encoded

@router.get("/{episode_id}/chapters", response_model=List[ChapterRead])
async def get_chapters(episode_id: int, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    cache_key = episode_cache_key(user_id, episode_id, "chapters")
    cached = cache_get_json(cache_key)
    # Ignore stale empty chapter cache entries from earlier processing phases.
    if isinstance(cached, list) and len(cached) > 0:
        return cached

    from app.models.podcast import Chapter
    chapters = db.query(Chapter).join(Episode, Chapter.episode_id == Episode.id).filter(Chapter.episode_id == episode_id, Episode.user_id == user_id).order_by(Chapter.timestamp.asc()).all()
    encoded = jsonable_encoder(chapters)
    # Avoid freezing early empty responses in cache while processing is ongoing.
    if encoded:
        cache_set_json(cache_key, encoded, ttl_sec=settings.CACHE_EPISODE_TTL_SEC)
    return encoded

@router.get("/{episode_id}/glossary", response_model=List[GlossaryRead])
async def get_glossary(episode_id: int, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    cache_key = episode_cache_key(user_id, episode_id, "glossary")
    cached = cache_get_json(cache_key)
    if cached is not None:
        return cached

    from app.models.podcast import Glossary
    glossary = db.query(Glossary).join(Episode, Glossary.episode_id == Episode.id).filter(Glossary.episode_id == episode_id, Episode.user_id == user_id).all()
    encoded = jsonable_encoder(glossary)
    cache_set_json(cache_key, encoded, ttl_sec=settings.CACHE_EPISODE_TTL_SEC)
    return encoded

@router.get("/{episode_id}/quiz", response_model=List[QuizRead])
async def get_quiz(episode_id: int, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    cache_key = episode_cache_key(user_id, episode_id, "quiz")
    cached = cache_get_json(cache_key)
    # Ignore stale empty quiz cache entries from earlier processing phases.
    if isinstance(cached, list) and len(cached) > 0:
        return cached

    from app.models.podcast import Quiz
    quiz = db.query(Quiz).join(Episode, Quiz.episode_id == Episode.id).filter(Quiz.episode_id == episode_id, Episode.user_id == user_id).all()
    encoded = jsonable_encoder(quiz)
    # Avoid freezing early empty responses in cache while processing is ongoing.
    if encoded:
        cache_set_json(cache_key, encoded, ttl_sec=settings.CACHE_EPISODE_TTL_SEC)
    return encoded

@router.post("/{episode_id}/chat/stream")
@limiter.limit(settings.RATE_LIMIT_CHAT)
async def chat_with_podcast_stream(
    request: Request,
    episode_id: int,
    payload: ChatRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    """Stream chat responses token-by-token via SSE"""
    episode = db.query(Episode).filter(Episode.id == episode_id, Episode.user_id == user_id).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    transcript = db.query(Transcript).filter(Transcript.episode_id == episode_id).first()
    if not transcript:
        raise HTTPException(
            status_code=409,
            detail=f"Episode not yet processed. Status: {episode.status} ({episode.progress:.0f}%)"
        )

    async def event_generator():
        try:
            chat_service = ChatService(db)
            for chunk in chat_service.process_message_stream(
                user_id=user_id,
                episode_id=episode_id,
                message=payload.message,
                mode=payload.mode,
                context_snapshot=payload.context_snapshot,
                lang=payload.lang
            ):
                yield f"data: {json.dumps({'delta': chunk})}\n\n"
            yield "data: [DONE]\n\n"
        except ValueError as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        except Exception as e:
            print(f"Stream error: {str(e)}")
            yield f"data: {json.dumps({'error': 'Chat streaming failed'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"}
    )


@router.post("/{episode_id}/chat", response_model=ChatResponse)
@limiter.limit(settings.RATE_LIMIT_CHAT)
async def chat_with_podcast(
    request: Request,
    episode_id: int,
    payload: ChatRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    """Advanced chat with context-awareness and multiple modes"""
    try:
        chat_service = ChatService(db)
        result = chat_service.process_message(
            user_id=user_id,
            episode_id=episode_id,
            message=payload.message,
            mode=payload.mode,
            context_snapshot=payload.context_snapshot,
            lang=payload.lang
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        print(f"Chat error: {str(e)}")
        raise HTTPException(status_code=500, detail="Chat processing failed")


@router.get("/{episode_id}/chat/suggestions", response_model=List[ChatSuggestion])
async def get_chat_suggestions(
    episode_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    """Get context-aware chat suggestions for an episode"""
    episode = db.query(Episode).filter(Episode.id == episode_id, Episode.user_id == user_id).first()
    if not episode or episode.status != "completed":
        return []

    try:
        chat_service = ChatService(db)
        suggestions = chat_service.get_smart_suggestions(user_id, episode_id)
        return suggestions
    except Exception as e:
        return []


@router.get("/{episode_id}/chat/history", response_model=List[ChatMessageRead])
async def get_chat_history(
    episode_id: int,
    mode: str = "assistant",
    limit: int = 50,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    """Get chat conversation history for an episode"""
    try:
        chat_service = ChatService(db)
        history = chat_service.get_conversation_history(
            user_id=user_id,
            episode_id=episode_id,
            mode=mode,
            limit=limit
        )
        return history
    except Exception as e:
        print(f"History error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve chat history")


@router.post("/{episode_id}/chat/feedback")
async def submit_chat_feedback(
    episode_id: int,
    payload: ChatFeedbackWrite,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    try:
        chat_service = ChatService(db)
        return chat_service.submit_feedback(
            user_id=user_id,
            episode_id=episode_id,
            message_id=payload.message_id,
            thumbs_rating=payload.thumbs_rating,
            relevance_rating=payload.relevance_rating,
            citation_helpful=payload.citation_helpful,
            citation_notes=payload.citation_notes,
            feedback_text=payload.feedback_text,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to save feedback")


@router.post("/{episode_id}/chat/rate")
async def rate_chat_conversation(
    episode_id: int,
    payload: ConversationRatingWrite,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    try:
        chat_service = ChatService(db)
        return chat_service.rate_conversation(
            user_id=user_id,
            episode_id=episode_id,
            conversation_id=payload.conversation_id,
            rating=payload.rating,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to rate conversation")


@router.get("/{episode_id}/chat/related", response_model=List[Dict[str, Any]])
async def get_related_conversations(
    episode_id: int,
    top_k: int = 3,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    """Get related conversations from other episodes"""
    episode = db.query(Episode).filter(Episode.id == episode_id, Episode.user_id == user_id).first()
    if not episode or episode.status != "completed":
        return []

    try:
        chat_service = ChatService(db)
        related = chat_service.find_related_conversations(user_id, episode_id, top_k)
        return related
    except Exception:
        return []

@router.delete("/{episode_id}")
async def delete_episode(episode_id: int, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    """Delete an episode and ALL associated data including vectors, files, and chat history."""
    from app.models.podcast import (
        Summary, Chapter, Glossary, Quiz, EpisodeEntity, EntityRelation,
        ChatConversation, ChatMessage, ChatExchange, QuizAttempt
    )
    
    episode = db.query(Episode).filter(Episode.id == episode_id, Episode.user_id == user_id).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    
    # 1. Delete file from disk
    import os
    from pathlib import Path
    
    if episode.local_path:
        try:
            # Try 1: Direct path
            path_obj = Path(episode.local_path)
            
            # Try 2: Relative to CWD (backend/)
            if not path_obj.exists():
                path_obj = Path(os.getcwd()) / episode.local_path
                
            # Try 3: Relative to project root (one level up if in backend)
            if not path_obj.exists():
                 path_obj = Path(os.getcwd()).parent / episode.local_path

            if path_obj.exists():
                os.remove(path_obj)
                print(f"Successfully deleted local file: {path_obj}")
            else:
                print(f"File not found for deletion: {episode.local_path}")
                
        except Exception as e:
            print(f"Failed to delete local file {episode.local_path}: {e}")

    # 2. Delete vectors from Qdrant
    try:
        vector_store = VectorStore()
        vector_store.delete_episode(episode_id)
        print(f"Deleted vectors for episode {episode_id}")
    except Exception as e:
        print(f"Failed to delete vectors: {e}")

    # 3. Delete DB records in order to respect Foreign Key constraints
    try:
        # A. Chat History (Messages first, then conversations)
        db.query(ChatMessage).filter(ChatMessage.episode_id == episode_id).delete()
        db.query(ChatConversation).filter(ChatConversation.episode_id == episode_id).delete()
        db.query(ChatExchange).filter(ChatExchange.episode_id == episode_id).delete()
        
        # B. Quizzes (Attempts first, then quizzes)
        quiz_ids = [q.id for q in db.query(Quiz).filter(Quiz.episode_id == episode_id).all()]
        if quiz_ids:
            db.query(QuizAttempt).filter(QuizAttempt.quiz_id.in_(quiz_ids)).delete(synchronize_session=False)
        db.query(Quiz).filter(Quiz.episode_id == episode_id).delete()
        
        # C. Analysis Data
        db.query(Transcript).filter(Transcript.episode_id == episode_id).delete()
        db.query(Summary).filter(Summary.episode_id == episode_id).delete()
        db.query(Chapter).filter(Chapter.episode_id == episode_id).delete()
        db.query(Glossary).filter(Glossary.episode_id == episode_id).delete()
        db.query(EpisodeEntity).filter(EpisodeEntity.episode_id == episode_id).delete()
        db.query(EntityRelation).filter(EntityRelation.episode_id == episode_id).delete()
        
        # 4. Finally delete the episode itself
        db.delete(episode)
        db.commit()
        invalidate_episode_cache(user_id=user_id, episode_id=episode_id)
    except Exception as e:
        db.rollback()
        print(f"Database deletion failed: {e}")
        # Log the full error for debugging
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to clean up database records: {str(e)}")
    
    return {"status": "success", "message": f"Episode {episode_id} and all related intelligence deleted"}
