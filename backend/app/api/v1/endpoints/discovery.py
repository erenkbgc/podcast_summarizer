from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.db.session import get_db
from sqlalchemy import func
import json as _json
from app.models.podcast import Episode, Glossary, Entity, EpisodeEntity, EntityRelation, Transcript
from app.schemas.podcast import SearchResult, GlossaryRead, ActivityMessage, EntityRead, EntityTimelineItem, EntityRelationRead, KnowledgeEpisodeOverview
from app.services.llm_client import LLMClient
from app.services.embeddings import EmbeddingService
from app.services.vector_store import VectorStore
from typing import List

router = APIRouter()

# Security Fix: Use get_current_user instead of unverified Header
from app.models.podcast import User as UserDBModel
from app.api.v1.deps import get_current_user

@router.get("/search/global", response_model=List[SearchResult])
def global_search(q: str, db: Session = Depends(get_db), current_user: UserDBModel = Depends(get_current_user)):
    """Search for snippets across all indexed podcasts."""
    user_id = current_user.id
    embedding_service = EmbeddingService()
    vector_store = VectorStore()
    
    query_vector = embedding_service.embed_text(q)
    hits = vector_store.search(query_vector=query_vector, query_text=q, limit=15)
    
    hit_episode_ids = list({h.get("episode_id") for h in hits if h.get("episode_id") is not None})
    episodes_by_id = {}
    if hit_episode_ids:
        episodes = (
            db.query(Episode.id, Episode.title)
            .filter(Episode.user_id == user_id, Episode.id.in_(hit_episode_ids))
            .all()
        )
        episodes_by_id = {e.id: e.title for e in episodes}

    results = []
    for hit in hits:
        ep_id = hit.get("episode_id")
        if ep_id in episodes_by_id:
            results.append(SearchResult(
                episode_id=ep_id,
                episode_title=episodes_by_id[ep_id],
                text=hit['text'],
                timestamp=hit['timestamp']
            ))
    return results


@router.get("/glossary/universal", response_model=List[GlossaryRead])
def universal_glossary(rebuild: bool = False, db: Session = Depends(get_db), current_user: UserDBModel = Depends(get_current_user)):
    """Get all technical terms and concepts across all podcasts."""
    user_id = current_user.id
    glossary_items = db.query(Glossary).join(Episode).filter(Episode.user_id == user_id).all()
    if glossary_items or not rebuild:
        return glossary_items

    # On-demand rebuild for recent episodes without glossary
    episodes = (
        db.query(Episode)
        .filter(Episode.user_id == user_id)
        .order_by(Episode.created_at.desc())
        .limit(5)
        .all()
    )
    episode_ids = [ep.id for ep in episodes]
    existing_glossary_episode_ids = set()
    transcripts_by_episode = {}
    if episode_ids:
        existing_glossary_episode_ids = {
            row.episode_id
            for row in db.query(Glossary.episode_id).filter(Glossary.episode_id.in_(episode_ids)).all()
        }
        transcripts = db.query(Transcript).filter(Transcript.episode_id.in_(episode_ids)).all()
        transcripts_by_episode = {t.episode_id: t for t in transcripts}

    llm = LLMClient()
    for ep in episodes:
        if ep.id in existing_glossary_episode_ids:
            continue
        transcript = transcripts_by_episode.get(ep.id)
        if not transcript or not transcript.full_text:
            continue
        try:
            glossary_data = llm.extract_glossary(transcript.full_text)
            for item in glossary_data:
                db.add(Glossary(
                    episode_id=ep.id,
                    term=item.get("term"),
                    definition=item.get("definition"),
                    context_sentence=item.get("context_sentence")
                ))
            db.commit()
        except Exception:
            db.rollback()

    return db.query(Glossary).join(Episode).filter(Episode.user_id == user_id).all()


@router.get("/activity/recent", response_model=List[ActivityMessage])
def recent_activity(db: Session = Depends(get_db), current_user: UserDBModel = Depends(get_current_user)):
    """Get the latest ingestion tasks and their statuses."""
    user_id = current_user.id
    episodes = db.query(Episode).filter(Episode.user_id == user_id).order_by(Episode.created_at.desc()).limit(20).all()
    return [
        ActivityMessage(
            id=ep.id,
            title=ep.title,
            status=ep.status,
            progress=ep.progress,
            updated_at=ep.created_at
        ) for ep in episodes
    ]


