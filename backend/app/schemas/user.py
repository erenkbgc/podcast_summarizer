from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime

class UserStats(BaseModel):
    total_episodes: int
    total_hours: float
    top_topics: List[Dict[str, Any]]
    avg_episodes_per_week: float
    consistency_score: float # 1-100

class UserProfile(BaseModel):
    id: str
    username: str
    bio: str # AI generated "About Me"
    stats: UserStats
    persona_title: str # e.g. "Neural Architect", "Strategy Maestro"
    top_categories: List[str]
    last_active: datetime

class ProfileUpdate(BaseModel):
    # For future customization
    custom_bio: Optional[str] = None
