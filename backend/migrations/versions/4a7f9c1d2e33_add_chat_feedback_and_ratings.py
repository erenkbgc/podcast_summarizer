"""add chat feedback and ratings

Revision ID: 4a7f9c1d2e33
Revises: 8f3a21bd9c6e
Create Date: 2026-02-21 00:00:02
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "4a7f9c1d2e33"
down_revision: Union[str, Sequence[str], None] = "8f3a21bd9c6e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("chat_conversations", sa.Column("rating", sa.Integer(), nullable=True))
    op.add_column("chat_messages", sa.Column("thumbs_rating", sa.Integer(), nullable=True))
    op.add_column("chat_messages", sa.Column("citation_feedback", sa.JSON(), nullable=True))
    op.add_column("chat_messages", sa.Column("relevance_rating", sa.Integer(), nullable=True))
    op.add_column("chat_messages", sa.Column("feedback_text", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("chat_messages", "feedback_text")
    op.drop_column("chat_messages", "relevance_rating")
    op.drop_column("chat_messages", "citation_feedback")
    op.drop_column("chat_messages", "thumbs_rating")
    op.drop_column("chat_conversations", "rating")