@router.get("/knowledge/overview", response_model=List[KnowledgeEpisodeOverview])
def knowledge_overview(db: Session = Depends(get_db), current_user: UserDBModel = Depends(get_current_user)):
    """Aggregated knowledge view grouped by episode."""
    user_id = current_user.id
    from app.models.podcast import Summary

    episodes = (
        db.query(Episode)
        .filter(Episode.user_id == user_id)
        .order_by(Episode.created_at.desc())
        .all()
    )

    episode_ids = [e.id for e in episodes]
    glossary_items = db.query(Glossary).filter(Glossary.episode_id.in_(episode_ids)).all() if episode_ids else []
    summaries = db.query(Summary).filter(Summary.episode_id.in_(episode_ids)).all() if episode_ids else []

    glossary_by_episode = {}
    for item in glossary_items:
        glossary_by_episode.setdefault(item.episode_id, []).append(item)

    summary_by_episode = {s.episode_id: s for s in summaries}

    response = []
    for ep in episodes:
        summary = summary_by_episode.get(ep.id)
        response.append(KnowledgeEpisodeOverview(
            episode_id=ep.id,
            title=ep.title,
            show_name=ep.show_name,
            glossary=glossary_by_episode.get(ep.id, []),
            key_takeaways=summary.key_takeaways if summary and summary.key_takeaways else [],
            key_quotes=summary.key_quotes if summary and summary.key_quotes else [],
        ))
    return response


@router.get("/graph/entities", response_model=List[EntityRead])
def list_entities(limit: int = 50, db: Session = Depends(get_db), current_user: UserDBModel = Depends(get_current_user)):
    """List top entities across the user's library (by total mentions)."""
    user_id = current_user.id
    rows = (
        db.query(
            Entity.id,
            Entity.name,
            Entity.type,
            func.coalesce(func.sum(EpisodeEntity.mention_count), 0).label("mention_count"),
        )
        .join(EpisodeEntity, EpisodeEntity.entity_id == Entity.id)
        .join(Episode, Episode.id == EpisodeEntity.episode_id)
        .filter(Episode.user_id == user_id)
        .group_by(Entity.id, Entity.name, Entity.type)
        .order_by(func.sum(EpisodeEntity.mention_count).desc())
        .limit(limit)
        .all()
    )

    return [
        EntityRead(
            id=row.id,
            name=row.name,
            type=row.type,
            mention_count=int(row.mention_count or 0),
        )
        for row in rows
    ]


@router.get("/graph/entities/{entity_id}/timeline", response_model=List[EntityTimelineItem])
def entity_timeline(entity_id: int, db: Session = Depends(get_db), current_user: UserDBModel = Depends(get_current_user)):
    """Show where an entity appears across episodes with timestamps."""
    user_id = current_user.id
    rows = (
        db.query(
            Episode.id.label("episode_id"),
            Episode.title.label("episode_title"),
            EpisodeEntity.mention_count,
            EpisodeEntity.first_ts,
            EpisodeEntity.last_ts,
        )
        .join(EpisodeEntity, EpisodeEntity.episode_id == Episode.id)
        .filter(Episode.user_id == user_id, EpisodeEntity.entity_id == entity_id)
        .order_by(Episode.created_at.desc())
        .all()
    )

    return [
        EntityTimelineItem(
            episode_id=row.episode_id,
            episode_title=row.episode_title,
            mention_count=int(row.mention_count or 0),
            first_ts=row.first_ts,
            last_ts=row.last_ts,
        )
        for row in rows
    ]


