from sqlalchemy import Column, Integer, String, DateTime, JSON, ForeignKey, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, nullable=True)
    hashed_password = Column(String, nullable=True) # Optional if we keep anonymous login
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    episodes = relationship("Episode", back_populates="user")


class Podcast(Base):
    __tablename__ = "podcasts"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    rss_url = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    tags = Column(JSON) # [{"label": "finance", "group": "business"}, ...]
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    episodes = relationship("Episode", back_populates="podcast")


class Episode(Base):
    __tablename__ = "episodes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), index=True)
    podcast_id = Column(Integer, ForeignKey("podcasts.id"), index=True)
    title = Column(String, index=True)
    show_name = Column(String, index=True)
    source_url = Column(String, index=True)
    source_guid = Column(String, nullable=True, index=True)
    source_key = Column(String, index=True)
    image_url = Column(String)
    local_path = Column(String)
    status = Column(String, default="pending") 
    progress = Column(Float, default=0.0)
    preferred_lang = Column(String, default="en")
    summary_type = Column(String, default="default") # default, technical, conversational, executive
    speaker_map = Column(JSON) # {"SPEAKER_00": "Name", ...}
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="episodes")
    podcast = relationship("Podcast", back_populates="episodes")

    transcript = relationship("Transcript", back_populates="episode", uselist=False)
    summary = relationship("Summary", back_populates="episode", uselist=False)
    chapters = relationship("Chapter", back_populates="episode")
    glossary = relationship("Glossary", back_populates="episode")
    quizzes = relationship("Quiz", back_populates="episode")
    entity_links = relationship("EpisodeEntity", back_populates="episode")

    @property
    def podcast_tags(self):
        return self.podcast.tags if self.podcast else []

class Transcript(Base):
    __tablename__ = "transcripts"

    id = Column(Integer, primary_key=True, index=True)
    episode_id = Column(Integer, ForeignKey("episodes.id"))
    raw_json = Column(JSON)
    full_text = Column(String)

    episode = relationship("Episode", back_populates="transcript")

class Summary(Base):
    __tablename__ = "summaries"

    id = Column(Integer, primary_key=True, index=True)
    episode_id = Column(Integer, ForeignKey("episodes.id"))
    global_summary = Column(String)
    action_items = Column(JSON) # List of strings
    key_takeaways = Column(JSON) # List of strings
    key_quotes = Column(JSON) # List of {"text": "...", "timestamp": 123.4}
    suggested_questions = Column(JSON) # List of 3 strings
    speaker_contribution = Column(JSON) # {"Name": 65, ...}
    topics = Column(JSON) # [{"label": "Name", "value": 40}, ...]
    insight_attribution = Column(JSON) # [{"insight": "...", "speaker": "..."}]
    insight_density = Column(String) # High, Medium, Light
    executive_brief = Column(String) # Short mental snapshot (max 8 lines)
    timeline_density = Column(JSON) # List of {"time": 0, "value": 0.5} points
    word_cloud_data = Column(JSON) # List of {"text": "AI", "value": 50}
    insight_timeline = Column(JSON) # List of {"time": 0, "insight_count": 2} - insights per time bucket
    topic_transitions = Column(JSON) # List of {"start": 0, "end": 120, "topic": "Macro", "color": "#3E5BFF"}
    claim_checks = Column(JSON) # List of {"claim": "...", "status": "...", "confidence": 0.0, "sources": [...]}
    persona_summaries = Column(JSON) # {"investor": "...", "skeptic": "..."}
    summary_layers = Column(JSON)  # {"level_1_tldr": "...", "level_2_exec": "...", "level_3_outline": [...], "level_4_notes": [...]}
    perspective_summaries = Column(JSON)  # {"business": "...", "technical": "...", "personal_development": "...", "investor": "..."}
    high_value_moments = Column(JSON)  # [{"type": "...", "timestamp": 12.3, "reason": "...", "intensity": 0.9}]
    categorized_insights = Column(JSON)  # {"core_concepts": [...], "surprising_facts": [...], ...}
    conversation_flow = Column(JSON)  # {"qa_patterns": [...], "debate_structures": [...], "power_dynamics": "..."}
    structured_notes = Column(JSON)  # full structured notes blocks
    action_items_structured = Column(JSON)  # [{"text":"...","priority":"...","owner":"...","timeline":"...","explicitness":"..."}]


    episode = relationship("Episode", back_populates="summary")


class Chapter(Base):
    __tablename__ = "chapters"

    id = Column(Integer, primary_key=True, index=True)
    episode_id = Column(Integer, ForeignKey("episodes.id"))
    timestamp = Column(Float)
    end_timestamp = Column(Float)
    title = Column(String)
    description = Column(String)
    summary = Column(String)
    is_main = Column(Integer, default=1)

    episode = relationship("Episode", back_populates="chapters")

class Glossary(Base):
    __tablename__ = "glossary"

    id = Column(Integer, primary_key=True, index=True)
    episode_id = Column(Integer, ForeignKey("episodes.id"))
    term = Column(String, index=True)
    definition = Column(String)
    context_sentence = Column(String)

    episode = relationship("Episode", back_populates="glossary")

