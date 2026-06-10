"""add key_quotes to summaries

Revision ID: 1f5f3b6a9d12
Revises: 11643bf85de7
Create Date: 2026-02-02
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "1f5f3b6a9d12"
down_revision = "11643bf85de7"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("summaries", sa.Column("key_quotes", sa.JSON(), nullable=True))


def downgrade():
    op.drop_column("summaries", "key_quotes")
