from app.worker.celery_app import celery_app
from app.db.session import SessionLocal
from app.models.podcast import Episode, Transcript, Summary, Chapter, Glossary, Quiz, Entity, EpisodeEntity, EntityRelation, Podcast
from app.services.downloader import Downloader
from app.services.transcriber import Transcriber
from app.services.llm_client import LLMClient
from app.services.quiz_builder import build_quiz_from_transcript, build_quiz_from_summary
from app.services.fact_checker import FactChecker
from app.services.embeddings import EmbeddingService
from app.services.vector_store import VectorStore
import time
import json
import re
import math
from collections import Counter
import os

import redis
from app.core.config import settings


def _cosine_similarity(v1, v2) -> float:
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    dot = sum(a * b for a, b in zip(v1, v2))
    n1 = math.sqrt(sum(a * a for a in v1))
    n2 = math.sqrt(sum(b * b for b in v2))
    if n1 == 0 or n2 == 0:
        return 0.0
    return dot / (n1 * n2)


def _percentile(values, q: float) -> float:
    if not values:
        return 0.0
    xs = sorted(values)
    if len(xs) == 1:
        return xs[0]
    pos = (len(xs) - 1) * max(0.0, min(1.0, q))
    lo = int(math.floor(pos))
    hi = int(math.ceil(pos))
    if lo == hi:
        return xs[lo]
    weight = pos - lo
    return xs[lo] * (1 - weight) + xs[hi] * weight


def _extract_topic_label(text: str, stop_words: set, fallback: str) -> str:
    words = re.findall(r"\b[\wçğıöşüÇĞİÖŞÜ]{4,}\b", (text or "").lower())
    filtered = [w for w in words if w not in stop_words]
    if not filtered:
        return fallback
    from collections import Counter
    top_words = Counter(filtered).most_common(3)
    return " / ".join([w[0].capitalize() for w in top_words])