@router.get("/graph/entities/{entity_id}/co_mentions", response_model=List[EntityRelationRead])
def entity_co_mentions(entity_id: int, limit: int = 20, db: Session = Depends(get_db), current_user: UserDBModel = Depends(get_current_user)):
    """Return entities most frequently co-mentioned with the given entity."""
    user_id = current_user.id
    rows = (
        db.query(
            Entity.id.label("entity_id"),
            Entity.name.label("entity_name"),
            Entity.type.label("entity_type"),
            func.coalesce(func.sum(EntityRelation.weight), 0).label("weight"),
        )
        .join(EntityRelation, EntityRelation.target_entity_id == Entity.id)
        .join(Episode, Episode.id == EntityRelation.episode_id)
        .filter(Episode.user_id == user_id, EntityRelation.source_entity_id == entity_id)
        .group_by(Entity.id, Entity.name, Entity.type)
        .order_by(func.sum(EntityRelation.weight).desc())
        .limit(limit)
        .all()
    )

    return [
        EntityRelationRead(
            entity_id=row.entity_id,
            entity_name=row.entity_name,
            entity_type=row.entity_type,
            weight=int(row.weight or 0),
        )
        for row in rows
    ]


@router.get("/graph/full")
def get_full_knowledge_graph(db: Session = Depends(get_db), current_user: UserDBModel = Depends(get_current_user)):
    """Return the complete knowledge graph for the current user's episodes.

    This endpoint returns all entities and their relationships for visualization.
    Useful for building knowledge graph visualizations and exploring cross-episode connections.
    """
    user_id = current_user.id

    # Get all episodes for this user
    user_episode_ids = (
        db.query(Episode.id)
        .filter(Episode.user_id == user_id)
        .all()
    )
    episode_ids = [e.id for e in user_episode_ids]

    if not episode_ids:
        return {"nodes": [], "links": []}

    # Get top entities by mention count across all episodes
    entities = (
        db.query(
            Entity.id,
            Entity.name,
            Entity.type,
            func.sum(EpisodeEntity.mention_count).label("total_mentions")
        )
        .join(EpisodeEntity, Entity.id == EpisodeEntity.entity_id)
        .filter(EpisodeEntity.episode_id.in_(episode_ids))
        .group_by(Entity.id, Entity.name, Entity.type)
        .order_by(func.sum(EpisodeEntity.mention_count).desc())
        .limit(200)  # Limit to prevent UI overload
        .all()
    )

    # Get all relations between these top entities
    entity_ids = {e.id for e in entities}
    relations = (
        db.query(EntityRelation)
        .filter(
            EntityRelation.episode_id.in_(episode_ids),
            EntityRelation.source_entity_id.in_(entity_ids),
            EntityRelation.target_entity_id.in_(entity_ids)
        )
        .all()
    )

    # Relations are stored bidirectionally and per-episode. Collapse to
    # undirected edges, summing weight across directions/episodes, and prune
    # weak edges so the graph is sparse and legible.
    undirected: dict = {}
    for r in relations:
        a, b = sorted((r.source_entity_id, r.target_entity_id))
        if a == b:
            continue
        undirected[(a, b)] = undirected.get((a, b), 0) + int(r.weight or 1)

    links = [
        {"source": a, "target": b, "weight": w}
        for (a, b), w in undirected.items()
        if w >= 2
    ]

    # Drop orphan nodes (no surviving edge) to remove clutter — but if pruning
    # would empty the graph, keep the top entities so the page isn't blank.
    connected = {l["source"] for l in links} | {l["target"] for l in links}
    all_nodes = [
        {"id": e.id, "label": e.name, "type": e.type, "mentions": int(e.total_mentions or 0)}
        for e in entities
    ]
    nodes = [n for n in all_nodes if n["id"] in connected] if links else all_nodes
    if not nodes:
        nodes = all_nodes

    return {
        "nodes": nodes,
        "links": links,
        "stats": {
            "total_nodes": len(nodes),
            "total_links": len(links),
            "user_id": user_id
        }
    }


class AskRequest(BaseModel):
    message: str
    lang: str | None = None


@router.post("/ask/stream")
def ask_library_stream(
    payload: AskRequest,
    db: Session = Depends(get_db),
    current_user: UserDBModel = Depends(get_current_user),
):
    """Stream a library-wide chat answer (SSE). Searches across all of the
    user's completed episodes and cites episode + timestamp."""
    from app.services.chat import ChatService

    def event_generator():
        try:
            chat_service = ChatService(db)
            for ev in chat_service.process_library_stream(
                user_id=current_user.id, message=payload.message, lang=payload.lang
            ):
                yield f"data: {_json.dumps(ev)}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            print(f"Library ask error: {e}")
            yield f"data: {_json.dumps({'type': 'error', 'message': 'Ask failed'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )
