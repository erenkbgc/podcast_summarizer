"""add quiz source fields

Revision ID: 3b4e2c1d7a8f
Revises: 2c7e6b3c4f9a
Create Date: 2026-02-02
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "3b4e2c1d7a8f"
down_revision = "2c7e6b3c4f9a"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("quizzes", sa.Column("source_start", sa.Float(), nullable=True))
    op.add_column("quizzes", sa.Column("source_end", sa.Float(), nullable=True))
    op.add_column("quizzes", sa.Column("source_text", sa.String(), nullable=True))


def downgrade():
    op.drop_column("quizzes", "source_text")
    op.drop_column("quizzes", "source_end")
    op.drop_column("quizzes", "source_start")
