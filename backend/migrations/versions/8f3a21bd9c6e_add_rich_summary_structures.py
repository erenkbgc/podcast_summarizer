"""add rich summary structures

Revision ID: 8f3a21bd9c6e
Revises: d2f8c5a91b11
Create Date: 2026-02-21 00:00:01
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "8f3a21bd9c6e"
down_revision: Union[str, Sequence[str], None] = "d2f8c5a91b11"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("summaries", sa.Column("summary_layers", sa.JSON(), nullable=True))
    op.add_column("summaries", sa.Column("perspective_summaries", sa.JSON(), nullable=True))
    op.add_column("summaries", sa.Column("high_value_moments", sa.JSON(), nullable=True))
    op.add_column("summaries", sa.Column("categorized_insights", sa.JSON(), nullable=True))
    op.add_column("summaries", sa.Column("conversation_flow", sa.JSON(), nullable=True))
    op.add_column("summaries", sa.Column("structured_notes", sa.JSON(), nullable=True))
    op.add_column("summaries", sa.Column("action_items_structured", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("summaries", "action_items_structured")
    op.drop_column("summaries", "structured_notes")
    op.drop_column("summaries", "conversation_flow")
    op.drop_column("summaries", "categorized_insights")
    op.drop_column("summaries", "high_value_moments")
    op.drop_column("summaries", "perspective_summaries")
    op.drop_column("summaries", "summary_layers")