class Quiz(Base):
    __tablename__ = "quizzes"

    id = Column(Integer, primary_key=True, index=True)
    episode_id = Column(Integer, ForeignKey("episodes.id"))
    question = Column(String)
    options = Column(JSON) # List of strings
    correct_answer = Column(String)
    explanation = Column(String)
    question_type = Column(String, nullable=True) # factual, analytical, etc.
    difficulty = Column(String, nullable=True) # easy, medium, hard
    source_start = Column(Float, nullable=True)
    source_end = Column(Float, nullable=True)
    source_text = Column(String, nullable=True)

    episode = relationship("Episode", back_populates="quizzes")

class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id = Column(Integer, primary_key=True, index=True)
    quiz_id = Column(Integer, ForeignKey("quizzes.id"))
    user_id = Column(String) 
    user_answer = Column(String)
    is_correct = Column(Integer) 
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Entity(Base):
    __tablename__ = "entities"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    type = Column(String, index=True)  # person, org, product, concept
    embedding = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    episode_links = relationship("EpisodeEntity", back_populates="entity")
    outgoing_relations = relationship("EntityRelation", foreign_keys="EntityRelation.source_entity_id", back_populates="source_entity")
    incoming_relations = relationship("EntityRelation", foreign_keys="EntityRelation.target_entity_id", back_populates="target_entity")


class EpisodeEntity(Base):
    __tablename__ = "episode_entities"

    id = Column(Integer, primary_key=True, index=True)
    episode_id = Column(Integer, ForeignKey("episodes.id"))
    entity_id = Column(Integer, ForeignKey("entities.id"))
    mention_count = Column(Integer, default=1)
    first_ts = Column(Float, nullable=True)
    last_ts = Column(Float, nullable=True)

    episode = relationship("Episode", back_populates="entity_links")
    entity = relationship("Entity", back_populates="episode_links")


class EntityRelation(Base):
    __tablename__ = "entity_relations"

    id = Column(Integer, primary_key=True, index=True)
    episode_id = Column(Integer, ForeignKey("episodes.id"))
    source_entity_id = Column(Integer, ForeignKey("entities.id"))
    target_entity_id = Column(Integer, ForeignKey("entities.id"))
    relation_type = Column(String, default="co_mentioned")
    weight = Column(Integer, default=1)

    episode = relationship("Episode")
    source_entity = relationship("Entity", foreign_keys=[source_entity_id], back_populates="outgoing_relations")
    target_entity = relationship("Entity", foreign_keys=[target_entity_id], back_populates="incoming_relations")


# ============ CHAT SYSTEM ============

class ChatConversation(Base):
    """Persisted conversation thread per episode"""
    __tablename__ = "chat_conversations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), index=True)
    episode_id = Column(Integer, ForeignKey("episodes.id"), index=True)
    topic = Column(String, nullable=True)  # Inferred topic/subject
    mode = Column(String, default="assistant")  # assistant, socratic, devil_advocate, researcher
    rating = Column(Integer, nullable=True)  # 1-5 conversation quality rating
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User")
    episode = relationship("Episode")
    messages = relationship("ChatMessage", back_populates="conversation")


class ChatMessage(Base):
    """Individual chat message with context"""
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("chat_conversations.id"), index=True)
    user_id = Column(String, ForeignKey("users.id"), index=True)
    episode_id = Column(Integer, ForeignKey("episodes.id"), index=True)
    
    # Core content
    user_message = Column(String)  # User's question/statement
    ai_response = Column(String)  # AI's response
    
    # Context snapshot
    context_snapshot = Column(JSON)  # { episode_id, timestamp, selectedText, etc }
    timestamp_in_episode = Column(Float, nullable=True)  # Where in the audio they were
    
    # Semantic embeddings for search
    user_embedding = Column(JSON, nullable=True)  # Vector embedding of user message
    response_embedding = Column(JSON, nullable=True)  # Vector embedding of AI response
    
    # Extracted intelligence
    insights_extracted = Column(JSON, nullable=True)  # Auto-extracted insights from this exchange
    actions_generated = Column(JSON, nullable=True)  # Action buttons/suggestions
    thumbs_rating = Column(Integer, nullable=True)  # -1, 0, 1
    citation_feedback = Column(JSON, nullable=True)  # {"helpful": true, "notes": "..."}
    relevance_rating = Column(Integer, nullable=True)  # 1-5
    feedback_text = Column(String, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    conversation = relationship("ChatConversation", back_populates="messages")
    user = relationship("User")
    episode = relationship("Episode")


class ChatExchange(Base):
    """Searchable chat history for cross-episode learning"""
    __tablename__ = "chat_exchanges"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), index=True)
    episode_id = Column(Integer, ForeignKey("episodes.id"), index=True)
    
    user_message = Column(String)
    ai_response = Column(String)
    
    # Semantic vectors for similarity search
    user_embedding = Column(JSON, nullable=True)
    response_embedding = Column(JSON, nullable=True)
    
    # Context
    context_snapshot = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    user = relationship("User")
    episode = relationship("Episode")
