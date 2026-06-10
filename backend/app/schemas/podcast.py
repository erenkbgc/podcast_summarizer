from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Optional, List, Dict, Any

from datetime import datetime

class PodcastIngest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    url: str = Field(min_length=8, max_length=2048)
    preferred_lang: Optional[str] = Field(default="en", pattern=r"^[a-z]{2}(-[A-Z]{2})?$")
    summary_type: Optional[str] = "default" # default, technical, conversational, executive

    @field_validator("summary_type")
    @classmethod
    def validate_summary_type(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        allowed = {"default", "technical", "conversational", "executive"}
        normalized = value.strip().lower()
        if normalized not in allowed:
            raise ValueError(f"summary_type must be one of: {', '.join(sorted(allowed))}")
        return normalized

class PodcastTagItem(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    label: str = Field(min_length=1, max_length=50)
    group: Optional[str] = None

class PodcastTagsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tags: List[PodcastTagItem]

class EpisodeBase(BaseModel):
    title: str
    show_name: str
    status: str
    progress: float
    image_url: Optional[str] = None
    speaker_map: Optional[Dict[str, str]] = None
    user_id: Optional[str] = None
    podcast_id: Optional[int] = None
    source_key: Optional[str] = None
    podcast_tags: Optional[List[Dict[str, Any]]] = None
    preferred_lang: Optional[str] = "en"
    summary_type: Optional[str] = "default"
    created_at: Optional[datetime] = None


class EpisodeRead(EpisodeBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

class EpisodeLibraryRead(BaseModel):
    id: int
    title: str
    show_name: str
    status: str
    progress: float
    image_url: Optional[str] = None
    created_at: datetime
    podcast_tags: Optional[List[Dict[str, Any]]] = None
    preferred_lang: Optional[str] = "en"

    class Config:
        from_attributes = True

class SummaryRead(BaseModel):
    id: int
    episode_id: int
    global_summary: str
    executive_brief: Optional[str] = None
    action_items: List[str]

    key_takeaways: List[str]
    key_quotes: Optional[List[Dict[str, Any]]] = None
    suggested_questions: List[str]
    speaker_contribution: Optional[Dict[str, float]] = None
    topics: Optional[List[Dict[str, Any]]] = None
    insight_attribution: Optional[List[Dict[str, Any]]] = None
    insight_density: Optional[str] = None
    timeline_density: Optional[List[Dict[str, Any]]] = None
    word_cloud_data: Optional[List[Dict[str, Any]]] = None
    insight_timeline: Optional[List[Dict[str, Any]]] = None
    topic_transitions: Optional[List[Dict[str, Any]]] = None
    claim_checks: Optional[List[Dict[str, Any]]] = None
    persona_summaries: Optional[Dict[str, str]] = None
    persona_summary: Optional[str] = None
    summary_layers: Optional[Dict[str, Any]] = None
    perspective_summaries: Optional[Dict[str, str]] = None
    high_value_moments: Optional[List[Dict[str, Any]]] = None
    categorized_insights: Optional[Dict[str, List[str]]] = None
    conversation_flow: Optional[Dict[str, Any]] = None
    structured_notes: Optional[List[Dict[str, Any]]] = None
    action_items_structured: Optional[List[Dict[str, Any]]] = None

    class Config:
        from_attributes = True

class ChapterRead(BaseModel):
    id: int
    episode_id: int
    timestamp: float
    title: str
    summary: Optional[str] = None
    is_main: Optional[int] = None

    class Config:
        from_attributes = True

class JobStatus(BaseModel):
    job_id: int
    status: str
    progress: float
    message: Optional[str] = None

class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    role: str = Field(pattern=r"^(user|assistant)$")
    content: str = Field(min_length=1, max_length=4000)

class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    message: str = Field(min_length=1, max_length=4000)
    history: Optional[List[ChatMessage]] = []
    mode: str = Field(
        default="assistant",
        pattern=r"^(assistant|socratic|devil_advocate|researcher|debate|storyteller|teacher|fact_checker|casual)$",
    )
    context_snapshot: Optional[Dict[str, Any]] = None
    lang: Optional[str] = Field(default=None, pattern=r"^[a-z]{2}(-[A-Z]{2})?$")

class ChatAction(BaseModel):
    type: str  # seek, save_insight, create_note, search, compare_episodes
    label: str
    metadata: Dict[str, Any]

class ChatResponse(BaseModel):
    response: str
    actions: List[ChatAction] = []
    sources: List[Dict[str, Any]] = []
    reasoning_trace: List[Dict[str, Any]] = []
    mode: str

class ChatSuggestion(BaseModel):
    text: str
    context: str
    icon: str

class ChatConversationRead(BaseModel):
    id: int
    topic: Optional[str]
    mode: str
    rating: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class ChatMessageRead(BaseModel):
    id: int
    user_message: str
    ai_response: str
    actions: Optional[List[ChatAction]] = None
    timestamp_in_episode: Optional[float] = None
    thumbs_rating: Optional[int] = None
    relevance_rating: Optional[int] = None
    citation_feedback: Optional[Dict[str, Any]] = None
    reasoning_trace: Optional[List[Dict[str, Any]]] = None
    created_at: datetime
    
    class Config:
        from_attributes = True

class SearchResult(BaseModel):
    episode_id: int
    episode_title: str
    text: str
    timestamp: float

class GlossaryRead(BaseModel):
    id: int
    episode_id: int
    term: str
    definition: str
    context_sentence: str

    class Config:
        from_attributes = True

class QuizRead(BaseModel):
    id: int
    episode_id: int
    question: str
    options: List[str]
    correct_answer: str
    explanation: str
    source_start: Optional[float] = None
    source_end: Optional[float] = None
    source_text: Optional[str] = None

    class Config:
        from_attributes = True

class ActivityMessage(BaseModel):
    id: int
    title: str
    status: str
    progress: float
    updated_at: datetime


class EntityRead(BaseModel):
    id: int
    name: str
    type: str
    mention_count: int

    class Config:
        from_attributes = True


class EntityTimelineItem(BaseModel):
    episode_id: int
    episode_title: str
    mention_count: int
    first_ts: Optional[float] = None
    last_ts: Optional[float] = None


class EntityRelationRead(BaseModel):
    entity_id: int
    entity_name: str
    entity_type: str
    weight: int


class KnowledgeEpisodeOverview(BaseModel):
    episode_id: int
    title: str
    show_name: Optional[str] = None
    glossary: List[GlossaryRead] = []
    key_takeaways: List[str] = []
    key_quotes: List[Dict[str, Any]] = []

    class Config:
        from_attributes = True


class ChatFeedbackWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message_id: int
    thumbs_rating: Optional[int] = Field(default=None, ge=-1, le=1)
    relevance_rating: Optional[int] = Field(default=None, ge=1, le=5)
    citation_helpful: Optional[bool] = None
    citation_notes: Optional[str] = Field(default=None, max_length=500)
    feedback_text: Optional[str] = Field(default=None, max_length=1000)


class ConversationRatingWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    conversation_id: int
    rating: int = Field(ge=1, le=5)