def _segment_topics_by_embeddings(
    segments,
    stop_words: set,
    embedding_service: EmbeddingService,
):
    if not segments or len(segments) < 12:
        return []

    duration = float(segments[-1].get("end", 0.0) or 0.0)
    if duration <= 0:
        return []

    # 4-12 windows, roughly 2-4 minutes each depending on episode length.
    num_windows = max(4, min(12, int(duration // 180) + 1))
    window_size = duration / num_windows
    windows = []
    for i in range(num_windows):
        start = i * window_size
        end = (i + 1) * window_size
        chunk = [s.get("text", "") for s in segments if start <= float(s.get("start", 0.0)) < end]
        text = " ".join(t for t in chunk if t).strip()
        if not text:
            continue
        windows.append({"start": start, "end": end, "text": text})

    if len(windows) < 4:
        return []

    vectors = embedding_service.embed_batch([w["text"] for w in windows])
    drifts = []
    for i in range(1, len(vectors)):
        sim = _cosine_similarity(vectors[i - 1], vectors[i])
        drifts.append(max(0.0, 1.0 - sim))
    if not drifts:
        return []

    threshold = _percentile(drifts, 0.75)
    boundaries = [0]
    for i, drift in enumerate(drifts, start=1):
        if drift >= threshold and i - boundaries[-1] >= 1:
            boundaries.append(i)
    if boundaries[-1] != len(windows):
        boundaries.append(len(windows))

    if len(boundaries) <= 2:
        return []

    topic_colors = ["#3E5BFF", "#F97316", "#22C55E", "#A855F7", "#E11D48", "#14B8A6"]
    transitions = []
    for i in range(len(boundaries) - 1):
        a = boundaries[i]
        b = boundaries[i + 1]
        if b <= a:
            continue
        block = windows[a:b]
        text = " ".join([w["text"] for w in block])
        transitions.append(
            {
                "start": float(block[0]["start"]),
                "end": float(block[-1]["end"]),
                "topic": _extract_topic_label(text, stop_words, f"Segment {i+1}"),
                "color": topic_colors[i % len(topic_colors)],
            }
        )

    return transitions[:8]

def update_episode_status(db, episode, status, progress=None):
    episode.status = status
    if progress is not None:
        episode.progress = progress
    db.commit()
    
    # Notify via Redis Pub/Sub
    try:
        r = redis.from_url(settings.REDIS_URL)
        r.publish("episode_updates", json.dumps({
            "episode_id": episode.id,
            "user_id": episode.user_id,
            "status": status,
            "progress": episode.progress if progress is not None else episode.progress
        }))
    except Exception as e:
        print(f"Failed to publish update to Redis: {e}")

@celery_app.task(name="process_podcast")
def process_podcast(episode_id: int, audio_url: str, lang: str = "en", summary_type: str = "default"):
    db = SessionLocal()
    episode = None
    try:
        episode = db.query(Episode).filter(Episode.id == episode_id).first()
        if not episode:
            return

        # 1. Download (only if needed)
        if episode.local_path and os.path.exists(episode.local_path):
            print(f"Using existing audio at {episode.local_path}")
            local_path = episode.local_path
        else:
            update_episode_status(db, episode, "downloading", 0.05)
            downloader = Downloader()
            local_path = downloader.download(audio_url)
            
            if not local_path:
                update_episode_status(db, episode, "failed")
                return
            episode.local_path = local_path
            db.commit()

        # 2. Transcribe (only if needed)
        transcript = db.query(Transcript).filter(Transcript.episode_id == episode.id).first()
        if transcript and transcript.raw_json:
            print("Using existing transcript from DB.")
            transcript_data = transcript.raw_json
        else:
            update_episode_status(db, episode, "transcribing", 0.1)
            print(f"Transcribing {local_path}...")
            transcriber = Transcriber(model_size="base", device="cuda")
            transcript_data = transcriber.transcribe(local_path, align=True, diarize=True)
            
            # Initial Save
            transcript = Transcript(
                episode_id=episode.id,
                raw_json=transcript_data,
                full_text=transcript_data["full_text"]
            )
            db.add(transcript)
            db.commit()

        update_episode_status(db, episode, "identifying_speakers", 0.35)
        
        # Identify speakers using AI
        llm = LLMClient()
        if not episode.speaker_map:
            try:
                speaker_map = llm.identify_speakers(transcript_data["full_text"])
                episode.speaker_map = speaker_map
                db.commit()
                print(f"Speakers identified: {speaker_map}")
            except Exception as e:
                print(f"Speaker identification failed: {e}")

        # 2c. Translate transcript segments to target language for UI display (if needed)
        detected_lang = str(transcript_data.get("language", "en")[:2]).lower()
        target_lang_short = str((lang or "en")[:2]).lower()
        
        print(f"Translation check: detected={detected_lang}, target={target_lang_short}")
        
        # Force translation if target is Turkish and current text is English
        is_english = "good morning from the financial times" in transcript_data.get("full_text", "").lower()[:200]
        needs_translation = (detected_lang != target_lang_short and target_lang_short != "en") or (target_lang_short == "tr" and is_english)

        if needs_translation:
            update_episode_status(db, episode, "translating", 0.38)
            try:
                print(f"Translating transcript from '{detected_lang}' to '{target_lang_short}'...")
                full_lang_name = llm._get_lang_name(lang)
                translated_segments = []
                # Translate in chunks of 20 segments to balance speed and quality
                chunk_size = 20
                segs = transcript_data["segments"]
                for ci in range(0, len(segs), chunk_size):
                    chunk = segs[ci: ci + chunk_size]
                    chunk_payload = {str(i): s.get("text", "") for i, s in enumerate(chunk)}
                    
                    t_prompt = (
                        f"Translate these transcript segments to {full_lang_name}.\n"
                        f"Return ONLY a JSON object with the same keys. No explanation.\n\n"
                        f"INPUT JSON:\n{json.dumps(chunk_payload, ensure_ascii=False)}"
                    )
                    
                    try:
                        t_response_raw = str(llm.chat(
                            [
                                {"role": "system", "content": f"You are a strict JSON translator to {full_lang_name}."},
                                {"role": "user", "content": t_prompt},
                            ],
                            metadata={"task": "translate_transcript_chunk_json"}
                        )).strip()
                        
                        # Strip markdown if present
                        if "```" in t_response_raw:
                            t_response_raw = re.sub(r"```(?:json)?\n?|```", "", t_response_raw).strip()
                            
                        translated_map = json.loads(t_response_raw)
                        print(f"Chunk {ci//chunk_size + 1} translated successfully.")
                    except Exception as je:
                        print(f"Chunk {ci//chunk_size + 1} translation failed: {je}")
                        translated_map = {}

                    for i, seg in enumerate(chunk):
                        new_seg = dict(seg)
                        key = str(i)
                        if key in translated_map and translated_map[key]:
                            new_seg["text"] = str(translated_map[key]).strip()
                        translated_segments.append(new_seg)
                
                # Update transcript with translated text
                if translated_segments:
                    transcript_data["segments"] = translated_segments
                    transcript_data["full_text"] = " ".join(
                        [f"{s.get('speaker','Unknown')}: {s.get('text','')}" for s in translated_segments]
                    )
                    transcript.raw_json = transcript_data
                    transcript.full_text = transcript_data["full_text"]
                    db.commit()
                    print(f"Transcript translation complete: {len(translated_segments)} segments saved to DB.")
            except Exception as e:
                print(f"Transcript translation failed (non-fatal): {e}")
                import traceback
                traceback.print_exc()

        update_episode_status(db, episode, "summarizing", 0.45)


        # 3. AI Analysis with Ollama
        print("Analyzing with LLM...")
        embedding_service = None
        # --- DETERMINISTIC SIGNAL GENERATION (Reliable Fallback) ---
        print("Calculating deterministic signals...")
        
        # A. Timeline Density (Word count per 60s bucket)
        segments = transcript_data["segments"]
        if segments:
            duration = segments[-1]["end"]
            buckets = 20
            bucket_size = duration / buckets
            timeline = [{"time": i * bucket_size, "value": 0} for i in range(buckets)]
            
            max_val = 0
            for seg in segments:
                mid_point = (seg["start"] + seg["end"]) / 2
                bucket_idx = min(int(mid_point / bucket_size), buckets - 1)
                word_count = len(seg["text"].split())
                timeline[bucket_idx]["value"] += word_count
                max_val = max(max_val, timeline[bucket_idx]["value"])
            
            # Normalize to 0.0 - 1.0
            if max_val > 0:
                for t in timeline:
                    t["value"] = round(t["value"] / max_val, 2)
            timeline_density = timeline
        else:
            timeline_density = []

        # B. Word Cloud (Frequency Analysis)
        
        text = transcript_data["full_text"].lower()
        # Filter out speaker label artifacts
        text = re.sub(r'speaker_\w+:', '', text)
        text = re.sub(r'unknown:', '', text)

        # Basic stop words (extensible)
        en_stop = {
            "the", "and", "to", "of", "a", "in", "is", "that", "for", "it", "with", "on", "as", "are", "at", "be", "this", "was", "have", "from", "or", "but", "by", "not", "what", "all", "were", "we", "when", "your", "can", "said", "there", "use", "an", "each", "which", "she", "do", "how", "their", "if", "will", "up", "other", "about", "out", "many", "then", "them", "these", "so", "some", "her", "would", "make", "like", "him", "into", "time", "has", "look", "two", "more", "write", "go", "see", "number", "no", "way", "could", "people", "my", "than", "first", "water", "been", "call", "who", "oil", "its", "now", "find", "yeah", "right", "know", "think", "just", "get", "going", "actually", "okay", "um", "uh", "sort", "kind", "mean", "really", 
            "lot", "bit", "things", "thing", "something", "anything", "everything", "maybe", "probably", "definitely", "basically", "actually", "literally", "actually", "honestly", "honestly", "absolutely", "totally", "certainly", "definitely", "frankly", "obviously", "potentially", "probably", "essentially", "perfectly", "ideally", "generally", "normally", "usually", "frequently", "occasionally", "sometimes", "rarely", "hardly", "ever", "highly", "extremely", "pretty", "quite", "rather", "somewhat", "slightly",
            "podcast", "episode", "guest", "host", "talk", "talking", "listen", "listening", "listeners", "viewer", "viewers", "audience", "subscribe", "channel", "video", "audio", "show", "series", "program", "recording", "broadcast", "interview", "conversation", "discussion"
        }
        tr_stop = {
            "bir", "ve", "icin", "bu", "cok", "da", "de", "icin", "ile", "o", "bu", "su", "ne", "kadar", "gibi", "icin", "olarak", "sonra", "ancak", "bile", "hem", "ise", "hic", "yine", "yani", "sey", "bunu", "beni", "ona", "sen", "ben", "biz", "siz", "onlar", "tane", "her", "icin", "su", "mi", "mu", "ama", "fakat", "lakin", "en", "daha", "cok", "kadar", "gibi", "icin", "ile", "ise", "hic", "hep", "hala", "henuz", "belki", "mutlaka", "asla", "sakın", "tabii", "pek",
            "kanka", "falan", "filan", "şey", "valla", "yani", "şimdi", "mesela", "atıyorum", "bak", "mesela", "böyle", "shöyle", "öyle", "şu", "bu"
        }
        
        stop_words_map = {"en": en_stop, "tr": tr_stop}
        stop_words = stop_words_map.get(lang.lower(), en_stop)
        stop_words.add("unknown")
        stop_words.add("speaker")
        
        words = re.findall(r'\b[a-z]{3,}\b', text)
        filtered_words = [w for w in words if w not in stop_words]
        common = Counter(filtered_words).most_common(40)
        
        # Normalize for visualization (10-100 scale)
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
            # Calculate percentages
            percentages = {}
            for spk, dur in speaker_stats.items():
                percentages[spk] = (dur / total_dur) * 100
            
            # Round and ensure sum is 100
            rounded = {spk: round(pct) for spk, pct in percentages.items()}
            diff = 100 - sum(rounded.values())
            
            # Adjust the largest contributor to make sum exactly 100
            if diff != 0 and rounded:
                max_speaker = max(rounded.keys(), key=lambda k: percentages[k])
                rounded[max_speaker] += diff
            
            speaker_contribution = rounded
        
        # D. Insight Timeline (New ideas per time bucket)
        # Localized insight keywords
        insight_keywords_map = {
            "tr": {'önemli', 'kritik', 'temel', 'stratejik', 'ancak', 'belki', 'not', 'ilginç', 'aslında', 'çünkü', 'dolayısıyla'},
            "en": {'important', 'key', 'crucial', 'significant', 'note', 'interesting', 'however', 'therefore', 'because', 'essentially', 'basically', 'actually', 'fundamentally'}
        }
        insight_keywords = insight_keywords_map.get(lang.lower(), insight_keywords_map["en"])
        
        insight_timeline = []
        if segments:
            duration = segments[-1]["end"]
            buckets = 20
            bucket_size = duration / buckets
            
            for i in range(buckets):
                bucket_start = i * bucket_size
                bucket_end = (i + 1) * bucket_size
                insight_count = 0
                
                for seg in segments:
                    if bucket_start <= seg["start"] < bucket_end:
                        seg_text = seg["text"].lower()
                        # Count questions and insight keywords
                        insight_count += seg_text.count('?')
                        insight_count += sum(1 for word in insight_keywords if word in seg_text)
                
                insight_timeline.append({"time": bucket_start, "insight_count": insight_count})
        
        # E. Topic Transitions (Segment the podcast into topic blocks)
        # Use word frequency changes to detect topic shifts
        topic_transitions = []
        if segments and len(segments) > 10:
            # Analyze in 4 segments for simplicity
            duration = segments[-1]["end"]
            num_segments = 4
            segment_size = duration / num_segments
            
            topic_colors = ["#3E5BFF", "#FF3E5B", "#5BFF3E", "#FF5B3E", "#5B3EFF"]
            
            for i in range(num_segments):
                start_time = i * segment_size
                end_time = (i + 1) * segment_size
                
                # Get text from this segment
                segment_text = " ".join([
                    seg["text"] for seg in segments 
                    if start_time <= seg["start"] < end_time
                ])
                
                # Extract top words to infer topic
                words = re.findall(r'\b[a-z]{4,}\b', segment_text.lower())
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

        # E2. Topic transitions using embedding drift (preferred over static split)
        try:
            if embedding_service is None:
                embedding_service = EmbeddingService()
            segmented_topics = _segment_topics_by_embeddings(
                segments=segments,
                stop_words=stop_words,
                embedding_service=embedding_service,
            )
            if segmented_topics:
                topic_transitions = segmented_topics
        except Exception as e:
            print(f"Embedding-based topic segmentation failed: {e}")
        
        # 3.1 Visual Signals (High Fidelity)
        print("Generating visual signals...")
        try:
            visual_signals = llm.generate_visual_signals(transcript_data["segments"], lang=lang)
            llm_transitions = visual_signals.get("topic_transitions", [])
            llm_insights = visual_signals.get("insight_points", [])
            
            # Ensure we have lists of dicts
            if isinstance(llm_transitions, dict): llm_transitions = [llm_transitions]
            if isinstance(llm_insights, dict): llm_insights = [llm_insights]

            if isinstance(llm_transitions, list) and llm_transitions:
                normalized_transitions = []
                for t in llm_transitions:
                    if not isinstance(t, dict): continue
                    # Normalize keys
                    color = t.get("color") or t.get("hex_color") or "#3E5BFF"
                    if color and not color.startswith("#"): color = f"#{color}"
                    normalized_transitions.append({
                        "start": t.get("start", 0),
                        "end": t.get("end", 0),
                        "topic": t.get("topic", "Topic"),
                        "color": color
                    })
                topic_transitions = normalized_transitions
            
            if isinstance(llm_insights, list) and llm_insights:
                normalized_insights = []
                for p in llm_insights:
                    if not isinstance(p, dict): continue
                    # Normalize keys
                    intensity = p.get("intensity") or p.get("insight_count") or 0
                    normalized_insights.append({
                        "time": p.get("time", 0),
                        "insight_count": intensity,
                        "intensity": intensity
                    })
                insight_timeline = normalized_insights
        except Exception as e:
            print(f"Visual signals generation failed: {e}")

        # 3.2 Global Summary & Action Items
        print("Generating summary...")
        summary_data = llm.generate_summary(transcript_data["segments"], lang=lang, summary_type=summary_type)
        
        # Helper to strictify strings for DB
        def ensure_string(val):
            if isinstance(val, str):
                return val
            if isinstance(val, (list, dict)):
                try:
                    return json.dumps(val, ensure_ascii=False)
                except:
                    return str(val)
            return ""

        def ensure_list(val):
            if isinstance(val, list):
                return val
            if isinstance(val, str):
                try:
                    return json.loads(val)
                except:
                    return [val]
            return []

        summary_text = ensure_string(summary_data.get("global_summary", ""))
        exec_brief = ensure_string(summary_data.get("executive_brief", ""))
        
        key_quotes = summary_data.get("key_quotes") or []
        key_quotes = ensure_list(key_quotes)
        key_takeaways = ensure_list(summary_data.get("key_insights", []))

        # Fallback key quotes if LLM misses them
        if not key_quotes:
            key_quotes = llm.select_key_quotes(
                transcript_data.get("segments", []),
                speaker_map=episode.speaker_map or {},
                limit=6,
            )

        # Evidence-backed insight attribution: keep only insights that map to transcript evidence.
        llm_attr_raw = summary_data.get("insight_attribution") if isinstance(summary_data.get("insight_attribution"), list) else []
        llm_attr = [a for a in llm_attr_raw if isinstance(a, dict)]

        def _tokens(text: str):
            return set(re.findall(r"[a-zA-ZçğıöşüÇĞİÖŞÜ0-9]{3,}", (text or "").lower()))

        attributed_from_takeaways = []
        segments_for_evidence = transcript_data.get("segments", [])
        for item in key_takeaways[:8]:
            insight = str(item).strip()
            if not insight:
                continue
            i_tokens = _tokens(insight)
            if not i_tokens:
                continue

            best = None
            best_score = 0
            for seg in segments_for_evidence:
                seg_text = str(seg.get("text", "")).strip()
                if not seg_text:
                    continue
                s_tokens = _tokens(seg_text)
                overlap = len(i_tokens & s_tokens)
                if overlap > best_score:
                    best_score = overlap
                    best = seg

            # Enforce evidence threshold to avoid fabricated mapping.
            if best and best_score >= 2:
                lexical_conf = best_score / max(1, len(i_tokens))
                semantic_conf = lexical_conf
                if embedding_service is not None:
                    try:
                        e1 = embedding_service.embed_text(insight)
                        e2 = embedding_service.embed_text(str(best.get("text", "")))
                        semantic_conf = max(0.0, _cosine_similarity(e1, e2))
                    except Exception:
                        semantic_conf = lexical_conf
                confidence = round(min(1.0, (0.4 * lexical_conf) + (0.6 * semantic_conf)), 2)
                attributed_from_takeaways.append({
                    "insight": insight,
                    "speaker": best.get("speaker", "Unknown"),
                    "start": float(best.get("start", 0.0)),
                    "end": float(best.get("end", best.get("start", 0.0))),
                    "evidence_text": str(best.get("text", "")),
                    "confidence": confidence,
                })

        # Merge and keep only evidence-backed entries.
        merged_attr = []
        seen_insights = set()
        for entry in llm_attr + attributed_from_takeaways:
            insight = str(entry.get("insight", "")).strip()
            if not insight:
                continue
            start = entry.get("start")
            end = entry.get("end")
            evidence_text = str(entry.get("evidence_text", "")).strip()
            if start is None or end is None or not evidence_text:
                continue
            key = insight.lower()
            if key in seen_insights:
                continue
            seen_insights.add(key)
            merged_attr.append({
                "insight": insight,
                "speaker": str(entry.get("speaker", "Unknown")),
                "start": float(start),
                "end": float(end),
                "evidence_text": evidence_text,
                "confidence": float(entry.get("confidence", 0.0)),
            })

        # If we cannot ground a takeaway, don't surface it.
        key_takeaways = [a["insight"] for a in merged_attr]
        # Use full transcript text for glossary/quiz extraction
        text_for_extracts = transcript_data.get("full_text", "")

        action_items_structured = summary_data.get("action_items_structured")
        if not isinstance(action_items_structured, list):
            action_items_structured = []
        if not action_items_structured:
            fallback_action_items = summary_data.get("action_items", []) or []
            action_items_structured = []
            for item in fallback_action_items[:8]:
                text = str(item).strip()
                if not text:
                    continue
                lowered = text.lower()
                explicitness = "explicit" if any(x in lowered for x in ["must", "should", "need to", "action"]) else "implicit"
                priority = "high" if any(x in lowered for x in ["urgent", "critical", "immediately"]) else "medium"
                owner = "team" if any(x in lowered for x in ["team", "org", "company"]) else "listener"
                timeline = "this week" if any(x in lowered for x in ["this week", "soon", "immediately"]) else "next 30 days"
                action_items_structured.append(
                    {
                        "text": text,
                        "explicitness": explicitness,
                        "priority": priority,
                        "owner": owner,
                        "timeline": timeline,
                    }
                )
        
        # De-duplicate: Clear old summary/chapters/quizzes/glossary for this episode
        db.query(Summary).filter(Summary.episode_id == episode.id).delete()
        db.query(Chapter).filter(Chapter.episode_id == episode.id).delete()
        db.query(Quiz).filter(Quiz.episode_id == episode.id).delete()
        db.query(Glossary).filter(Glossary.episode_id == episode.id).delete()
        db.commit()

        # Ensure persona_summaries are populated (fallback to separate pass if missing)
        persona_sums = summary_data.get("persona_summaries") or {}
        if not persona_sums or "investor" not in persona_sums or "skeptic" not in persona_sums:
            print("Persona summaries missing from main pass. Running dedicated persona pass...")
            try:
                for p_key in ["investor", "skeptic"]:
                    if p_key not in persona_sums:
                        persona_sums[p_key] = llm.generate_persona_summary(transcript_data["segments"], p_key, lang=lang)
            except Exception as pe:
                print(f"Dedicated persona pass failed: {pe}")

        summary_obj = Summary(
            episode_id=episode.id,
            global_summary=summary_text,
            executive_brief=exec_brief,
            action_items=summary_data.get("action_items", []),
            key_takeaways=key_takeaways,
            key_quotes=key_quotes,
            suggested_questions=summary_data.get("suggested_questions", []),
            
            # Use our deterministic calculations if LLM misses them
            speaker_contribution=summary_data.get("speaker_contribution") or speaker_contribution,
            topics=summary_data.get("topics"), # Topics still need LLM
            insight_attribution=merged_attr,
            insight_density=summary_data.get("insight_density"),
            
            timeline_density=timeline_density, # Keep base density
            word_cloud_data=word_cloud_data,    # Use deterministic
            insight_timeline=insight_timeline,   # High-fidelity or heuristic
            topic_transitions=topic_transitions,  # High-fidelity or heuristic
            summary_layers=summary_data.get("summary_layers") or {},
            perspective_summaries=summary_data.get("perspective_summaries") or {},
            persona_summaries=persona_sums,
            high_value_moments=summary_data.get("high_value_moments") or [],
            categorized_insights=summary_data.get("categorized_insights") or {},
            conversation_flow=summary_data.get("conversation_flow") or {},
            structured_notes=summary_data.get("structured_notes") or [],
            action_items_structured=action_items_structured,
        )

        # 3.1.1 Claim extraction + optional fact-check
        try:
            summary_for_claims = summary_text or summary_data.get("executive_brief", "")
            heuristic_claims = []
            if summary_for_claims:
                # Simple heuristics: numbers, percentages, dates, forecasts
                for line in summary_for_claims.splitlines():
                    line = line.strip()
                    if not line:
                        continue
                    if re.search(r"\\b\\d{4}\\b", line) or re.search(r"\\b\\d+%\\b", line) or re.search(r"\\b\\d+\\.\\d+\\b", line):
                        heuristic_claims.append({"claim": line})
                    elif re.search(r"\\b(will|expected|forecast|projected|estimate|target)\\b", line, re.IGNORECASE):
                        heuristic_claims.append({"claim": line})

            llm_claims = llm.extract_verifiable_claims(summary_for_claims, lang=lang) if summary_for_claims else []
            merged_claims = []
            seen = set()
            for item in (llm_claims or []) + heuristic_claims:
                if not isinstance(item, dict):
                    continue
                claim = str(item.get("claim", "")).strip()
                if not claim:
                    continue
                key = claim.lower()
                if key in seen:
                    continue
                seen.add(key)
                merged_claims.append(claim)

            fact_checker = FactChecker()
            summary_obj.claim_checks = fact_checker.verify_claims(merged_claims[:8])
        except Exception as e:
            print(f"Claim extraction failed: {e}")


        db.add(summary_obj)
        db.commit()

        
        update_episode_status(db, episode, "extracting_chapters", 0.65)
        
        # 3.2 Chapters
        try:
            chapters_data = llm.extract_chapters(transcript_data["segments"], lang=lang)
            update_episode_status(db, episode, "extracting_chapters", 0.75)

            # Fallback: derive a book-style table of contents from topic segments +
            # insights when the LLM produced too few chapters (e.g. weak local model).
            if len(chapters_data) < 2 and topic_transitions:
                derived: list = []
                for tt in topic_transitions:
                    t_start = float(tt.get("start", 0.0) or 0.0)
                    t_end = float(tt.get("end", t_start + 1e9) or (t_start + 1e9))
                    # Find an insight inside this topic window for the description.
                    desc = ""
                    for ins in (merged_attr or []):
                        s = float(ins.get("start", -1) or -1)
                        if t_start <= s < t_end and ins.get("insight"):
                            desc = str(ins["insight"]).strip()
                            break
                    title = str(tt.get("topic", "") or "").strip()
                    if not title:
                        continue
                    derived.append({
                        "timestamp": t_start,
                        "title": title,
                        "summary": desc,
                        "is_main": "True",
                    })
                if len(derived) >= 2:
                    print(f"Using {len(derived)} fallback chapters from topic segments.")
                    chapters_data = derived

            for ch in chapters_data:
                is_main_val = 1 if str(ch.get("is_main", "True")).lower() == "true" else 0
                chapter = Chapter(
                    episode_id=episode.id,
                    timestamp=float(ch.get("timestamp", 0.0)),
                    title=str(ch.get("title", "Untitled Chapter")),
                    summary=str(ch.get("summary", "")),
                    is_main=is_main_val
                )
                db.add(chapter)
            db.commit()
        except Exception as e:
            print(f"Chapter extraction failed: {e}")
            db.rollback()

        update_episode_status(db, episode, "generating_insights", 0.8)

        # 3.3 Glossary
        try:
            glossary_data = llm.extract_glossary(text_for_extracts, lang=lang)
            for item in glossary_data:
                glossary_item = Glossary(
                    episode_id=episode.id,
                    term=item.get("term"),
                    definition=item.get("definition"),
                    context_sentence=item.get("context_sentence")
                )
                db.add(glossary_item)
            db.commit()
        except Exception as e:
            print(f"Glossary extraction failed: {e}")
            db.rollback()

        # 3.3.1 Smart Tagging (auto tags + color group)
        try:
            if episode.podcast_id:
                podcast = db.query(Podcast).filter(Podcast.id == episode.podcast_id).first()
            else:
                podcast = None

            if podcast and not podcast.tags:
                print(f"Generating tags for podcast: {podcast.title} (Lang: {lang})")
                tags = llm.extract_podcast_tags(transcript_data["segments"], lang=lang)
                print(f"Raw tags from LLM: {tags}")
                cleaned = []
                seen = set()
                for t in tags:
                    if not isinstance(t, dict):
                        continue
                    label = str(t.get("label", "")).strip().replace("#", "")
                    group = str(t.get("group", "")).strip().lower()
                    if not label:
                        continue
                    key = f"{label}:{group}"
                    if key in seen:
                        continue
                    seen.add(key)
                    cleaned.append({"label": label, "group": group or "education"})

                # Guarantee minimum 3 tags
                fallback_candidates = []
                if summary_data.get("topics"):
                    for topic in summary_data.get("topics", []):
                        if isinstance(topic, dict):
                            topic_label = str(topic.get("label", "")).strip()
                            if topic_label:
                                fallback_candidates.append({"label": topic_label, "group": "insight"})
                fallback_candidates += [
                    {"label": (episode.show_name or "podcast").strip()[:30], "group": "show"},
                    {"label": (summary_type or "default"), "group": "format"},
                    {"label": "general", "group": "category"},
                ]

                for cand in fallback_candidates:
                    if len(cleaned) >= 3:
                        break
                    key = f"{cand['label']}:{cand['group']}"
                    if not cand["label"] or key in seen:
                        continue
                    seen.add(key)
                    cleaned.append(cand)

                print(f"Final cleaned tags: {cleaned}")
                podcast.tags = cleaned[:4]
                db.add(podcast)
                db.commit()
                print(f"Successfully saved {len(cleaned[:4])} tags to podcast {podcast.id}")
        except Exception as e:
            print(f"Tag generation failed: {e}")
            import traceback
            traceback.print_exc()
            db.rollback()

        # 3.4 Entity Extraction + Graph Links (GraphRAG MVP)
        try:
            # Clear old links for reprocess
            db.query(EpisodeEntity).filter(EpisodeEntity.episode_id == episode.id).delete()
            db.query(EntityRelation).filter(EntityRelation.episode_id == episode.id).delete()
            db.commit()

            entities_raw = llm.extract_entities(transcript_data["segments"], lang=lang)
            if not isinstance(entities_raw, list):
                entities_raw = []

            # Normalize + de-duplicate
            cleaned = []
            seen = set()
            for item in entities_raw:
                if not isinstance(item, dict):
                    continue
                name = str(item.get("name", "")).strip()
                ent_type = str(item.get("type", "concept")).strip().lower()
                if not name:
                    continue
                key = f"{name.lower()}::{ent_type}"
                if key in seen:
                    continue
                seen.add(key)
                if ent_type not in {"person", "org", "product", "concept"}:
                    ent_type = "concept"
                cleaned.append({"name": name, "type": ent_type})

            cleaned = cleaned[:30]

            if cleaned:
                if embedding_service is None:
                    embedding_service = EmbeddingService()
                entity_rows = []
                for ent in cleaned:
                    existing = (
                        db.query(Entity)
                        .filter(Entity.name == ent["name"], Entity.type == ent["type"])
                        .first()
                    )
                    if not existing:
                        embedding = None
                        try:
                            embedding = embedding_service.embed_text(ent["name"])
                        except Exception as e:
                            print(f"Entity embedding failed for {ent['name']}: {e}")
                        existing = Entity(
                            name=ent["name"],
                            type=ent["type"],
                            embedding=embedding,
                        )
                        db.add(existing)
                        db.commit()
                        db.refresh(existing)
                    entity_rows.append(existing)

                # Build EpisodeEntity with timestamps + mention counts
                segments = transcript_data.get("segments", [])
                for ent in entity_rows:
                    pattern = re.compile(rf"\\b{re.escape(ent.name)}\\b", re.IGNORECASE)
                    mention_count = 0
                    first_ts = None
                    last_ts = None
                    for seg in segments:
                        seg_text = seg.get("text", "")
                        if not seg_text:
                            continue
                        if pattern.search(seg_text):
                            mention_count += 1
                            if first_ts is None:
                                first_ts = seg.get("start")
                            last_ts = seg.get("end")

                    link = EpisodeEntity(
                        episode_id=episode.id,
                        entity_id=ent.id,
                        mention_count=max(1, mention_count),
                        first_ts=first_ts,
                        last_ts=last_ts
                    )
                    db.add(link)
                db.commit()

                # Build co-mention relations (top entities only)
                links = (
                    db.query(EpisodeEntity)
                    .filter(EpisodeEntity.episode_id == episode.id)
                    .order_by(EpisodeEntity.mention_count.desc())
                    .limit(12)
                    .all()
                )
                for i in range(len(links)):
                    for j in range(i + 1, len(links)):
                        src = links[i]
                        tgt = links[j]
                        weight = min(src.mention_count, tgt.mention_count)
                        db.add(EntityRelation(
                            episode_id=episode.id,
                            source_entity_id=src.entity_id,
                            target_entity_id=tgt.entity_id,
                            relation_type="co_mentioned",
                            weight=weight
                        ))
                        db.add(EntityRelation(
                            episode_id=episode.id,
                            source_entity_id=tgt.entity_id,
                            target_entity_id=src.entity_id,
                            relation_type="co_mentioned",
                            weight=weight
                        ))
                db.commit()
        except Exception as e:
            print(f"Entity extraction failed: {e}")
            db.rollback()

        # 3.5 Quizzes
        try:
            if summary_type == "executive":
                difficulty_profile = {"easy": 1, "medium": 3, "hard": 4}
                cognitive_targets = ["understand", "apply", "analyze", "evaluate"]
            elif summary_type == "technical":
                difficulty_profile = {"easy": 1, "medium": 3, "hard": 4}
                cognitive_targets = ["remember", "apply", "analyze", "evaluate"]
            elif summary_type == "conversational":
                difficulty_profile = {"easy": 3, "medium": 4, "hard": 1}
                cognitive_targets = ["remember", "understand", "apply", "analyze"]
            else:
                difficulty_profile = {"easy": 2, "medium": 4, "hard": 2}
                cognitive_targets = ["remember", "understand", "apply", "analyze"]

            # Always use LLM quiz generation first — deterministic produces meaningless keyword extractions
            print("Generating LLM-based quiz...")
            quiz_data = llm.generate_quiz(
                transcript_data.get("segments", []),
                lang=lang,
                count=8,
                difficulty_profile=difficulty_profile,
                cognitive_targets=cognitive_targets,
            )

            def _is_low_quality_quiz(items):
                if not isinstance(items, list) or len(items) == 0:
                    return True
                valid = 0
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    q = str(item.get("question", "")).strip()
                    options = item.get("options") if isinstance(item.get("options"), list) else []
                    if q and len(options) >= 3 and len(q) > 15:
                        valid += 1
                return valid < 3  # Need at least 3 valid questions

            if _is_low_quality_quiz(quiz_data):
                # Summary-based fallback produces MEANINGFUL questions from the
                # already-LLM-generated insights/takeaways (no 'who said' garbage).
                print("LLM quiz quality low; using summary-based fallback.")
                quiz_data = build_quiz_from_summary(
                    {
                        "insight_attribution": merged_attr,
                        "key_takeaways": key_takeaways,
                        "key_quotes": key_quotes,
                    },
                    count=8,
                    lang=lang,
                )
                # Last-resort transcript fallback only if summary had nothing usable.
                if _is_low_quality_quiz(quiz_data):
                    print("Summary fallback thin; using transcript fallback.")
                    quiz_data = build_quiz_from_transcript(
                        transcript_data.get("segments", []),
                        speaker_map=episode.speaker_map or {},
                        count=8,
                        lang=lang,
                        difficulty_profile=difficulty_profile,
                        cognitive_targets=cognitive_targets,
                    )
            for q in quiz_data:
                # Validate that q is a dict
                if not isinstance(q, dict):
                    print(f"Skipping invalid quiz item (not a dict): {q}")
                    continue
                    
                # Validate options
                options = q.get("options")
                if not isinstance(options, list):
                    options = []

                # Handle correct answer (could be index or text)
                correct_ans = q.get("correct_answer")
                if isinstance(correct_ans, int):
                    if 0 <= correct_ans < len(options):
                        correct_ans = options[correct_ans]
                    else:
                        correct_ans = str(correct_ans)
                
                quiz_item = Quiz(
                    episode_id=episode.id,
                    question=q.get("question"),
                    options=options,
                    correct_answer=str(correct_ans),
                    explanation=q.get("explanation"),
                    question_type=q.get("question_type"),
                    difficulty=q.get("difficulty"),
                    source_start=float(q.get("source_start", 0.0)),
                    source_end=float(q.get("source_end", 0.0)),
                    source_text=q.get("source_text")
                )
                db.add(quiz_item)
            db.commit()
        except Exception as e:
            print(f"Quiz generation failed: {e}")
            db.rollback()

        update_episode_status(db, episode, "indexing", 0.9)

        # 3.6 RAG Indexing
        try:
            if embedding_service is None:
                embedding_service = EmbeddingService()
            vector_store = VectorStore()
            segments = transcript_data["segments"]
            processed_segments = []
            max_chars = 1200
            current_chunk = []
            current_chars = 0
            last_speaker = None

            def flush_chunk():
                nonlocal current_chunk, current_chars
                if not current_chunk:
                    return
                combined_text = " ".join([s["text"] for s in current_chunk]).strip()
                if not combined_text:
                    current_chunk = []
                    current_chars = 0
                    return
                start_ts = current_chunk[0]["start"]
                end_ts = current_chunk[-1]["end"]
                speakers = list({s.get("speaker", "Unknown") for s in current_chunk})
                embedding = embedding_service.embed_text(combined_text)
                processed_segments.append({
                    "text": combined_text,
                    "timestamp": start_ts,
                    "end_timestamp": end_ts,
                    "speakers": speakers,
                    "episode_title": episode.title,
                    "show_name": episode.show_name,
                    "embedding": embedding
                })
                current_chunk = []
                current_chars = 0

            for seg in segments:
                seg_text = seg.get("text", "").strip()
                if not seg_text:
                    continue

                seg_speaker = seg.get("speaker", "Unknown")
                seg_len = len(seg_text)

                # Flush if speaker changes and chunk already has content
                if current_chunk and last_speaker is not None and seg_speaker != last_speaker:
                    flush_chunk()

                # If adding this segment would exceed max_chars, flush first
                if current_chunk and (current_chars + seg_len) > max_chars:
                    flush_chunk()

                current_chunk.append(seg)
                current_chars += seg_len
                last_speaker = seg_speaker

            flush_chunk()
            vector_store.upsert_segments(episode_id, processed_segments)
        except Exception as e:
            print(f"RAG indexing failed: {e}")

        update_episode_status(db, episode, "completed", 1.0)

    except Exception as e:
        print(f"Task failed: {e}")
        if episode:
            update_episode_status(db, episode, "failed")
    finally:
        db.close()
