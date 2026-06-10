"""add podcast tags

Revision ID: 9a2f1c7b4d3e
Revises: 6c1a4b7d9e2f
Create Date: 2026-02-04 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "9a2f1c7b4d3e"
down_revision = "6c1a4b7d9e2f"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("podcasts", sa.Column("tags", sa.JSON(), nullable=True))


def downgrade():
    op.drop_column("podcasts", "tags")
