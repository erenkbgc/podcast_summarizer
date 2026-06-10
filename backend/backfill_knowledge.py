"""Backfill glossary, entities and entity relations for already-completed episodes.

Usage (inside api/worker container):  python backfill_knowledge.py 35 36 42
"""
import re
import sys

from app.db.session import SessionLocal
from app.models.podcast import (
    Episode, Transcript, Glossary, Entity, EpisodeEntity, EntityRelation, Chapter, Summary,
)
from app.services.llm_client import LLMClient
from app.services.embeddings import EmbeddingService


def backfill(episode_ids):
    db = SessionLocal()
    llm = LLMClient()
    es = EmbeddingService()

    for eid in episode_ids:
        ep = db.query(Episode).filter(Episode.id == eid).first()
        tr = db.query(Transcript).filter(Transcript.episode_id == eid).first()
        if not ep or not tr:
            print(f"[{eid}] missing episode/transcript, skipping")
            continue
        segments = tr.raw_json.get("segments", [])
        lang = ep.preferred_lang or "en"

        # ---- Glossary ----
        try:
            db.query(Glossary).filter(Glossary.episode_id == eid).delete()
            items = llm.extract_glossary(tr.full_text or "", lang=lang)
            n = 0
            for it in items:
                if not isinstance(it, dict) or not it.get("term"):
                    continue
                db.add(Glossary(
                    episode_id=eid,
                    term=str(it.get("term"))[:200],
                    definition=str(it.get("definition") or ""),
                    context_sentence=str(it.get("context_sentence") or ""),
                ))
                n += 1
            db.commit()
            print(f"[{eid}] glossary: {n} terms")
        except Exception as e:
            db.rollback()
            print(f"[{eid}] glossary FAILED: {e}")

        # ---- Entities + relations ----
        try:
            db.query(EpisodeEntity).filter(EpisodeEntity.episode_id == eid).delete()
            db.query(EntityRelation).filter(EntityRelation.episode_id == eid).delete()
            db.commit()

            raw = llm.extract_entities(segments, lang=lang)
            cleaned, seen = [], set()
            for it in raw if isinstance(raw, list) else []:
                if not isinstance(it, dict):
                    continue
                name = str(it.get("name", "")).strip()
                etype = str(it.get("type", "concept")).strip().lower()
                if not name:
                    continue
                if etype not in {"person", "org", "product", "concept"}:
                    etype = "concept"
                key = f"{name.lower()}::{etype}"
                if key in seen:
                    continue
                seen.add(key)
                cleaned.append({"name": name, "type": etype})
            cleaned = cleaned[:30]

            rows = []
            for ent in cleaned:
                existing = db.query(Entity).filter(
                    Entity.name == ent["name"], Entity.type == ent["type"]
                ).first()
                if not existing:
                    emb = None
                    try:
                        emb = es.embed_text(ent["name"])
                    except Exception:
                        pass
                    existing = Entity(name=ent["name"], type=ent["type"], embedding=emb)
                    db.add(existing)
                    db.commit()
                    db.refresh(existing)
                rows.append(existing)

            # Per-segment presence -> mention counts + true co-occurrence edges.
            patterns = {e.id: re.compile(rf"\b{re.escape(e.name)}\b", re.IGNORECASE) for e in rows}
            seg_sets, stats = [], {eid2: {"count": 0, "first": None, "last": None} for eid2 in patterns}
            for seg in segments:
                t = seg.get("text", "") or ""
                present = set()
                for ent_id, pat in patterns.items():
                    if t and pat.search(t):
                        present.add(ent_id)
                        s = stats[ent_id]
                        s["count"] += 1
                        if s["first"] is None:
                            s["first"] = seg.get("start")
                        s["last"] = seg.get("end")
                seg_sets.append(present)

            for ent in rows:
                s = stats[ent.id]
                db.add(EpisodeEntity(
                    episode_id=eid, entity_id=ent.id,
                    mention_count=max(1, s["count"]), first_ts=s["first"], last_ts=s["last"],
                ))
            db.commit()

            from itertools import combinations
            WINDOW = 5
            pair_weights = {}
            for i in range(len(seg_sets)):
                union = set()
                for j in range(i, min(i + WINDOW, len(seg_sets))):
                    union |= seg_sets[j]
                for a, b in combinations(sorted(union), 2):
                    pair_weights[(a, b)] = pair_weights.get((a, b), 0) + 1
            edges = 0
            for (a, b), w in pair_weights.items():
                if w < 2:
                    continue
                for s_id, t_id in ((a, b), (b, a)):
                    db.add(EntityRelation(episode_id=eid, source_entity_id=s_id,
                                          target_entity_id=t_id, relation_type="co_mentioned", weight=w))
                edges += 1
            db.commit()
            print(f"[{eid}] entities: {len(rows)}, co-occurrence edges: {edges}")
        except Exception as e:
            db.rollback()
            print(f"[{eid}] entities FAILED: {e}")

        # ---- Chapters (book-style index) — only if missing ----
        try:
            existing_ch = db.query(Chapter).filter(Chapter.episode_id == eid).count()
            if existing_ch < 2:
                db.query(Chapter).filter(Chapter.episode_id == eid).delete()
                chapters_data = llm.extract_chapters(segments, lang=lang)
                # Fallback: derive from summary topic_transitions + insights
                if len(chapters_data) < 2:
                    summ = db.query(Summary).filter(Summary.episode_id == eid).first()
                    tts = (summ.topic_transitions if summ else None) or []
                    attrs = (summ.insight_attribution if summ else None) or []
                    derived = []
                    for tt in tts:
                        t_start = float(tt.get("start", 0) or 0)
                        t_end = float(tt.get("end", t_start + 1e9) or (t_start + 1e9))
                        desc = next((str(a.get("insight", "")).strip() for a in attrs
                                     if t_start <= float(a.get("start", -1) or -1) < t_end and a.get("insight")), "")
                        title = str(tt.get("topic", "") or "").strip()
                        if title:
                            derived.append({"timestamp": t_start, "title": title, "summary": desc})
                    if len(derived) >= 2:
                        chapters_data = derived
                n = 0
                for ch in chapters_data:
                    if not isinstance(ch, dict) or "timestamp" not in ch:
                        continue
                    db.add(Chapter(
                        episode_id=eid,
                        timestamp=float(ch.get("timestamp", 0) or 0),
                        title=str(ch.get("title", "Untitled"))[:200],
                        summary=str(ch.get("summary", "") or ""),
                        is_main=1,
                    ))
                    n += 1
                db.commit()
                print(f"[{eid}] chapters: {n} created")
            else:
                print(f"[{eid}] chapters: {existing_ch} already present, skipped")
        except Exception as e:
            db.rollback()
            print(f"[{eid}] chapters FAILED: {e}")

        # ---- Speaker names + contribution ----
        try:
            speaker_map = llm.identify_speakers(tr.full_text or "")
            ep.speaker_map = speaker_map

            # Recompute speaker_contribution from real diarized durations,
            # mapped through the speaker_map to display names (%).
            from app.models.podcast import Summary as _Summary
            durations: dict = {}
            for seg in segments:
                spk = seg.get("speaker")
                if not spk:
                    continue
                dur = float(seg.get("end", 0) or 0) - float(seg.get("start", 0) or 0)
                if dur > 0:
                    name = (speaker_map or {}).get(spk, spk)
                    durations[name] = durations.get(name, 0.0) + dur
            total = sum(durations.values())
            contribution = {k: round(v / total * 100, 1) for k, v in durations.items()} if total else {}
            summ = db.query(_Summary).filter(_Summary.episode_id == eid).first()
            if summ and contribution:
                summ.speaker_contribution = contribution
            db.commit()
            named = sum(1 for v in (speaker_map or {}).values() if not str(v).startswith("Speaker "))
            print(f"[{eid}] speakers: {len(speaker_map or {})} labels, {named} named; contribution {len(contribution)} -> {speaker_map}")
        except Exception as e:
            db.rollback()
            print(f"[{eid}] speakers FAILED: {e}")

    db.close()


if __name__ == "__main__":
    ids = [int(a) for a in sys.argv[1:]] or [35, 36, 42]
    backfill(ids)
