"""
Database initialization script.
Run this to create all tables.
"""
from app.db.session import engine, Base
from app.models.podcast import Episode, Transcript, Summary, Chapter, Glossary, Quiz, QuizAttempt, Entity, EpisodeEntity, EntityRelation

def init_db():
    """Create all database tables."""
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables created successfully!")

if __name__ == "__main__":
    init_db()
