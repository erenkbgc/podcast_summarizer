"""merge_heads

Revision ID: 1036a7f6a33f
Revises: 6c1a4b7d9e2f, b8cd4fbef1ac
Create Date: 2026-02-04 01:29:32.085873

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1036a7f6a33f'
down_revision: Union[str, Sequence[str], None] = ('6c1a4b7d9e2f', 'b8cd4fbef1ac')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
