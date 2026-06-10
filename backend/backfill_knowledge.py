"""Backfill glossary, entities and entity relations for already-completed episodes.

Usage (inside api/worker container):  python backfill_knowledge.py 35 36 42
"""
import re
import sys

from app.db.session import SessionLocal
from app.models.podcast import (
    Episode, Transcript, Glossary, Entity, EpisodeEntity, EntityRelation,
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

            for ent in rows:
                pattern = re.compile(rf"\b{re.escape(ent.name)}\b", re.IGNORECASE)
                count, first_ts, last_ts = 0, None, None
                for seg in segments:
                    t = seg.get("text", "")
                    if t and pattern.search(t):
                        count += 1
                        if first_ts is None:
                            first_ts = seg.get("start")
                        last_ts = seg.get("end")
                db.add(EpisodeEntity(
                    episode_id=eid, entity_id=ent.id,
                    mention_count=max(1, count), first_ts=first_ts, last_ts=last_ts,
                ))
            db.commit()

            links = (db.query(EpisodeEntity)
                     .filter(EpisodeEntity.episode_id == eid)
                     .order_by(EpisodeEntity.mention_count.desc())
                     .limit(12).all())
            for i in range(len(links)):
                for j in range(i + 1, len(links)):
                    db.add(EntityRelation(
                        episode_id=eid,
                        source_entity_id=links[i].entity_id,
                        target_entity_id=links[j].entity_id,
                        relation_type="co_mentioned",
                        weight=min(links[i].mention_count, links[j].mention_count),
                    ))
            db.commit()
            print(f"[{eid}] entities: {len(rows)}, relations built")
        except Exception as e:
            db.rollback()
            print(f"[{eid}] entities FAILED: {e}")

    db.close()


if __name__ == "__main__":
    ids = [int(a) for a in sys.argv[1:]] or [35, 36, 42]
    backfill(ids)
