"""add entities graph tables

Revision ID: 4f2b9a6d1e7c
Revises: 3b4e2c1d7a8f
Create Date: 2026-02-04 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "4f2b9a6d1e7c"
down_revision = "3b4e2c1d7a8f"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "entities",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), index=True, nullable=False),
        sa.Column("type", sa.String(), index=True, nullable=False),
        sa.Column("embedding", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "episode_entities",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("episode_id", sa.Integer(), sa.ForeignKey("episodes.id"), nullable=False),
        sa.Column("entity_id", sa.Integer(), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("mention_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("first_ts", sa.Float(), nullable=True),
        sa.Column("last_ts", sa.Float(), nullable=True),
    )

    op.create_table(
        "entity_relations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("episode_id", sa.Integer(), sa.ForeignKey("episodes.id"), nullable=False),
        sa.Column("source_entity_id", sa.Integer(), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("target_entity_id", sa.Integer(), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("relation_type", sa.String(), nullable=False, server_default="co_mentioned"),
        sa.Column("weight", sa.Integer(), nullable=False, server_default="1"),
    )


def downgrade():
    op.drop_table("entity_relations")
    op.drop_table("episode_entities")
    op.drop_table("entities")
