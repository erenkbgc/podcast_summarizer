"""add chapter end timestamp

Revision ID: 5d9b2c8a1f0e
Revises: 4a7f9c1d2e33
Create Date: 2026-06-10 21:45:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "5d9b2c8a1f0e"
down_revision: Union[str, Sequence[str], None] = "4a7f9c1d2e33"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("chapters", sa.Column("end_timestamp", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("chapters", "end_timestamp")
