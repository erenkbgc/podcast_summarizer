from sqlalchemy import create_engine, text
from app.core.config import settings
from app.db.session import Base
from app.models.podcast import User, Episode # Import models to register them with Base

engine = create_engine(settings.DATABASE_URL)

def init_db():
    print("Initializing database...")
    # Create tables that don't exist
    Base.metadata.create_all(bind=engine)
    
    # Add columns manually if they are missing (simple migration)
    with engine.connect() as conn:
        # User table
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN username VARCHAR"))
            conn.execute(text("ALTER TABLE users ADD COLUMN hashed_password VARCHAR"))
            conn.commit()
            print("Updated users table")
        except Exception:
            pass # Already exists or table not ready
            
        # Episode table
        try:
            conn.execute(text("ALTER TABLE episodes ADD COLUMN preferred_lang VARCHAR DEFAULT 'en'"))
            conn.execute(text("ALTER TABLE episodes ADD COLUMN summary_type VARCHAR DEFAULT 'default'"))
            conn.commit()
            print("Updated episodes table")
        except Exception:
            pass # Already exists

if __name__ == "__main__":
    init_db()
