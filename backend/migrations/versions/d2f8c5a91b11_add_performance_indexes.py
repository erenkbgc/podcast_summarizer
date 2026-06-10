"""add performance indexes

Revision ID: d2f8c5a91b11
Revises: 436ddd51bbaf, 9a2f1c7b4d3e
Create Date: 2026-02-21 00:00:00
"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "d2f8c5a91b11"
down_revision: Union[str, Sequence[str], None] = ("436ddd51bbaf", "9a2f1c7b4d3e")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Episodes
    op.create_index("ix_episodes_user_created_at", "episodes", ["user_id", "created_at"], unique=False)
    op.create_index("ix_episodes_user_status_created_at", "episodes", ["user_id", "status", "created_at"], unique=False)
    op.create_index("ix_episodes_user_source_key", "episodes", ["user_id", "source_key"], unique=False)

    # Per-episode content tables
    op.create_index("ix_transcripts_episode_id", "transcripts", ["episode_id"], unique=False)
    op.create_index("ix_summaries_episode_id", "summaries", ["episode_id"], unique=False)
    op.create_index("ix_chapters_episode_timestamp", "chapters", ["episode_id", "timestamp"], unique=False)
    op.create_index("ix_glossary_episode_term", "glossary", ["episode_id", "term"], unique=False)
    op.create_index("ix_quizzes_episode_id", "quizzes", ["episode_id"], unique=False)

    # Graph/search support
    op.create_index("ix_episode_entities_episode_entity", "episode_entities", ["episode_id", "entity_id"], unique=False)
    op.create_index("ix_entity_relations_episode_source_target", "entity_relations", ["episode_id", "source_entity_id", "target_entity_id"], unique=False)

    # Chat
    op.create_index("ix_chat_messages_episode_created_at", "chat_messages", ["episode_id", "created_at"], unique=False)
    op.create_index("ix_chat_exchanges_user_episode_created_at", "chat_exchanges", ["user_id", "episode_id", "created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_chat_exchanges_user_episode_created_at", table_name="chat_exchanges")
    op.drop_index("ix_chat_messages_episode_created_at", table_name="chat_messages")
    op.drop_index("ix_entity_relations_episode_source_target", table_name="entity_relations")
    op.drop_index("ix_episode_entities_episode_entity", table_name="episode_entities")
    op.drop_index("ix_quizzes_episode_id", table_name="quizzes")
    op.drop_index("ix_glossary_episode_term", table_name="glossary")
    op.drop_index("ix_chapters_episode_timestamp", table_name="chapters")
    op.drop_index("ix_summaries_episode_id", table_name="summaries")
    op.drop_index("ix_transcripts_episode_id", table_name="transcripts")
    op.drop_index("ix_episodes_user_source_key", table_name="episodes")
    op.drop_index("ix_episodes_user_status_created_at", table_name="episodes")
    op.drop_index("ix_episodes_user_created_at", table_name="episodes")
