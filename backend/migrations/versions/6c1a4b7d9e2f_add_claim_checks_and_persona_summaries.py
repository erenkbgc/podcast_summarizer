"""add claim checks and persona summaries

Revision ID: 6c1a4b7d9e2f
Revises: 4f2b9a6d1e7c
Create Date: 2026-02-04 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "6c1a4b7d9e2f"
down_revision = "4f2b9a6d1e7c"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("summaries", sa.Column("claim_checks", sa.JSON(), nullable=True))
    op.add_column("summaries", sa.Column("persona_summaries", sa.JSON(), nullable=True))


def downgrade():
    op.drop_column("summaries", "persona_summaries")
    op.drop_column("summaries", "claim_checks")
