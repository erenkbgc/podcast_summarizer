from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import Any
import datetime
import json
import asyncio
from collections import Counter

from app.api.v1.deps import get_db, get_current_user
from app.models.podcast import User, Episode, Summary
from app.schemas.user import UserProfile, UserStats
from app.services.llm_client import LLMClient
from app.core.config import settings

router = APIRouter()

@router.get("/me", response_model=UserProfile)
async def get_my_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    # 1. Fetch episodes
    episodes = (
        db.query(Episode)
        .options(joinedload(Episode.podcast))
        .filter(Episode.user_id == current_user.id)
        .all()
    )
    total_episodes = len(episodes)
    
    # 2. Calculate stats
    # Assume average episode length is 45 mins if not tracked (we don't have duration in model yet, but let's estimate or check if we can add it)
    total_hours = total_episodes * 0.75 # Placeholder
    
    # 3. Gather topics and takeaways for AI bio
    summaries = db.query(Summary).join(Episode).filter(Episode.user_id == current_user.id).all()

    all_topics = []
    summary_topic_counts = Counter()
    for s in summaries:
        if s.topics:
            for t in s.topics:
                label = t.get("label", "Generic")
                all_topics.append(label)
                summary_topic_counts[label] += 1

    # 3b. Primary category signal from podcast tags
    tag_counts = Counter()
    for ep in episodes:
        if not ep.podcast:
            continue
        tags = ep.podcast.tags or []
        if not isinstance(tags, list):
            continue
        for tag in tags:
            if not isinstance(tag, dict):
                continue
            # Prefer broad group for "podcast type"; fallback to label.
            group = str(tag.get("group") or "").strip()
            label = str(tag.get("label") or "").strip()
            key = group or label
            if key:
                tag_counts[key] += 1

    # Fallback to summary topics if tags are missing for old data.
    profile_counts = tag_counts if tag_counts else summary_topic_counts
    top_categories = [cat for cat, _ in profile_counts.most_common(5)]
    
    # Calculate episodes per week
    if total_episodes > 0:
        oldest_ep = min(e.created_at for e in episodes)
        days_since = (datetime.datetime.now(datetime.timezone.utc) - oldest_ep.replace(tzinfo=datetime.timezone.utc)).days
        weeks = max(1, days_since / 7)
        avg_per_week = total_episodes / weeks
    else:
        avg_per_week = 0

    # 4. Generate fallback bio quickly (don't block on LLM)
    bio = "Starting your intelligence journey..."
    persona_title = "New Listener"

    if total_episodes > 0 and top_categories:
        # Fast fallback: no LLM call, just use categories
        persona_title = f"{top_categories[0]} Enthusiast"
        bio = f"A dedicated listener focused on {', '.join(top_categories[:3])}."

    stats = UserStats(
        total_episodes=total_episodes,
        total_hours=total_hours,
        top_topics=[{"label": k, "value": v} for k, v in profile_counts.most_common(8)],
        avg_episodes_per_week=avg_per_week,
        consistency_score=min(100, (avg_per_week * 20))
    )

    return UserProfile(
        id=current_user.id,
        username=current_user.username,
        bio=bio,
        stats=stats,
        persona_title=persona_title,
        top_categories=top_categories,
        last_active=datetime.datetime.now()
    )
